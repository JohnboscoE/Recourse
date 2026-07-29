import { Hono } from "hono";
import { cors } from "hono/cors";
import { readConfig, type Env } from "./env.js";
import { listJobs, getJobView, getBalances, resolveJob, postJob, runAgent, sweep } from "./jobs.js";
import { getExecution } from "./keeperhub.js";
import { since, latestSeq, logAndTrim } from "./eventlog.js";
import { readJob } from "./chain.js";

/**
 * Recourse API on Cloudflare Workers.
 *
 * Same surface as the Node backend, with three runtime differences that are
 * forced by the platform rather than chosen:
 *
 *  - Hono instead of Fastify (Workers speak fetch, not node:http).
 *  - Automatic settlement runs from a Cron Trigger instead of setInterval,
 *    because nothing stays alive between requests. One-minute granularity
 *    rather than thirty seconds.
 *  - The event log lives in D1 instead of a module-level array, because
 *    isolates are ephemeral and would each hold a different history.
 *
 * Long work (posting, running an agent) is handed to ctx.waitUntil so the
 * response returns immediately and the isolate is not killed mid-execution.
 */

const app = new Hono<{ Bindings: Env }>();

/**
 * Launch background work so that failures are visible.
 *
 * `waitUntil` swallows rejections: a throw inside the task disappears with no
 * log line, no error, and nothing on screen — the request already returned 200.
 * That produced jobs that sat Open with `agent = 0x0` and an empty log, looking
 * for all the world like the button did nothing.
 *
 * The Node backend has always caught and logged here. The port lost it; this
 * restores parity.
 */
function background(
  ctx: { waitUntil(p: Promise<unknown>): void },
  env: Env,
  jobId: string | undefined,
  phase: string,
  work: Promise<unknown>,
) {
  ctx.waitUntil(
    work.catch((err) =>
      logAndTrim(env, {
        level: "error",
        jobId,
        phase,
        message: String(err instanceof Error ? err.message : err).slice(0, 500),
      }).catch(() => {
        // If even the log write fails there is nowhere left to report it.
        console.error(`${phase} failed`, err);
      }),
    ),
  );
}

// BigInt is not JSON-serialisable; render as strings like the Node backend.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

app.use("*", async (c, next) => {
  const allowed = readConfig(c.env).corsOrigins;
  return cors({
    origin: allowed.length > 0 ? allowed : "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
  })(c, next);
});

/**
 * Errors as JSON, matching the Node backend.
 *
 * Hono's default is a bare "Internal Server Error" body, which tells a caller
 * — and an operator reading logs — nothing at all. Chain reads and KeeperHub
 * calls are the things that fail here, and their messages are the diagnosis.
 */
app.onError((err, c) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("request failed", message);
  return c.json({ error: message.slice(0, 600) }, 500);
});

app.get("/health", (c) => c.json({ ok: true, service: "recourse-worker" }));

app.get("/config", (c) => {
  const cfg = readConfig(c.env);
  return c.json({
    escrowAddress: cfg.escrowAddress,
    chainId: 8453,
    explorer: "https://basescan.org",
    keeperHubWallet: cfg.keeperHubWallet,
    // Cron-driven here; the interval is declared in wrangler.toml.
    autoSettle: true,
    autoSettleMs: 60_000,
  });
});

app.get("/balances", async (c) => c.json(await getBalances(c.env)));

app.get("/jobs", async (c) => c.json({ jobs: await listJobs(c.env) }));

app.get("/jobs/:jobId", async (c) => {
  const id = BigInt(c.req.param("jobId"));
  const job = await readJob(c.env, id);
  let audit = null;
  if (job.executionRef) {
    audit = await getExecution(c.env, job.executionRef).catch(() => null);
  }
  return c.json({ job: await getJobView(c.env, id), audit });
});

app.post("/jobs", async (c) => {
  const body = await c.req.json<{
    subject?: string;
    minIncrease?: string;
    payment?: string;
    deadlineMins?: number;
  }>();

  const { subject, minIncrease, payment, deadlineMins = 30 } = body ?? {};
  if (!subject || !/^0x[a-fA-F0-9]{40}$/.test(subject)) {
    return c.json({ error: "subject must be a 0x address" }, 400);
  }
  if (!minIncrease || !payment) {
    return c.json({ error: "minIncrease and payment are required" }, 400);
  }

  background(
    c.executionCtx,
    c.env,
    undefined,
    "post",
    postJob(c.env, { subject, minIncrease, payment, deadlineMins }),
  );
  return c.json({ started: true, sinceSeq: await latestSeq(c.env) });
});

app.post("/jobs/:jobId/work", async (c) => {
  const id = BigInt(c.req.param("jobId"));
  const body = await c.req
    .json<{ mode?: "honest" | "fail" }>()
    .catch(() => ({}) as { mode?: "honest" | "fail" });
  const mode = body.mode === "fail" ? "fail" : "honest";

  background(c.executionCtx, c.env, id.toString(), "work", runAgent(c.env, id, mode));
  return c.json({ started: true, sinceSeq: await latestSeq(c.env) });
});

app.post("/jobs/:jobId/resolve", async (c) => {
  const id = BigInt(c.req.param("jobId"));
  const dryRun = ["1", "true"].includes(c.req.query("dryRun") ?? "");

  /**
   * Always log the decision, including "wait" and dry runs.
   *
   * Previously a dry run returned inline and a "wait" settlement returned
   * early, both without writing anything. Clicking Dry run or Settle on a job
   * that is not yet due therefore produced no visible output at all — which is
   * indistinguishable from the button being broken.
   */
  if (dryRun) {
    const report = await resolveJob(c.env, id, { dryRun: true });
    await logAndTrim(c.env, {
      level: "info",
      jobId: id.toString(),
      phase: "dry-run",
      message: `would ${report.decision.action.toUpperCase()} — ${report.decision.reason}`,
    });
    return c.json(report);
  }

  background(
    c.executionCtx,
    c.env,
    id.toString(),
    "resolve",
    resolveJob(c.env, id).then(async (r) => {
      if (r.decision.action === "wait") {
        await logAndTrim(c.env, {
          level: "info",
          jobId: id.toString(),
          phase: "resolve",
          message: `nothing to settle — ${r.decision.reason}`,
        });
      }
      return r;
    }),
  );
  return c.json({ started: true, sinceSeq: await latestSeq(c.env) });
});

app.get("/events", async (c) => {
  const from = Number(c.req.query("since") ?? 0);
  return c.json({
    events: await since(c.env, Number.isFinite(from) ? from : 0),
    latestSeq: await latestSeq(c.env),
  });
});

app.get("/resolve/:jobId", async (c) => {
  const dryRun = ["1", "true"].includes(c.req.query("dryRun") ?? "");
  return c.json(await resolveJob(c.env, BigInt(c.req.param("jobId")), { dryRun }));
});

export default {
  fetch: app.fetch,

  /** Cron Trigger — the Worker's replacement for the setInterval sweep. */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      sweep(env).then(
        (n) => console.log(`sweep settled ${n} job(s)`),
        (err) => console.error("sweep failed", err),
      ),
    );
  },
};
