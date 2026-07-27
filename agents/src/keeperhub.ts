import { randomUUID } from "node:crypto";
import type { ExecutionRecord } from "@recourse/shared";
import { config } from "./config.js";
import { mcp, McpToolError } from "./mcp.js";

/**
 * KeeperHub client for the agent side. Every on-chain action the agent takes —
 * approve, createJob, claim, and the actual paying transfer — goes through
 * here. No direct RPC sends (hard constraint).
 *
 * Two transports speak to the same backend:
 *
 *   mcp  (default) — the MCP server at POST /mcp. This is the surface the
 *                    hackathon scores, and it accepts an idempotency_key that
 *                    the REST endpoints do not expose.
 *   rest           — the original /api/execute/* endpoints.
 *
 * Both return the same ExecutionRecord shape, verified against a live
 * execution, so the resolver and audit trail are transport-agnostic.
 *
 * If MCP fails at the transport level (server down, protocol change) we fall
 * back to REST once and say so, rather than letting a demo die on an
 * integration that is not load-bearing for correctness. A tool-level error
 * (bad arguments, insufficient funds) is a real failure and is NOT retried on
 * the other transport — that would just execute a broken call twice.
 */

export interface ExecutionHandle {
  executionId: string;
  status: string;
  /** Which transport actually performed the call, for the audit trail. */
  via: "mcp" | "rest";
}

function headers() {
  if (!config.keeperHub.apiKey) throw new Error("KH_API_KEY not set");
  return {
    Authorization: `Bearer ${config.keeperHub.apiKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function postRest(path: string, body: unknown): Promise<{ executionId: string; status: string }> {
  const res = await fetch(`${config.keeperHub.baseUrl}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${text}`);
  return JSON.parse(text) as { executionId: string; status: string };
}

/**
 * Run `viaMcp`, falling back to `viaRest` only for transport-level failures.
 * A tool-level error means the request itself was bad — retrying it elsewhere
 * would execute the same broken call against a second code path.
 */
async function execute(
  viaMcp: () => Promise<{ executionId: string; status: string }>,
  viaRest: () => Promise<{ executionId: string; status: string }>,
): Promise<ExecutionHandle> {
  if (config.keeperHub.transport === "rest") {
    return { ...(await viaRest()), via: "rest" };
  }
  try {
    return { ...(await viaMcp()), via: "mcp" };
  } catch (err) {
    if (err instanceof McpToolError) throw err; // genuine failure — do not retry
    console.warn(
      `[keeperhub] MCP transport unavailable (${(err as Error).message.slice(0, 160)}); ` +
        `falling back to REST for this call`,
    );
    return { ...(await viaRest()), via: "rest" };
  }
}

/**
 * Execute a write function on any contract via KeeperHub.
 *
 * `idempotencyKey`: reusing a key with identical arguments returns the original
 * result instead of executing again (24h window); reusing it with different
 * arguments is a 409. Pass a deterministic key wherever a duplicate would cost
 * real money. Defaults to a fresh uuid, which is never a surprising cache hit.
 */
export function contractCall(
  contractAddress: string,
  functionName: string,
  functionArgs: (string | number)[],
  abi: readonly unknown[],
  idempotencyKey: string = randomUUID(),
): Promise<ExecutionHandle> {
  return execute(
    () =>
      mcp.callTool("execute_contract_call", {
        // MCP takes snake_case and a *string* chain id; REST takes camelCase
        // and a number. Same backend, two conventions.
        contract_address: contractAddress,
        chain_id: String(config.chain.id),
        function_name: functionName,
        function_args: JSON.stringify(functionArgs.map(String)),
        abi: JSON.stringify(abi),
        idempotency_key: idempotencyKey,
      }),
    () =>
      postRest("/api/execute/contract-call", {
        chainId: config.chain.id,
        contractAddress,
        functionName,
        functionArgs: JSON.stringify(functionArgs.map(String)),
        abi: JSON.stringify(abi),
      }),
  );
}

/** Send a token (or native ETH if tokenAddress omitted) via KeeperHub. */
export function transfer(args: {
  to: string;
  amount: string; // human units
  tokenAddress?: string;
  idempotencyKey?: string;
}): Promise<ExecutionHandle> {
  const key = args.idempotencyKey ?? randomUUID();
  return execute(
    () =>
      mcp.callTool("execute_transfer", {
        chain_id: String(config.chain.id),
        to_address: args.to,
        amount: args.amount,
        ...(args.tokenAddress ? { token_address: args.tokenAddress } : {}),
        idempotency_key: key,
      }),
    () =>
      postRest("/api/execute/transfer", {
        chainId: config.chain.id,
        recipientAddress: args.to,
        amount: args.amount,
        ...(args.tokenAddress ? { tokenAddress: args.tokenAddress } : {}),
      }),
  );
}

/**
 * Read one execution's audit-trail record, reporting which transport actually
 * served it. The caller-facing label must reflect what happened, not what was
 * configured — a fallback that still claims "via mcp" is worse than no label.
 */
export async function getExecutionVia(
  executionId: string,
): Promise<{ record: ExecutionRecord; via: "mcp" | "rest" }> {
  if (config.keeperHub.transport === "mcp") {
    try {
      const record = await mcp.callTool<ExecutionRecord>("get_direct_execution_status", {
        execution_id: executionId,
      });
      return { record, via: "mcp" };
    } catch (err) {
      if (err instanceof McpToolError) throw err;
      console.warn(
        `[keeperhub] MCP read unavailable (${(err as Error).message.slice(0, 160)}); ` +
          `falling back to REST`,
      );
    }
  }
  const res = await fetch(`${config.keeperHub.baseUrl}/api/execute/${executionId}/status`, {
    headers: headers(),
  });
  if (!res.ok) {
    throw new Error(`getExecution ${executionId} failed: ${res.status} ${await res.text()}`);
  }
  return { record: (await res.json()) as ExecutionRecord, via: "rest" };
}

/** Read one execution's audit-trail record. */
export async function getExecution(executionId: string): Promise<ExecutionRecord> {
  return (await getExecutionVia(executionId)).record;
}

/** Tool discovery — the agent asking KeeperHub what it can do. */
export function listMcpTools() {
  return mcp.listTools();
}
