import { createPublicClient, http, erc20Abi } from "viem";
import { base } from "viem/chains";
import { recourseEscrowAbi, type OnchainJob, JobStatus } from "@recourse/shared";
import { config, USDC_BASE } from "./config.js";

/** Read-only chain access for the agent (writes go via KeeperHub). */
export const publicClient = createPublicClient({ chain: base, transport: http(config.chain.rpcUrl) });

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
