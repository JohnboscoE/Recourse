import { JobStatus } from "./job.js";

/**
 * The settlement decision.
 *
 * Pure, deterministic, no I/O — and deliberately shared. Two runtimes now
 * resolve jobs (the Node backend and the Cloudflare Worker), and this is the
 * one piece of logic that decides whether money moves. Duplicating it would
 * mean the two could silently disagree about the same job.
 *
 * The unit tests in backend/src/resolver.test.ts cover this function.
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
