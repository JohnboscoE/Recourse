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
    autoAgent: c.env.AUTO_AGENT === "honest" || c.env.AUTO_AGENT === "fail"
      ? c.env.AUTO_AGENT
      : null,
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

  /**
   * Enforce a floor on the deadline.
   *
   * Measured end to end: ~16s for the job to land, ~16s for an agent run, up to
   * 60s for the cron to notice, ~10s for settlement — and `release` reverts
   * once the deadline has passed. Under about two minutes a job cannot be
   * completed even by a perfectly prompt agent, so it is guaranteed to refund.
   * Refusing to create one beats letting somebody lock funds against a promise
   * that was never winnable.
   */
  const MIN_DEADLINE_MINS = 3;
  if (deadlineMins < MIN_DEADLINE_MINS) {
    return c.json(
      {
        error:
          `deadlineMins must be at least ${MIN_DEADLINE_MINS}. Creating, working ` +
          `and settling a job takes roughly two minutes end to end, and release ` +
          `reverts after the deadline — a shorter window can only refund.`,
      },
      400,
    );
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

/**
 * Run a settlement sweep on demand.
 *
 * The cron path swallows detail by nature — a scheduled invocation has nowhere
 * to report to. This runs the same code in the request path so failures come
 * back as HTTP, which is how the missing auto-settle logs were finally traced.
 * Also useful as a manual "settle everything now" during a demo.
 */
app.post("/sweep", async (c) => {
  const settled = await sweep(c.env);
  return c.json({ settled });
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

  /**
   * Cron Trigger — the Worker's replacement for the setInterval sweep.
   *
   * AWAIT the sweep; do not hand it to waitUntil. The scheduled handler
   * returning immediately let the runtime tear the invocation down mid-flight:
   * settlements reached the chain but their completion log never wrote, so jobs
   * appeared Refunded with nothing explaining why. Awaiting keeps the
   * invocation alive for the whole sweep — the same code already ran clean via
   * POST /sweep, which is what isolated this.
   *
   * Failures go to the app's own log, not just console. A sweep that dies
   * silently is indistinguishable from one that had nothing to do, and this is
   * the path that moves money.
   */
  async scheduled(_event: ScheduledController, env: Env) {
    try {
      const n = await sweep(env);
      if (n > 0) console.log(`sweep settled ${n} job(s)`);
    } catch (err) {
      await logAndTrim(env, {
        level: "error",
        phase: "auto",
        message: `sweep failed: ${String(err instanceof Error ? err.message : err).slice(0, 300)}`,
      }).catch(() => console.error("sweep failed, and could not log it", err));
    }
  },
};
