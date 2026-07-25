import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { recourseEscrowAbi, type OnchainJob, JobStatus } from "@recourse/shared";
import { config } from "./config.js";

/** Read-only chain access. Writes go through KeeperHub, not here. */
export const publicClient = createPublicClient({
  chain: base,
  transport: http(config.chain.rpcUrl),
});

/** Read a job's full on-chain state (source of truth for the resolver). */
export async function readJob(jobId: bigint): Promise<OnchainJob> {
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
}

/** Current observed increase in the subject's USDC balance vs the job baseline. */
export async function readObservedIncrease(jobId: bigint): Promise<bigint> {
  return publicClient.readContract({
    address: config.escrowAddress,
    abi: recourseEscrowAbi,
    functionName: "observedIncrease",
    args: [jobId],
  });
}

export async function readJobCount(): Promise<bigint> {
  return publicClient.readContract({
    address: config.escrowAddress,
    abi: recourseEscrowAbi,
    functionName: "jobCount",
  });
}
