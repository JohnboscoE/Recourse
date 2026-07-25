/**
 * On-chain job shape, mirroring RecourseEscrow.sol. The contract is the source
 * of truth; this type just makes the decoded struct ergonomic in TS.
 */

/** Matches the Solidity `enum Status`. */
export enum JobStatus {
  Open = 0,
  Claimed = 1,
  Released = 2,
  Refunded = 3,
}

/** A job as returned by `getJob` (bigints for uint fields). */
export interface OnchainJob {
  poster: `0x${string}`;
  agent: `0x${string}`;
  subject: `0x${string}`;
  paymentAmount: bigint;
  minIncrease: bigint;
  baseline: bigint;
  deadline: bigint;
  status: JobStatus;
  executionRef: string;
}
