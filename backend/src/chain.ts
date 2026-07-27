import { createPublicClient, http, erc20Abi } from "viem";
import { base } from "viem/chains";
import { recourseEscrowAbi, type OnchainJob, JobStatus } from "@recourse/shared";
import { config } from "./config.js";

/**
 * Read-only chain access. Writes go through KeeperHub, not here.
 *
 * The UI tails the event log and re-reads the board on every change, so these
 * functions get called far more often than chain state actually moves. Two
 * defences keep us inside a public RPC's rate limit: JSON-RPC batching plus
 * transport-level retries below, and a short TTL cache above.
 */
export const publicClient = createPublicClient({
  chain: base,
  transport: http(config.chain.rpcUrl, {
    // Coalesce calls made in the same tick into one HTTP request.
    batch: { wait: 16 },
    retryCount: 4,
    retryDelay: 250, // viem backs off exponentially from here
  }),
});

/**
 * Collapse repeat reads within `ttlMs`, and share one in-flight promise between
 * concurrent callers. Chain state can't change faster than a block (~2s on
 * Base), so a short TTL costs no correctness.
 */
const CACHE_TTL_MS = Number(process.env.CHAIN_CACHE_MS ?? 5000);
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as Promise<T>;

  const value = fn().catch((err) => {
    cache.delete(key); // never cache a failure
    throw err;
  });
  cache.set(key, { at: Date.now(), value });
  return value;
}

/**
 * Read every job plus its observed increase in ONE round trip, via Multicall3.
 *
 * The board previously cost 2N+1 sequential eth_calls, which a public RPC
 * rate-limits away almost immediately. Multicall collapses that to a single
 * request regardless of job count, and keeps every read at the same block —
 * so the board is a consistent snapshot rather than a smear across blocks.
 */
export async function readAllJobs(): Promise<
  { jobId: bigint; job: OnchainJob; observedIncrease: bigint }[]
> {
  return cached("allJobs", () => fetchAllJobs());
}

async function fetchAllJobs() {
  const count = await readJobCount();
  if (count === 0n) return [];

  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
  const escrow = { address: config.escrowAddress, abi: recourseEscrowAbi } as const;

  const results = await publicClient.multicall({
    allowFailure: false,
    contracts: ids.flatMap((id) => [
      { ...escrow, functionName: "getJob", args: [id] },
      { ...escrow, functionName: "observedIncrease", args: [id] },
    ]),
  });

  // multicall widens results to a union across the different return types;
  // the ordering is ours (getJob, observedIncrease, repeating), so index by it.
  const rows = results as unknown as unknown[];

  return ids.map((jobId, i) => {
    const raw = rows[i * 2] as OnchainJob & { status: number };
    return {
      jobId,
      job: { ...raw, status: raw.status as JobStatus },
      observedIncrease: rows[i * 2 + 1] as bigint,
    };
  });
}

/** Drop cached reads for a job — call after a settlement lands. */
export function invalidate(jobId?: bigint) {
  if (jobId === undefined) return cache.clear();
  cache.delete(`job:${jobId}`);
  cache.delete(`observed:${jobId}`);
  cache.delete("jobCount");
  cache.delete("allJobs");
}

/** Read a job's full on-chain state (source of truth for the resolver). */
export async function readJob(jobId: bigint): Promise<OnchainJob> {
  return cached(`job:${jobId}`, async () => {
    const raw = await publicClient.readContract({
      address: config.escrowAddress,
      abi: recourseEscrowAbi,
      functionName: "getJob",
      args: [jobId],
    });
    return {
      poster: raw.poster,
      agent: raw.agent,
      subject: raw.subject,
      paymentAmount: raw.paymentAmount,
      minIncrease: raw.minIncrease,
      baseline: raw.baseline,
      deadline: raw.deadline,
      status: raw.status as JobStatus,
      executionRef: raw.executionRef,
    };
  });
}

/** Current observed increase in the subject's USDC balance vs the job baseline. */
export async function readObservedIncrease(jobId: bigint): Promise<bigint> {
  return cached(`observed:${jobId}`, () =>
    publicClient.readContract({
      address: config.escrowAddress,
      abi: recourseEscrowAbi,
      functionName: "observedIncrease",
      args: [jobId],
    }),
  );
}

export async function readJobCount(): Promise<bigint> {
  return cached("jobCount", () =>
    publicClient.readContract({
      address: config.escrowAddress,
      abi: recourseEscrowAbi,
      functionName: "jobCount",
    }),
  );
}

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

/**
 * Last successful balance per address. Balances are a display affordance, not a
 * verification input — the resolver never reads them. So when a flaky public RPC
 * refuses a balance call we serve the last known value rather than failing the
 * request and blanking the UI. Verification reads deliberately do NOT do this:
 * they must be fresh or fail loudly.
 */
const lastGoodBalance = new Map<string, bigint>();

/** Balances move rarely; cache them well past the verification-read TTL. */
const BALANCE_TTL_MS = Number(process.env.BALANCE_CACHE_MS ?? 15_000);
const balanceCache = new Map<string, { at: number; value: bigint }>();

export async function readUsdcBalance(address: `0x${string}`): Promise<bigint> {
  const key = address.toLowerCase();
  const hit = balanceCache.get(key);
  if (hit && Date.now() - hit.at < BALANCE_TTL_MS) return hit.value;

  try {
    const value = await publicClient.readContract({
      address: USDC_BASE,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
    balanceCache.set(key, { at: Date.now(), value });
    lastGoodBalance.set(key, value);
    return value;
  } catch (err) {
    const stale = lastGoodBalance.get(key);
    if (stale !== undefined) return stale;
    throw err;
  }
}

/** True if we are currently serving a balance we could not refresh. */
export function balanceIsStale(address: `0x${string}`): boolean {
  const key = address.toLowerCase();
  const hit = balanceCache.get(key);
  return !hit || Date.now() - hit.at >= BALANCE_TTL_MS;
}
