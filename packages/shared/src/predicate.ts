/**
 * Predicate — the signed statement a job promises.
 *
 * HARD CONSTRAINT (see CLAUDE.md): the ONLY predicate type before Aug 13 is an
 * ERC-20 balance delta. Do not add other predicate kinds. Generalization is
 * future work and belongs in the README, not here.
 *
 *   "address `subject`'s balance of `token` on `chainId` increases by at least
 *    `minIncrease` (base units) by time `deadline`."
 */

export type PredicateKind = "erc20-balance-delta";

export interface Erc20BalanceDeltaPredicate {
  kind: "erc20-balance-delta";
  /** Chain ID. Base mainnet = 8453. */
  chainId: number;
  /** ERC-20 token contract address (e.g. Base USDC). */
  token: `0x${string}`;
  /** Address whose balance must increase. */
  subject: `0x${string}`;
  /**
   * Minimum required increase, in the token's BASE units (not human units).
   * For USDC (6 decimals), 1 USDC = "1000000". String to stay exact for bigint.
   */
  minIncrease: string;
  /** Unix seconds. The delta must hold at/after execution and before this. */
  deadline: number;
}

/** Only one kind for now — union kept for a clean future extension point. */
export type Predicate = Erc20BalanceDeltaPredicate;

/** Base mainnet native USDC (6 decimals). */
export const BASE_USDC: `0x${string}` =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export const BASE_CHAIN_ID = 8453;
