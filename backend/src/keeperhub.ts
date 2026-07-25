import type { ExecutionRecord } from "@recourse/shared";
import { recourseEscrowAbi } from "@recourse/shared";
import { config } from "./config.js";

/**
 * Thin KeeperHub REST client. All on-chain execution (including escrow
 * release/refund) goes through here, never a direct RPC send — that is a hard
 * constraint of the project.
 */

function headers() {
  if (!config.keeperHub.apiKey) throw new Error("KH_API_KEY not set");
  return {
    Authorization: `Bearer ${config.keeperHub.apiKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

/** Read one execution's audit-trail record. */
export async function getExecution(executionId: string): Promise<ExecutionRecord> {
  const res = await fetch(`${config.keeperHub.baseUrl}/api/execute/${executionId}/status`, {
    headers: headers(),
  });
  if (!res.ok) {
    throw new Error(`getExecution ${executionId} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as ExecutionRecord;
}

/**
 * Execute a write call on the escrow contract via KeeperHub.
 * Returns the executionId for audit-trail polling.
 */
export async function executeEscrowCall(
  functionName: "release" | "refund",
  args: (string | number)[],
): Promise<{ executionId: string; status: string }> {
  const body = {
    chainId: config.chain.id,
    contractAddress: config.escrowAddress,
    functionName,
    functionArgs: JSON.stringify(args.map(String)),
    abi: JSON.stringify(recourseEscrowAbi),
  };
  const res = await fetch(`${config.keeperHub.baseUrl}/api/execute/contract-call`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`executeEscrowCall ${functionName} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { executionId: string; status: string };
}
