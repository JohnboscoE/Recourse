import { formatUnits, parseUnits } from "viem";
import { JobStatus, decide, type OnchainJob } from "@recourse/shared";
import { readConfig, USDC_DECIMALS, type Env } from "./env.js";
import { readAllJobs, readJob, readObservedIncrease, readBalances } from "./chain.js";
import { getExecution, executeEscrowCall, transfer, contractCall } from "./keeperhub.js";
import { logAndTrim } from "./eventlog.js";
import { recourseEscrowAbi } from "@recourse/shared";
import { erc20Abi } from "viem";

export const usdc = (h: string) => parseUnits(h, USDC_DECIMALS);
export const human = (b: bigint) => formatUnits(b, USDC_DECIMALS);

export interface JobView {
  jobId: string;
  status: JobStatus;
  statusLabel: string;
  poster: string;
  agent: string;
  subject: string;
  paymentAmount: string;
  minIncrease: string;
  observedIncrease: string;
  baseline: string;
  deadline: string;
  deadlinePassed: boolean;
  deltaMet: boolean;
  executionRef: string;
  pendingDecision: { action: string; reason: string };
}

function toJobView(
  jobId: bigint,
  job: OnchainJob,
  observedIncrease: bigint,
  nowSec: bigint,
): JobView {
  const decision = decide({
    status: job.status,
    minIncrease: job.minIncrease,
    deadline: job.deadline,
    observedIncrease,
    nowSec,
  });
  return {
    jobId: jobId.toString(),
    status: job.status,
    statusLabel: JobStatus[job.status]!,
    poster: job.poster,
    agent: job.agent,
    subject: job.subject,
    paymentAmount: human(job.paymentAmount),
    minIncrease: human(job.minIncrease),
    observedIncrease: human(observedIncrease),
    baseline: human(job.baseline),
    deadline: job.deadline.toString(),
    deadlinePassed: nowSec > job.deadline,
    deltaMet: observedIncrease >= job.minIncrease,
    executionRef: job.executionRef,
    pendingDecision: decision,
  };
}

export async function listJobs(env: Env): Promise<JobView[]> {
  const rows = await readAllJobs(env);
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  return rows
    .map(({ jobId, job, observedIncrease }) =>
      toJobView(jobId, job, observedIncrease, nowSec),
    )
    .reverse();
}

export async function getJobView(env: Env, jobId: bigint): Promise<JobView> {
  const [job, observed] = await Promise.all([
    readJob(env, jobId),
    readObservedIncrease(env, jobId),
  ]);
  return toJobView(jobId, job, observed, BigInt(Math.floor(Date.now() / 1000)));
}

export async function getBalances(env: Env) {
  const { escrow, wallet } = await readBalances(env);
  return { escrowUsdc: human(escrow), walletUsdc: human(wallet), stale: false };
}

/**
 * Resolve one job: read chain state, decide, and settle unless dry-run.
 *
 * The KeeperHub execution record is pulled for observability only — the
 * decision comes from the balance delta. That separation is the product.
 */
export async function resolveJob(
  env: Env,
  jobId: bigint,
  opts: { dryRun?: boolean } = {},
) {
  const job = await readJob(env, jobId);
  const observedIncrease = await readObservedIncrease(env, jobId);
  const nowSec = BigInt(Math.floor(Date.now() / 1000));

  const decision = decide({
    status: job.status,
    minIncrease: job.minIncrease,
    deadline: job.deadline,
    observedIncrease,
    nowSec,
  });

  let agentExecution = null;
  if (job.executionRef) {
    try {
      const rec = await getExecution(env, job.executionRef);
      agentExecution = {
        status: rec.status,
        transactionHash: rec.transactionHash,
        gasUsedWei: rec.gasUsedWei,
      };
    } catch {
      agentExecution = null; // non-fatal; verification never depended on it
    }
  }

  const report: any = {
    jobId: jobId.toString(),
    decision,
    job: {
      status: job.status,
      minIncrease: job.minIncrease.toString(),
      observedIncrease: observedIncrease.toString(),
      deadline: job.deadline.toString(),
      executionRef: job.executionRef,
    },
    agentExecution,
  };

  if (decision.action === "wait" || opts.dryRun) return report;

  try {
    const settle = await executeEscrowCall(
      env,
      decision.action as "release" | "refund",
      jobId.toString(),
    );
    report.settlement = {
      functionName: decision.action,
      executionId: settle.executionId,
      status: settle.status,
      via: settle.via,
    };
  } catch (err) {
    report.error = String(err);
  }
  return report;
}

/**
 * Post a job: approve, then createJob.
 *
 * Runs inline rather than as background work — Workers terminate when the
 * response is sent unless the task is handed to waitUntil, which the caller
 * does.
 */
