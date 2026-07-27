import { formatUnits, parseUnits } from "viem";
import { JobStatus, type OnchainJob } from "@recourse/shared";
import {
  approveUsdc,
  createJob as createJobOnchain,
  claim,
  payToSubject,
  USDC_DECIMALS,
} from "@recourse/agents";
import {
  readJob,
  readJobCount,
  readObservedIncrease,
  readAllJobs,
  readUsdcBalance,
  balanceIsStale,
  invalidate,
} from "./chain.js";
import { getExecution } from "./keeperhub.js";
import { decide, resolveJob } from "./resolver.js";
import { log } from "./eventlog.js";

/**
 * Job orchestration for the UI. Each long-running action (post, work, resolve)
 * is kicked off in the background and narrated into the event log, so the
 * frontend can stay responsive while KeeperHub executions confirm — a post is
 * two executions and a work run is two more, each taking tens of seconds.
 */

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
  /** What the resolver would do right now, without submitting anything. */
  pendingDecision: { action: string; reason: string };
}

export const usdc = (human: string): bigint => parseUnits(human, USDC_DECIMALS);
export const human = (base: bigint): string => formatUnits(base, USDC_DECIMALS);

/** Pure projection of chain state into what the board renders. */
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
    statusLabel: JobStatus[job.status],
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

/** Single job — used by the detail endpoint. */
export async function getJobView(jobId: bigint): Promise<JobView> {
  const [job, observedIncrease] = await Promise.all([
    readJob(jobId),
    readObservedIncrease(jobId),
  ]);
  return toJobView(jobId, job, observedIncrease, BigInt(Math.floor(Date.now() / 1000)));
}

/** Every job, newest first. One multicall, regardless of job count. */
export async function listJobs(): Promise<JobView[]> {
  const rows = await readAllJobs();
  const nowSec = BigInt(Math.floor(Date.now() / 1000));

  return rows
    .map(({ jobId, job, observedIncrease }) =>
      toJobView(jobId, job, observedIncrease, nowSec),
    )
    .reverse();
}

/** The agent's KeeperHub execution record for a job, for the audit panel. */
export async function getJobAudit(jobId: bigint) {
  const job = await readJob(jobId);
  if (!job.executionRef) return null;
  try {
    return await getExecution(job.executionRef);
  } catch {
    return null;
  }
}

/** Fire-and-forget wrapper: run `fn`, log any thrown error against the job. */
function background(jobId: string | undefined, phase: string, fn: () => Promise<void>) {
  void fn().catch((err) => {
    log({ level: "error", jobId, phase, message: String(err?.message ?? err) });
  });
}

export function startPostJob(args: {
  subject: string;
  minIncrease: string;
  payment: string;
  deadlineMins: number;
}) {
  const minIncreaseBase = usdc(args.minIncrease);
  const paymentBase = usdc(args.payment);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + Math.floor(args.deadlineMins * 60));

  log({
    level: "info",
    phase: "post",
    message:
      `Posting job — subject ${args.subject}, requires +${args.minIncrease} USDC, ` +
      `pays ${args.payment} USDC, deadline in ${args.deadlineMins} min`,
  });

  background(undefined, "post", async () => {
    log({ level: "info", phase: "post", message: "1/2 approving USDC for escrow via KeeperHub…" });
    const appr = await approveUsdc(paymentBase);
    log({
      level: "info",
      phase: "post",
      message: "approve confirmed",
      executionId: appr.executionId,
      txHash: appr.transactionHash ?? undefined,
    });

    log({ level: "info", phase: "post", message: "2/2 createJob via KeeperHub…" });
    const cj = await createJobOnchain({
      subject: args.subject,
      minIncreaseBase,
      paymentBase,
      deadline,
    });

    invalidate(); // a new job exists; jobCount is stale
    const jobId = (await readJobCount()).toString();
    log({
      level: "success",
      jobId,
      phase: "post",
      message: `Job #${jobId} created and funded`,
      executionId: cj.executionId,
      txHash: cj.transactionHash ?? undefined,
    });
  });
}

/**
 * Run a worker agent against a job. `mode: "fail"` deliberately under-delivers
 * so the refund path can be demonstrated: the transfer still succeeds on-chain,
 * but the promised delta is not met.
 */
