import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { readJobCount } from "./chain.js";
import { resolveJob } from "./resolver.js";
import { since, latestSeq, log } from "./eventlog.js";
import {
  listJobs,
  getJobView,
  getJobAudit,
  getBalances,
  startPostJob,
  startWork,
  startResolve,
} from "./jobs.js";

// JSON can't serialize bigint; render them as strings.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

const app = Fastify({ logger: { level: "warn" } });
await app.register(cors, { origin: true });

app.get("/health", async () => ({ ok: true, service: "recourse-backend" }));

/** Config the UI needs to render links and labels. */
app.get("/config", async () => ({
  escrowAddress: config.escrowAddress,
  chainId: config.chain.id,
  explorer: "https://basescan.org",
  keeperHubWallet: config.keeperHubWallet,
  /** Whether settlement happens on its own, and how often. */
  autoSettle: config.pollIntervalMs > 0,
  autoSettleMs: config.pollIntervalMs,
}));

app.get("/balances", async () =>
  getBalances(config.escrowAddress, config.keeperHubWallet as `0x${string}`),
);

// ---- Job board ----------------------------------------------------------

app.get("/jobs", async () => ({ jobs: await listJobs() }));

app.get<{ Params: { jobId: string } }>("/jobs/:jobId", async (req) => ({
  job: await getJobView(BigInt(req.params.jobId)),
  audit: await getJobAudit(BigInt(req.params.jobId)),
}));

/** Post a new job. Returns immediately; progress arrives over /events. */
app.post<{
  Body: { subject: string; minIncrease: string; payment: string; deadlineMins?: number };
}>("/jobs", async (req, reply) => {
  const { subject, minIncrease, payment, deadlineMins = 30 } = req.body ?? {};
  if (!subject || !/^0x[a-fA-F0-9]{40}$/.test(subject)) {
    return reply.code(400).send({ error: "subject must be a 0x address" });
  }
  if (!minIncrease || !payment) {
    return reply.code(400).send({ error: "minIncrease and payment are required" });
  }

  /**
   * Warn, don't block, when the subject is the wallet the agent pays *from*.
   *
   * The agent's own work cannot satisfy such a job: a transfer from that wallet
   * to itself nets to zero, so the delta stays at 0. But the predicate is not
   * strictly unsatisfiable — any unrelated inflow (a refund from another job, an
   * external deposit) still counts, and staging a guaranteed refund is a
   * legitimate thing to want. So this is the caller's call to make; our job is
   * to make sure they make it knowingly.
   */
  if (subject.toLowerCase() === config.keeperHubWallet.toLowerCase()) {
    log({
      level: "warn",
      phase: "post",
      message:
        "subject is the KeeperHub execution wallet — the agent pays from that " +
        "address, so its own transfer nets to zero and cannot satisfy this job. " +
        "Only an unrelated inflow could. Expect a refund.",
    });
  }
  startPostJob({ subject, minIncrease, payment, deadlineMins });
  return { started: true, sinceSeq: latestSeq() };
});

/** Run a worker agent against a job: mode "honest" or "fail". */
app.post<{ Params: { jobId: string }; Body: { mode?: "honest" | "fail"; send?: string } }>(
  "/jobs/:jobId/work",
  async (req) => {
    const mode = req.body?.mode === "fail" ? "fail" : "honest";
    startWork(BigInt(req.params.jobId), mode, req.body?.send);
    return { started: true, sinceSeq: latestSeq() };
  },
);

/** Settle a job. ?dryRun=1 decides without submitting. */
app.post<{ Params: { jobId: string }; Querystring: { dryRun?: string } }>(
  "/jobs/:jobId/resolve",
  async (req) => {
    const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";
    startResolve(BigInt(req.params.jobId), dryRun);
    return { started: true, sinceSeq: latestSeq() };
  },
);

// ---- Event log ----------------------------------------------------------

app.get<{ Querystring: { since?: string } }>("/events", async (req) => {
  const from = Number(req.query.since ?? 0);
  return { events: since(Number.isFinite(from) ? from : 0), latestSeq: latestSeq() };
});

// ---- Existing resolver endpoints (kept for CLI/ops parity) --------------

app.get<{ Params: { jobId: string }; Querystring: { dryRun?: string } }>(
  "/resolve/:jobId",
  async (req) => {
    const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";
    return resolveJob(BigInt(req.params.jobId), { dryRun });
  },
);

app.get<{ Querystring: { dryRun?: string } }>("/resolve", async (req) => {
  const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";
  const count = await readJobCount();
  const reports = [];
  for (let id = 1n; id <= count; id++) {
    reports.push(await resolveJob(id, { dryRun }));
  }
  return { count: count.toString(), reports };
});

// ---- Background sweep ---------------------------------------------------

/**
 * Automatic settlement.
 *
 * Reads the whole board in one multicall, then submits settlement only for the
 * jobs that actually need it. The previous version called resolveJob for every
 * job on every tick, which meant a stream of redundant chain reads just to
 * re-learn that settled jobs are still settled.
 */
function startPollLoop() {
  if (config.pollIntervalMs <= 0) {
    console.log("resolver: automatic settlement DISABLED (RESOLVER_POLL_MS=0)");
    return;
  }

  let running = false;

  const tick = async () => {
    // A slow sweep must not overlap itself and double-submit settlements.
    if (running) return;
    running = true;
    try {
      const jobs = await listJobs();
      const due = jobs.filter((j) => j.pendingDecision.action !== "wait");

      for (const j of due) {
        const r = await resolveJob(BigInt(j.jobId));
        if (r.decision.action === "wait") continue; // raced with a manual settle

        log({
          level: r.decision.action === "release" ? "success" : "warn",
          jobId: r.jobId,
          phase: "auto",
          message:
            `settled automatically: ${r.decision.action.toUpperCase()} — ` +
            r.decision.reason,
          executionId: r.settlement?.executionId,
        });

        if (r.error) {
          log({ level: "error", jobId: r.jobId, phase: "auto", message: r.error });
        }
      }
    } catch (err) {
      app.log.error(err, "resolver sweep failed");
    } finally {
      running = false;
    }
  };

  setInterval(tick, config.pollIntervalMs);
  void tick(); // don't wait a full interval to catch what's already due
  console.log(
    `resolver: automatic settlement every ${config.pollIntervalMs}ms`,
  );
}

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then(() => {
    console.log(
      `recourse-backend on :${config.port} (escrow: ${config.escrowAddress || "unset"})`,
    );
    startPollLoop();
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
