import Fastify from "fastify";
import { config } from "./config.js";
import { readJobCount } from "./chain.js";
import { resolveJob } from "./resolver.js";

// JSON can't serialize bigint; render them as strings.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

const app = Fastify({ logger: true });

app.get("/health", async () => ({ ok: true, service: "recourse-backend" }));

// Resolve one job now. ?dryRun=1 to decide without submitting the settlement.
app.get<{ Params: { jobId: string }; Querystring: { dryRun?: string } }>(
  "/resolve/:jobId",
  async (req) => {
    const jobId = BigInt(req.params.jobId);
    const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";
    return resolveJob(jobId, { dryRun });
  },
);

// Sweep every active job once (dry-run by default via ?dryRun=1).
app.get<{ Querystring: { dryRun?: string } }>("/resolve", async (req) => {
  const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";
  const count = await readJobCount();
  const reports = [];
  for (let id = 1n; id <= count; id++) {
    reports.push(await resolveJob(id, { dryRun }));
  }
  return { count: count.toString(), reports };
});

// Optional background sweep loop (enable with RESOLVER_POLL_MS > 0).
function startPollLoop() {
  if (config.pollIntervalMs <= 0) return;
  const tick = async () => {
    try {
      const count = await readJobCount();
      for (let id = 1n; id <= count; id++) {
        const r = await resolveJob(id);
        if (r.decision.action !== "wait") {
          app.log.info({ jobId: r.jobId, decision: r.decision, settlement: r.settlement }, "resolved");
        }
      }
    } catch (err) {
      app.log.error(err, "poll loop error");
    }
  };
  setInterval(tick, config.pollIntervalMs);
  app.log.info(`resolver poll loop every ${config.pollIntervalMs}ms`);
}

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`recourse-backend on :${config.port} (escrow: ${config.escrowAddress || "unset"})`);
    startPollLoop();
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
