#!/usr/bin/env node
// Call any KeeperHub MCP tool from the shell. Ops + discovery tooling.
//
// Endpoint and transport were pinned by scripts/probe-mcp.mjs:
//   POST /mcp, Streamable HTTP, protocol 2025-06-18, Bearer <kh_ key>.
//
// Usage:
//   node --env-file=.env scripts/mcp-call.mjs <tool> '<json-args>'
//   node --env-file=.env scripts/mcp-call.mjs tools_documentation '{}'
//   node --env-file=.env scripts/mcp-call.mjs search_workflows '{"sort":"price"}'
//   node --env-file=.env scripts/mcp-call.mjs --list

const apiKey = process.env.KH_API_KEY;
const baseUrl = (process.env.KH_BASE_URL || "https://app.keeperhub.com").replace(/\/$/, "");
const MCP_PATH = process.env.KH_MCP_PATH || "/mcp";

const argv = process.argv.slice(2).filter((a) => a !== "--");
const tool = argv[0];
const rawArgs = argv[1] ?? "{}";

if (!apiKey) {
  console.error("Missing KH_API_KEY.");
  process.exit(1);
}
if (!tool) {
  console.error("Usage: mcp-call.mjs <tool> '<json-args>'   (or --list)");
  process.exit(1);
}

function parseMaybeSse(text) {
  const t = text.trim();
  if (t.startsWith("{")) {
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  }
  const lines = t
    .split(/\r?\n/)
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim());
  for (const d of lines.reverse()) {
    try {
      return JSON.parse(d);
    } catch {
      /* keep looking */
    }
  }
  return null;
}

let session = null;

async function rpc(method, params, id) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (session) headers["Mcp-Session-Id"] = session;

  const res = await fetch(`${baseUrl}${MCP_PATH}`, {
    method: "POST",
    headers,
    body: JSON.stringify(
      id === undefined ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id, method, params },
    ),
  });
  const sid = res.headers.get("mcp-session-id");
  if (sid) session = sid;
  const text = await res.text();
  return parseMaybeSse(text) ?? { _status: res.status, _raw: text.slice(0, 500) };
}

// Handshake.
const init = await rpc(
  "initialize",
  {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "recourse-cli", version: "0.0.0" },
  },
  1,
);
if (!init.result) {
  console.error("initialize failed:", JSON.stringify(init, null, 2));
  process.exit(2);
}
await rpc("notifications/initialized", undefined);

if (tool === "--list") {
  const list = await rpc("tools/list", {}, 2);
  for (const t of list.result?.tools ?? []) console.log(t.name);
  process.exit(0);
}

// Full description + input schema for one tool (descriptions are long and get
// truncated in listings, and that is where the pricing/payment detail lives).
if (tool === "--describe") {
  const list = await rpc("tools/list", {}, 2);
  const want = rawArgs;
  for (const t of list.result?.tools ?? []) {
    if (want !== "{}" && t.name !== want) continue;
    console.log(`=== ${t.name} ===`);
    console.log(t.description ?? "(no description)");
    console.log("--- inputSchema ---");
    console.log(JSON.stringify(t.inputSchema, null, 2));
    console.log("");
  }
  process.exit(0);
}

let args;
try {
  args = JSON.parse(rawArgs);
} catch (e) {
  console.error(`Bad JSON args: ${e.message}`);
  process.exit(1);
}

const out = await rpc("tools/call", { name: tool, arguments: args }, 3);

if (out.error) {
  console.error(`MCP error ${out.error.code}: ${out.error.message}`);
  if (out.error.data) console.error(JSON.stringify(out.error.data, null, 2));
  process.exit(4);
}

// Tool results arrive as content blocks; unwrap text and pretty-print JSON.
for (const block of out.result?.content ?? []) {
  if (block.type !== "text") {
    console.log(JSON.stringify(block, null, 2));
    continue;
  }
  try {
    console.log(JSON.stringify(JSON.parse(block.text), null, 2));
  } catch {
    console.log(block.text);
  }
}
if (out.result?.isError) process.exit(5);
