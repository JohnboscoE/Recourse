import { config } from "./config.js";

/**
 * Minimal MCP client for KeeperHub, Streamable HTTP transport.
 *
 * Verified against the live server (scripts/probe-mcp.mjs): POST /mcp,
 * protocol 2025-06-18, server "keeperhub" 1.2.0, authenticated with the same
 * `kh_` key used for REST. The session id comes back on the initialize
 * response and must be echoed on every subsequent request.
 *
 * We speak the protocol directly rather than pulling in the official SDK: the
 * surface we need is three methods, and a hand-rolled client keeps the
 * dependency footprint and the failure modes something we fully control.
 */

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number;
  result?: any;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpToolResult {
  content?: { type: string; text?: string }[];
  isError?: boolean;
}

/**
 * Streamable HTTP allows either a JSON body or an SSE stream in response to a
 * POST. Handle both: take the last complete `data:` frame if it's a stream.
 */
function parseBody(text: string): JsonRpcResponse | null {
  const t = text.trim();
  if (t.startsWith("{")) {
    try {
      return JSON.parse(t) as JsonRpcResponse;
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
      return JSON.parse(f) as JsonRpcResponse;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

export class KeeperHubMcp {
  private sessionId: string | null = null;
  private ready: Promise<void> | null = null;
  private nextId = 1;

  constructor(
    private readonly baseUrl = config.keeperHub.baseUrl,
    private readonly apiKey = config.keeperHub.apiKey,
    private readonly path = config.keeperHub.mcpPath,
  ) {}

  private async send(method: string, params?: unknown, withId = true) {
    if (!this.apiKey) throw new Error("KH_API_KEY not set");

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      // Streamable HTTP requires the client accept both shapes.
      Accept: "application/json, text/event-stream",
    };
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;

    const body = withId
      ? { jsonrpc: "2.0", id: this.nextId++, method, params }
      : { jsonrpc: "2.0", method, params };

    const res = await fetch(`${this.baseUrl}${this.path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`MCP ${method} failed: ${res.status} ${text.slice(0, 400)}`);
    }
    return { parsed: parseBody(text), raw: text };
  }

  /** Handshake once; concurrent callers share the same in-flight promise. */
  private connect(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const init = await this.send("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "recourse-agent", version: "0.1.0" },
      });
      if (!init.parsed?.result) {
        throw new Error(`MCP initialize returned no result: ${init.raw.slice(0, 300)}`);
      }
      // Required by the protocol before any normal request.
      await this.send("notifications/initialized", undefined, false);
    })().catch((err) => {
      this.ready = null; // allow a later retry
      throw err;
    });
    return this.ready;
  }

  /** List available tools — used by the discovery demo. */
  async listTools(): Promise<{ name: string; description?: string }[]> {
    await this.connect();
    const res = await this.send("tools/list", {});
    return res.parsed?.result?.tools ?? [];
  }

  /** Call a tool and return its parsed JSON payload. */
  async callTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
    await this.connect();
    const res = await this.send("tools/call", { name, arguments: args });

    if (res.parsed?.error) {
      const e = res.parsed.error;
      throw new Error(`MCP tool ${name} error ${e.code}: ${e.message}`);
    }

    const result = res.parsed?.result as McpToolResult | undefined;
    const text = result?.content?.find((c) => c.type === "text")?.text;

    if (result?.isError) {
      throw new McpToolError(name, text ?? "unknown tool error");
    }
    if (text === undefined) return undefined as T;

    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }
}

/** A tool-level failure (as opposed to a transport or protocol failure). */
export class McpToolError extends Error {
  constructor(
    readonly tool: string,
    readonly detail: string,
  ) {
    super(`MCP tool ${tool} failed: ${detail.slice(0, 500)}`);
    this.name = "McpToolError";
  }
}

/** Shared client. */
export const mcp = new KeeperHubMcp();
