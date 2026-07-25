import type { ExecutionRecord } from "@recourse/shared";
import { config } from "./config.js";

/**
 * KeeperHub REST client for the agent side. Every on-chain action the agent
 * takes — approve, createJob, claim, and the actual paying transfer — goes
 * through here. No direct RPC sends (hard constraint).
 */

function headers() {
  if (!config.keeperHub.apiKey) throw new Error("KH_API_KEY not set");
  return {
    Authorization: `Bearer ${config.keeperHub.apiKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function post(path: string, body: unknown): Promise<{ executionId: string; status: string }> {
  const res = await fetch(`${config.keeperHub.baseUrl}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${text}`);
  return JSON.parse(text) as { executionId: string; status: string };
}

/** Execute a write function on any contract via KeeperHub. */
export function contractCall(
  contractAddress: string,
  functionName: string,
  functionArgs: (string | number)[],
  abi: readonly unknown[],
): Promise<{ executionId: string; status: string }> {
  return post("/api/execute/contract-call", {
    chainId: config.chain.id,
    contractAddress,
    functionName,
    functionArgs: JSON.stringify(functionArgs.map(String)),
    abi: JSON.stringify(abi),
  });
}

/** Send a token (or native ETH if tokenAddress omitted) via KeeperHub. */
export function transfer(args: {
  to: string;
  amount: string; // human units
  tokenAddress?: string;
}): Promise<{ executionId: string; status: string }> {
  return post("/api/execute/transfer", {
    chainId: config.chain.id,
    recipientAddress: args.to,
    amount: args.amount,
    ...(args.tokenAddress ? { tokenAddress: args.tokenAddress } : {}),
  });
}

export async function getExecution(executionId: string): Promise<ExecutionRecord> {
  const res = await fetch(`${config.keeperHub.baseUrl}/api/execute/${executionId}/status`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`getExecution ${executionId} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as ExecutionRecord;
}
