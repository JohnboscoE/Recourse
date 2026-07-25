/**
 * ExecutionRecord — the shape KeeperHub returns for a single execution.
 *
 * Derived from a REAL Base transaction executed via KeeperHub on 2026-07-25
 * (GET /api/execute/{executionId}/status). See
 * `fixtures/execution-transfer.example.json` for the captured response.
 *
 * This is the source-of-truth the resolver reads to obtain the on-chain tx
 * hash + timestamp. NOTE: `result.success === true` means the tx did not
 * revert — it does NOT mean the promised USDC balance delta occurred. The
 * resolver must still read chain state to verify the delta. That gap is the
 * entire product.
 */

export type ExecutionStatus =
  | "pending"
  | "running"
  | "completed"
  | "success"
  | "error"
  | "failed"
  | "cancelled";

/** Details of the underlying contract call KeeperHub broadcast. */
export interface ExecutedCall {
  args: Record<string, string>;
  reverted: boolean;
  sponsored: boolean;
  /** The smart-account / entrypoint the call was routed through. */
  topLevelTo: string;
  functionName: string;
  contractAddress: string;
  functionSignature: string;
}

/** Per-execution outcome payload (present once broadcast). */
export interface ExecutionResult {
  amount?: string;
  symbol?: string;
  gasUsed?: string;
  gasUsedUnits?: string;
  /** true = tx did not revert. NOT a balance-delta guarantee. */
  success?: boolean;
  recipient?: string;
  /** KeeperHub sponsored gas via paymaster/smart account. */
  sponsored?: boolean;
  executedCall?: ExecutedCall;
  transactionHash?: string;
  transactionLink?: string;
  effectiveGasPrice?: string;
}

/** Full execution record as returned by KeeperHub's audit trail. */
export interface ExecutionRecord {
  executionId: string;
  status: ExecutionStatus;
  /** e.g. "transfer", "contract-call". */
  type?: string;
  transactionHash: string | null;
  transactionLink?: string;
  result?: ExecutionResult;
  error: string | null;
  gasUsedWei?: string;
  gasPriceWei?: string;
  estimatedCostUsd?: string | null;
  retryCount?: number;
  /** Chain ID as a string, e.g. "8453" for Base. */
  network: string;
  createdAt: string;
  completedAt?: string;
}

/** Terminal statuses — polling can stop once one of these is reached. */
export const TERMINAL_STATUSES: ReadonlySet<ExecutionStatus> = new Set([
  "completed",
  "success",
  "error",
  "failed",
  "cancelled",
]);

export function isTerminal(status: ExecutionStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** True if the tx broadcast and did not revert (still not a delta guarantee). */
export function didBroadcastSucceed(rec: ExecutionRecord): boolean {
  return (
    (rec.status === "completed" || rec.status === "success") &&
    rec.result?.success === true &&
    rec.result?.executedCall?.reverted !== true
  );
}
