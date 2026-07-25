import { JobStatus, type OnchainJob, type ExecutionRecord } from "@recourse/shared";
import { readJob, readObservedIncrease } from "./chain.js";
import { executeEscrowCall, getExecution } from "./keeperhub.js";

/**
 * The resolver decides, from CHAIN STATE, whether a job should release, refund,
 * or wait. The KeeperHub execution record is used for observability/logging —
 * NOT as the verification signal. "Execution succeeded" is not "the balance
 * delta happened"; only the on-chain increase decides. That distinction is the
 * whole product.
 */

export type ResolverAction = "release" | "refund" | "wait";

export interface Decision {
  action: ResolverAction;
  reason: string;
}

export interface DecisionInput {
  status: JobStatus;
  minIncrease: bigint;
  deadline: bigint; // unix seconds
  observedIncrease: bigint; // subject's current USDC balance minus baseline
  nowSec: bigint;
}

/** Pure decision logic — deterministic, no I/O, fully unit-testable. */
export function decide(input: DecisionInput): Decision {
  const { status, minIncrease, deadline, observedIncrease, nowSec } = input;

  if (status === JobStatus.Released || status === JobStatus.Refunded) {
    return { action: "wait", reason: "already settled" };
  }

  const deltaMet = observedIncrease >= minIncrease;
  const withinDeadline = nowSec <= deadline;

  // Release only if an agent has claimed, the delta is met, and we're in time.
  if (status === JobStatus.Claimed && deltaMet && withinDeadline) {
    return {
      action: "release",
      reason: `delta met (${observedIncrease} >= ${minIncrease}) before deadline`,
    };
  }

  // Past the deadline with no successful release: poster can reclaim. Covers
  // both never-claimed jobs and claimed-but-unfulfilled (or fulfilled too late).
  if (!withinDeadline) {
    return {
      action: "refund",
      reason: deltaMet
        ? "delta met but deadline passed before release"
        : `delta not met by deadline (${observedIncrease} < ${minIncrease})`,
    };
  }

  return {
    action: "wait",
    reason: deltaMet ? "delta met, awaiting claim" : "delta not yet met, within deadline",
  };
}

export interface ResolveReport {
  jobId: string;
  decision: Decision;
  job: {
    status: JobStatus;
    minIncrease: string;
    observedIncrease: string;
    deadline: string;
    executionRef: string;
  };
  /** KeeperHub audit-trail record for the agent's execution, if referenced. */
  agentExecution?: Pick<ExecutionRecord, "status" | "transactionHash" | "gasUsedWei"> | null;
  /** Result of the settlement call submitted via KeeperHub, if any. */
  settlement?: { functionName: ResolverAction; executionId: string; status: string };
  error?: string;
}

/**
 * Resolve a single job: read chain state, optionally enrich with the agent's
 * KeeperHub execution record, decide, and (unless dryRun) submit the settlement
 * call through KeeperHub.
 */
export async function resolveJob(jobId: bigint, opts: { dryRun?: boolean } = {}): Promise<ResolveReport> {
  const job: OnchainJob = await readJob(jobId);
  const observedIncrease = await readObservedIncrease(jobId);
  const nowSec = BigInt(Math.floor(Date.now() / 1000));

  const decision = decide({
    status: job.status,
    minIncrease: job.minIncrease,
    deadline: job.deadline,
    observedIncrease,
    nowSec,
  });

  // Observability: pull the agent's execution record if one was referenced.
  let agentExecution: ResolveReport["agentExecution"] = null;
  if (job.executionRef) {
    try {
      const rec = await getExecution(job.executionRef);
      agentExecution = {
        status: rec.status,
        transactionHash: rec.transactionHash,
        gasUsedWei: rec.gasUsedWei,
      };
    } catch {
      agentExecution = null; // non-fatal; verification does not depend on it
    }
  }

  const report: ResolveReport = {
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
    const settle = await executeEscrowCall(decision.action, [jobId.toString()]);
    report.settlement = {
      functionName: decision.action,
      executionId: settle.executionId,
      status: settle.status,
    };
  } catch (err) {
    report.error = String(err);
  }
  return report;
}
