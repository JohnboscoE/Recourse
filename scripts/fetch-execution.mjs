#!/usr/bin/env node
// Pre-build probe: read one KeeperHub execution back through the audit trail and
// dump the RAW JSON, so we can lock down the shared `ExecutionRecord` type from
// the real response shape (not from docs prose).
//
// We don't yet know whether an agent execution surfaces as a "workflow"
// execution or a "direct" execution, so this tries several candidate endpoints
// and prints whatever each returns. Whichever one comes back with real data is
// the path our resolver will use.
//
// Usage (PowerShell) — key is loaded from the .env file, you never type it here:
//   node --env-file=.env scripts/fetch-execution.mjs <executionId>
//
// Optional overrides:
//   $env:KH_BASE_URL  = "https://app.keeperhub.com"   # default below
//   $env:KH_WORKFLOW_ID = "<workflowId>"              # if it's a workflow run

const apiKey = process.env.KH_API_KEY;
const baseUrl = (process.env.KH_BASE_URL || "https://app.keeperhub.com").replace(/\/$/, "");
const workflowId = process.env.KH_WORKFLOW_ID;
const executionId = process.argv[2];

if (!apiKey) {
  console.error("Missing KH_API_KEY env var. Set it to your kh_ API key.");
  process.exit(1);
}
if (!executionId) {
  console.error("Usage: node scripts/fetch-execution.mjs <executionId>");
  process.exit(1);
}

// Candidate endpoints, in the order we think they're most likely to be real.
// Add/remove as the docs firm up.
const candidates = [
  `/api/workflows/executions/${executionId}/status`,
  `/api/workflows/executions/${executionId}/wait?timeoutMs=30000`,
  `/api/direct-execution/${executionId}`,
  `/api/direct-execution/${executionId}/status`,
  `/api/executions/${executionId}`,
];
if (workflowId) {
  candidates.unshift(`/api/workflows/${workflowId}/executions`);
}

async function probe(path) {
  const url = `${baseUrl}${path}`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text; // non-JSON (HTML error page, etc.)
    }
    return { path, status: res.status, ok: res.ok, body };
  } catch (err) {
    return { path, status: 0, ok: false, body: String(err) };
  }
}

console.log(`Base: ${baseUrl}`);
console.log(`Execution: ${executionId}\n`);

for (const path of candidates) {
  const r = await probe(path);
  const marker = r.ok ? "OK " : "-- ";
  console.log(`${marker}[${r.status}] ${r.path}`);
  console.log(JSON.stringify(r.body, null, 2));
  console.log("");
}

console.log(
  "\nPaste the RAW JSON from whichever endpoint returned real execution data " +
    "back into the chat — that becomes the ExecutionRecord shared type."
);
