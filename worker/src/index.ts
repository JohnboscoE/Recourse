import { Hono } from "hono";
import { cors } from "hono/cors";
import { readConfig, type Env } from "./env.js";
import { listJobs, getJobView, getBalances, resolveJob, postJob, runAgent, sweep } from "./jobs.js";
import { getExecution } from "./keeperhub.js";
import { since, latestSeq } from "./eventlog.js";
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

  c.executionCtx.waitUntil(
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

  c.executionCtx.waitUntil(runAgent(c.env, id, mode));
  return c.json({ started: true, sinceSeq: await latestSeq(c.env) });
});

app.post("/jobs/:jobId/resolve", async (c) => {
  const id = BigInt(c.req.param("jobId"));
  const dryRun = ["1", "true"].includes(c.req.query("dryRun") ?? "");
  // Dry run is cheap and its answer is the point, so await it. A real
  // settlement is a chain write; hand it off and let the log report.
  if (dryRun) return c.json(await resolveJob(c.env, id, { dryRun: true }));

  c.executionCtx.waitUntil(resolveJob(c.env, id));
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
