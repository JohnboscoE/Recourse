#!/usr/bin/env node
// Discovery probe: find KeeperHub's MCP endpoint and list the tools it exposes.
//
// We don't yet know the transport (Streamable HTTP vs the older SSE pairing) or
// the path, so this tries the plausible candidates and speaks real MCP JSON-RPC
// at each. Whatever answers `initialize` + `tools/list` is what the agent will
// talk to.
//
// Usage:
//   node --env-file=.env scripts/probe-mcp.mjs

const apiKey = process.env.KH_API_KEY;
const baseUrl = (process.env.KH_BASE_URL || "https://app.keeperhub.com").replace(/\/$/, "");

if (!apiKey) {
  console.error("Missing KH_API_KEY.");
  process.exit(1);
}

const CANDIDATES = [
  "/api/mcp",
  "/mcp",
  "/api/mcp/sse",
  "/sse",
  "/api/mcp/v1",
  "/api/mcp/http",
];

function rpc(method, params, id = 1) {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params });
}

const INIT = rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "recourse-probe", version: "0.0.0" },
});

/** Streamable HTTP may answer as JSON or as an SSE stream; handle both. */
function parseMaybeSse(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  // SSE frames: pull the last `data:` payload.
  const dataLines = trimmed
    .split(/\r?\n/)
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim());
  for (const d of dataLines.reverse()) {
    try {
      return JSON.parse(d);
    } catch {
      /* keep looking */
    }
  }
  return null;
}

async function post(path, body, sessionId) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    // Streamable HTTP requires the client advertise both.
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const res = await fetch(`${baseUrl}${path}`, { method: "POST", headers, body });
  const text = await res.text();
  return {
    status: res.status,
    sessionId: res.headers.get("mcp-session-id"),
    contentType: res.headers.get("content-type"),
    body: parseMaybeSse(text),
    raw: text.slice(0, 400),
  };
}

console.log(`Base: ${baseUrl}\n`);

let found = null;

for (const path of CANDIDATES) {
  process.stdout.write(`probing ${path} … `);
  try {
    const r = await post(path, INIT);
    if (r.body?.result) {
      console.log(`OK [${r.status}]`);
      console.log(`   protocol: ${r.body.result.protocolVersion}`);
      console.log(`   server:   ${JSON.stringify(r.body.result.serverInfo)}`);
      console.log(`   caps:     ${JSON.stringify(r.body.result.capabilities)}`);
      if (r.sessionId) console.log(`   session:  ${r.sessionId}`);
      found = { path, sessionId: r.sessionId };
      break;
    }
    console.log(`[${r.status}] ${r.body?.error?.message ?? r.raw.slice(0, 90)}`);
  } catch (err) {
    console.log(`network error: ${err.message}`);
  }
}

if (!found) {
  console.log(
    "\n==> No candidate spoke MCP. Record this in the friction log and fall back " +
      "to REST for execution (the resolver already uses REST successfully).",
  );
  process.exit(2);
}

// MCP requires the initialized notification before normal requests.
await post(
  found.path,
  JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  found.sessionId,
);

console.log(`\nListing tools on ${found.path} …\n`);
const list = await post(found.path, rpc("tools/list", {}, 2), found.sessionId);

const tools = list.body?.result?.tools;
if (!tools) {
  console.log(`tools/list failed: ${list.status} ${list.raw}`);
  process.exit(3);
}

for (const t of tools) {
  console.log(`• ${t.name}`);
  if (t.description) console.log(`    ${t.description.split("\n")[0].slice(0, 140)}`);
  const props = t.inputSchema?.properties;
  if (props) {
    const req = new Set(t.inputSchema.required ?? []);
    const sig = Object.keys(props)
      .map((k) => (req.has(k) ? k : `${k}?`))
      .join(", ");
    console.log(`    (${sig})`);
  }
}

console.log(`\n==> MCP endpoint: ${found.path} — ${tools.length} tools.`);
