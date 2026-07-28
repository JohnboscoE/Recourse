import type { ExecutionRecord } from "@recourse/shared";
import { recourseEscrowAbi } from "@recourse/shared";
import { readConfig, CHAIN_ID, USDC_BASE, type Env } from "./env.js";

/**
 * KeeperHub client for the Worker.
 *
 * Ports cleanly because it was always just `fetch` — the only Node-specific
 * piece was `randomUUID`, and `crypto.randomUUID()` is available on Workers as
 * a web standard.
 *
 * MCP is the default transport, with REST as a fallback for transport-level
 * failures only. A tool-level error is a real failure and is never retried onto
 * the other transport — that would execute the same broken call twice.
 */

function headers(env: Env) {
  const cfg = readConfig(env);
  if (!cfg.keeperHub.apiKey) throw new Error("KH_API_KEY not set");
  return {
    Authorization: `Bearer ${cfg.keeperHub.apiKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export class McpToolError extends Error {
  constructor(
    readonly tool: string,
    readonly detail: string,
  ) {
    super(`MCP tool ${tool} failed: ${detail.slice(0, 400)}`);
    this.name = "McpToolError";
  }
}

/** Streamable HTTP may answer as JSON or as an SSE stream. Handle both. */
function parseBody(text: string): any | null {
  const t = text.trim();
  if (t.startsWith("{")) {
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  }
  const frames = t
    .split(/\r?\n/)
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim());
  for (const f of frames.reverse()) {
    try {
      return JSON.parse(f);
    } catch {
      /* keep looking */
    }
  }
  return null;
}

/**
 * One MCP session per call.
 *
 * The Node client keeps a session alive across calls. An isolate may not
 * survive between requests, so caching a session id would sometimes work and
 * sometimes silently fail — the handshake is two extra round trips and buys
 * determinism.
 */
async function mcpCall<T>(
  env: Env,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const cfg = readConfig(env);
  const url = `${cfg.keeperHub.baseUrl}${cfg.keeperHub.mcpPath}`;
  const h: Record<string, string> = {
    ...headers(env),
    Accept: "application/json, text/event-stream",
  };

  const post = async (body: unknown, sessionId?: string | null) => {
    const res = await fetch(url, {
      method: "POST",
      headers: sessionId ? { ...h, "Mcp-Session-Id": sessionId } : h,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`MCP ${name}: ${res.status} ${text.slice(0, 300)}`);
    return { parsed: parseBody(text), sessionId: res.headers.get("mcp-session-id") };
  };

  const init = await post({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "recourse-worker", version: "0.1.0" },
    },
  });
  if (!init.parsed?.result) throw new Error("MCP initialize returned no result");

  await post({ jsonrpc: "2.0", method: "notifications/initialized" }, init.sessionId);

  const out = await post(
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } },
    init.sessionId,
  );

  if (out.parsed?.error) {
    throw new Error(`MCP ${name} error: ${out.parsed.error.message}`);
  }
  const result = out.parsed?.result;
  const text = result?.content?.find((c: any) => c.type === "text")?.text;
  if (result?.isError) throw new McpToolError(name, text ?? "unknown tool error");
  if (text === undefined) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

export async function getExecution(
  env: Env,
  executionId: string,
): Promise<ExecutionRecord> {
  const cfg = readConfig(env);
  try {
    return await mcpCall<ExecutionRecord>(env, "get_direct_execution_status", {
      execution_id: executionId,
    });
  } catch (err) {
    if (err instanceof McpToolError) throw err;
    const res = await fetch(
      `${cfg.keeperHub.baseUrl}/api/execute/${executionId}/status`,
      { headers: headers(env) },
    );
    if (!res.ok) throw new Error(`getExecution ${executionId}: ${res.status}`);
    return (await res.json()) as ExecutionRecord;
  }
}

export interface ExecutionHandle {
  executionId: string;
  status: string;
  via: "mcp" | "rest";
}

async function contractCall(
  env: Env,
  contractAddress: string,
  functionName: string,
  functionArgs: (string | number)[],
  abi: readonly unknown[],
  idempotencyKey: string,
): Promise<ExecutionHandle> {
  const cfg = readConfig(env);
  try {
    const r = await mcpCall<{ executionId: string; status: string }>(
      env,
      "execute_contract_call",
      {
        contract_address: contractAddress,
        chain_id: String(CHAIN_ID),
        function_name: functionName,
        function_args: JSON.stringify(functionArgs.map(String)),
        abi: JSON.stringify(abi),
        idempotency_key: idempotencyKey,
      },
    );
    return { ...r, via: "mcp" };
  } catch (err) {
    if (err instanceof McpToolError) throw err;
    const res = await fetch(`${cfg.keeperHub.baseUrl}/api/execute/contract-call`, {
      method: "POST",
      headers: headers(env),
      body: JSON.stringify({
        chainId: CHAIN_ID,
        contractAddress,
        functionName,
        functionArgs: JSON.stringify(functionArgs.map(String)),
        abi: JSON.stringify(abi),
      }),
    });
    if (!res.ok) throw new Error(`contract-call: ${res.status} ${await res.text()}`);
    return { ...((await res.json()) as any), via: "rest" };
  }
}

export async function transfer(
  env: Env,
  args: { to: string; amount: string; idempotencyKey: string },
): Promise<ExecutionHandle> {
  const cfg = readConfig(env);
  try {
    const r = await mcpCall<{ executionId: string; status: string }>(
      env,
      "execute_transfer",
      {
        chain_id: String(CHAIN_ID),
        to_address: args.to,
        amount: args.amount,
        token_address: USDC_BASE,
        idempotency_key: args.idempotencyKey,
      },
    );
    return { ...r, via: "mcp" };
  } catch (err) {
    if (err instanceof McpToolError) throw err;
    const res = await fetch(`${cfg.keeperHub.baseUrl}/api/execute/transfer`, {
      method: "POST",
      headers: headers(env),
      body: JSON.stringify({
        chainId: CHAIN_ID,
        recipientAddress: args.to,
        amount: args.amount,
        tokenAddress: USDC_BASE,
      }),
    });
    if (!res.ok) throw new Error(`transfer: ${res.status} ${await res.text()}`);
    return { ...((await res.json()) as any), via: "rest" };
  }
}

/** Settlement. Deterministic key: a job settles once, so replays are safe. */
export function executeEscrowCall(
  env: Env,
  functionName: "release" | "refund",
  jobId: string,
): Promise<ExecutionHandle> {
  const cfg = readConfig(env);
  return contractCall(
    env,
    cfg.escrowAddress,
    functionName,
    [jobId],
    recourseEscrowAbi,
    `recourse:settle:${functionName}:${jobId}`,
  );
}

export { contractCall };
