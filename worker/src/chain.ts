import { erc20Abi, parseAbiItem } from "viem";
import { recourseEscrowAbi, type OnchainJob, JobStatus } from "@recourse/shared";
import { makeClient, readConfig, USDC_BASE, type Env } from "./env.js";

/**
 * Read-only chain access. Writes go through KeeperHub, never a direct RPC send.
 *
 * Same Multicall3 batching as the Node backend: reading the board costs one
 * round trip regardless of job count, and every value comes from a single
 * block so the board is a consistent snapshot rather than a smear.
 */

export async function readJobCount(env: Env): Promise<bigint> {
  const cfg = readConfig(env);
  return makeClient(env).readContract({
    address: cfg.escrowAddress,
    abi: recourseEscrowAbi,
    functionName: "jobCount",
  });
}

export async function readJob(env: Env, jobId: bigint): Promise<OnchainJob> {
  const cfg = readConfig(env);
  const raw = await makeClient(env).readContract({
    address: cfg.escrowAddress,
    abi: recourseEscrowAbi,
    functionName: "getJob",
    args: [jobId],
  });
  return { ...raw, status: raw.status as JobStatus } as OnchainJob;
}

export async function readObservedIncrease(env: Env, jobId: bigint): Promise<bigint> {
  const cfg = readConfig(env);
  return makeClient(env).readContract({
    address: cfg.escrowAddress,
    abi: recourseEscrowAbi,
    functionName: "observedIncrease",
    args: [jobId],
  });
}

export async function readAllJobs(
  env: Env,
): Promise<{ jobId: bigint; job: OnchainJob; observedIncrease: bigint }[]> {
  const cfg = readConfig(env);
  const client = makeClient(env);

  const count = await client.readContract({
    address: cfg.escrowAddress,
    abi: recourseEscrowAbi,
    functionName: "jobCount",
  });
  if (count === 0n) return [];

  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
  const escrow = { address: cfg.escrowAddress, abi: recourseEscrowAbi } as const;

  const results = (await client.multicall({
    allowFailure: false,
    contracts: ids.flatMap((id) => [
      { ...escrow, functionName: "getJob", args: [id] },
      { ...escrow, functionName: "observedIncrease", args: [id] },
    ]),
  })) as unknown as unknown[];

  return ids.map((jobId, i) => {
    const raw = results[i * 2] as OnchainJob & { status: number };
    return {
      jobId,
      job: { ...raw, status: raw.status as JobStatus },
      observedIncrease: results[i * 2 + 1] as bigint,
    };
  });
}

export async function readUsdcBalance(
  env: Env,
  address: `0x${string}`,
): Promise<bigint> {
  return makeClient(env).readContract({
    address: USDC_BASE,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
}

/** Both balances in one batched pair. */
export async function readBalances(env: Env) {
  const cfg = readConfig(env);
  const [escrow, wallet] = await Promise.all([
    readUsdcBalance(env, cfg.escrowAddress),
    readUsdcBalance(env, cfg.keeperHubWallet),
  ]);
  return { escrow, wallet };
}

export { parseAbiItem };
