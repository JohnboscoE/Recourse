import type { ExecutionRecord } from "@recourse/shared";
import { recourseEscrowAbi } from "@recourse/shared";
import {
  contractCall as agentContractCall,
  getExecution as agentGetExecution,
} from "@recourse/agents";
import { config } from "./config.js";

/**
 * KeeperHub access for the resolver.
 *
 * Delegates to the agent package's client so settlement travels the same
 * transport as the agent's own work — MCP by default, REST as fallback. Before
 * this, the agent executed over MCP while the resolver quietly settled over
 * REST, which meant the loop was only half on the scored surface and the two
 * halves could drift apart.
 *
 * All on-chain execution (including release/refund) goes through KeeperHub,
 * never a direct RPC send — that is a hard constraint of the project.
 */

/** Read one execution's audit-trail record. */
export function getExecution(executionId: string): Promise<ExecutionRecord> {
  return agentGetExecution(executionId);
}

/**
 * Execute a settlement call on the escrow via KeeperHub.
 *
 * The idempotency key is deterministic per (action, job): a job can only settle
 * once, so replaying after an ambiguous failure should return the original
 * execution rather than burn a second transaction that the contract would
 * revert anyway.
 */
export async function executeEscrowCall(
  functionName: "release" | "refund",
  args: (string | number)[],
): Promise<{ executionId: string; status: string; via: "mcp" | "rest" }> {
  return agentContractCall(
    config.escrowAddress,
    functionName,
    args,
    recourseEscrowAbi,
    `recourse:settle:${functionName}:${args[0]}`,
  );
}