export async function postJob(
  env: Env,
  args: { subject: string; minIncrease: string; payment: string; deadlineMins: number },
) {
  const cfg = readConfig(env);
  const paymentBase = usdc(args.payment);
  const deadline = BigInt(
    Math.floor(Date.now() / 1000) + Math.floor(args.deadlineMins * 60),
  );

  if (args.subject.toLowerCase() === cfg.keeperHubWallet.toLowerCase()) {
    await logAndTrim(env, {
      level: "warn",
      phase: "post",
      message:
        "subject is the KeeperHub execution wallet — the agent pays from that " +
        "address, so its own transfer nets to zero and cannot satisfy this job. " +
        "Only an unrelated inflow could. Expect a refund.",
    });
  }

  await logAndTrim(env, {
    level: "info",
    phase: "post",
    message: `Posting job — subject ${args.subject}, requires +${args.minIncrease} USDC, pays ${args.payment} USDC`,
  });

  const appr = await contractCall(
    env,
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "approve",
    [cfg.escrowAddress, paymentBase.toString()],
    erc20Abi,
    crypto.randomUUID(),
  );
  await logAndTrim(env, {
    level: "info",
    phase: "post",
    message: "approve submitted",
    executionId: appr.executionId,
  });

  const cj = await contractCall(
    env,
    cfg.escrowAddress,
    "createJob",
    [
      args.subject,
      usdc(args.minIncrease).toString(),
      paymentBase.toString(),
      deadline.toString(),
    ],
    recourseEscrowAbi,
    crypto.randomUUID(),
  );
  await logAndTrim(env, {
    level: "success",
    phase: "post",
    message: "createJob submitted",
    executionId: cj.executionId,
  });
}

/** Run a worker agent. `fail` under-delivers so the refund path is demoable. */
export async function runAgent(
  env: Env,
  jobId: bigint,
  mode: "honest" | "fail",
) {
  const id = jobId.toString();
  const job = await readJob(env, jobId);

  if (job.status !== JobStatus.Open) {
    await logAndTrim(env, {
      level: "warn",
      jobId: id,
      phase: "work",
      message: `job is ${JobStatus[job.status]}, not Open — nothing to do`,
    });
    return;
  }

  const sendBase = mode === "fail" ? job.minIncrease / 2n : job.minIncrease;

  await logAndTrim(env, {
    level: mode === "fail" ? "warn" : "info",
    jobId: id,
    phase: "work",
    message: `${mode === "fail" ? "FAILING agent" : "Honest agent"} delivering ${human(sendBase)} USDC (requires ${human(job.minIncrease)})`,
  });

  const work = await transfer(env, {
    to: job.subject,
    amount: human(sendBase),
    idempotencyKey: `recourse:pay:${jobId}:${sendBase}`,
  });

  /**
   * Do not claim work that did not happen.
   *
   * The transfer can come back failed — bad recipient, insufficient balance, a
   * rejected execution. Claiming anyway marks the job Claimed, burns a
   * transaction, and points the audit trail at an execution that delivered
   * nothing. The resolver would still refuse to release, so no money is lost,
   * but the job would misrepresent what the agent actually did.
   */
  const transferFailed = ["error", "failed", "cancelled"].includes(work.status);
  await logAndTrim(env, {
    level: transferFailed ? "error" : "info",
    jobId: id,
    phase: "work",
    message: `transfer ${work.status} (via ${work.via})`,
    executionId: work.executionId,
  });

  if (transferFailed) {
    await logAndTrim(env, {
      level: "error",
      jobId: id,
      phase: "work",
      message: "not claiming — the delivery did not succeed, so there is no work to claim",
    });
    return;
  }

  const cl = await contractCall(
    env,
    readConfig(env).escrowAddress,
    "claim",
    [id, work.executionId],
    recourseEscrowAbi,
    `recourse:claim:${id}`,
  );
  await logAndTrim(env, {
    level: "success",
    jobId: id,
    phase: "work",
    message: `claimed, referencing execution ${work.executionId}`,
    executionId: cl.executionId,
  });
}

/**
 * Sweep every job and settle the ones that are due.
 *
 * Invoked by a Cron Trigger, because Workers have no long-lived process and
 * `setInterval` does not survive between requests. Cron granularity is one
 * minute versus the Node backend's 30 seconds — the only behavioural
 * difference, and it only affects how quickly a settlement lands, never
 * whether it does.
 */
export async function sweep(env: Env): Promise<number> {
  const jobs = await listJobs(env);
  const due = jobs.filter((j) => j.pendingDecision.action !== "wait");
  let settled = 0;

  for (const j of due) {
    const r = await resolveJob(env, BigInt(j.jobId));
    if (r.decision.action === "wait") continue;

    await logAndTrim(env, {
      level: r.decision.action === "release" ? "success" : "warn",
      jobId: r.jobId,
      phase: "auto",
      message: `settled automatically: ${r.decision.action.toUpperCase()} — ${r.decision.reason}`,
      executionId: r.settlement?.executionId,
    });
    if (r.error) {
      await logAndTrim(env, {
        level: "error",
        jobId: r.jobId,
        phase: "auto",
        message: String(r.error),
      });
    }
    settled++;
  }
  return settled;
}