export function startWork(jobId: bigint, mode: "honest" | "fail", sendOverride?: string) {
  const id = jobId.toString();

  background(id, "work", async () => {
    const job = await readJob(jobId);
    if (job.status !== JobStatus.Open) {
      log({
        level: "warn",
        jobId: id,
        phase: "work",
        message: `job is ${JobStatus[job.status]}, not Open — nothing to do`,
      });
      return;
    }

    const sendBase =
      mode === "fail"
        ? sendOverride
          ? usdc(sendOverride)
          : job.minIncrease / 2n
        : job.minIncrease;

    log({
      level: mode === "fail" ? "warn" : "info",
      jobId: id,
      phase: "work",
      message:
        `${mode === "fail" ? "FAILING agent" : "Honest agent"} delivering ` +
        `${human(sendBase)} USDC to ${job.subject} (requires ${human(job.minIncrease)})`,
    });

    log({ level: "info", jobId: id, phase: "work", message: "1/2 transfer via KeeperHub…" });
    const work = await payToSubject(job.subject, sendBase);
    log({
      level: "info",
      jobId: id,
      phase: "work",
      message:
        `transfer execution ${work.status}` +
        (work.result?.success === true ? " (result.success=true — tx did not revert)" : ""),
      executionId: work.executionId,
      txHash: work.transactionHash ?? undefined,
    });

    log({ level: "info", jobId: id, phase: "work", message: "2/2 claim via KeeperHub…" });
    const cl = await claim(jobId, work.executionId);
    log({
      level: "success",
      jobId: id,
      phase: "work",
      message: `Job #${id} claimed, referencing execution ${work.executionId}`,
      executionId: cl.executionId,
      txHash: cl.transactionHash ?? undefined,
    });

    invalidate(jobId); // the transfer and claim both moved chain state
    const observed = await readObservedIncrease(jobId);
    if (observed >= job.minIncrease) {
      log({
        level: "success",
        jobId: id,
        phase: "work",
        message: `on-chain delta ${observed} >= ${job.minIncrease} — resolver can release`,
      });
    } else {
      log({
        level: "warn",
        jobId: id,
        phase: "work",
        message:
          `on-chain delta ${observed} < ${job.minIncrease} — the transfer SUCCEEDED but the ` +
          `promise was not kept. Resolver will refund after the deadline.`,
      });
    }
  });
}

/** Run the resolver against a job and narrate the decision. */
export function startResolve(jobId: bigint, dryRun: boolean) {
  const id = jobId.toString();

  background(id, "resolve", async () => {
    log({
      level: "info",
      jobId: id,
      phase: "resolve",
      message: dryRun ? "resolving (dry run — nothing will be submitted)…" : "resolving…",
    });

    const report = await resolveJob(jobId, { dryRun });

    if (report.agentExecution) {
      log({
        level: "info",
        jobId: id,
        phase: "resolve",
        message:
          `KeeperHub says the agent's execution is "${report.agentExecution.status}" ` +
          `— that is an execution signal, not a verification signal`,
        txHash: report.agentExecution.transactionHash ?? undefined,
      });
    }

    log({
      level: "info",
      jobId: id,
      phase: "resolve",
      message:
        `chain state: observed ${report.job.observedIncrease} vs required ${report.job.minIncrease}`,
    });

    const action = report.decision.action;
    log({
      level: action === "release" ? "success" : action === "refund" ? "warn" : "info",
      jobId: id,
      phase: "resolve",
      message: `decision: ${action.toUpperCase()} — ${report.decision.reason}`,
    });

    if (report.error) {
      log({ level: "error", jobId: id, phase: "resolve", message: report.error });
      return;
    }

    if (report.settlement) {
      invalidate(jobId); // job is now Released/Refunded on chain
      const settled = await getExecution(report.settlement.executionId).catch(() => null);
      log({
        level: "success",
        jobId: id,
        phase: "resolve",
        message: `${report.settlement.functionName} submitted via KeeperHub`,
        executionId: report.settlement.executionId,
        txHash: settled?.transactionHash ?? undefined,
      });
    }
  });
}

/** Balances backing the demo, so the UI can warn before a run runs dry. */
export async function getBalances(escrowAddress: `0x${string}`, walletAddress: `0x${string}`) {
  const [escrow, wallet] = await Promise.all([
    readUsdcBalance(escrowAddress),
    readUsdcBalance(walletAddress),
  ]);
  return {
    escrowUsdc: human(escrow),
    walletUsdc: human(wallet),
    stale: balanceIsStale(escrowAddress) || balanceIsStale(walletAddress),
  };
}
