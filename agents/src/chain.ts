import { createPublicClient, http, erc20Abi } from "viem";
import { base } from "viem/chains";
import { recourseEscrowAbi, type OnchainJob, JobStatus } from "@recourse/shared";
import { config, USDC_BASE } from "./config.js";

/**
 * Read-only chain access for the agent (writes go via KeeperHub).
 *
 * Same hardening as the backend client: the public Base RPC rate-limits
 * aggressively, and a bare transport made `status` fail partway through
 * listing jobs. Batching coalesces same-tick calls into one request and the
 * retries ride out a throttle instead of surfacing it as a crash.
 */
export const publicClient = createPublicClient({
  chain: base,
  transport: http(config.chain.rpcUrl, {
    batch: { wait: 16 },
    retryCount: 4,
    retryDelay: 250,
  }),
});

export async function readJobCount(): Promise<bigint> {
  return publicClient.readContract({
    address: config.escrowAddress,
    abi: recourseEscrowAbi,
    functionName: "jobCount",
  });
}

export async function readJob(jobId: bigint): Promise<OnchainJob> {
  const raw = await publicClient.readContract({
    address: config.escrowAddress,
    abi: recourseEscrowAbi,
    functionName: "getJob",
    args: [jobId],
  });
  return { ...raw, status: raw.status as JobStatus };
}

export async function readUsdcBalance(address: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({
    address: USDC_BASE,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
}
