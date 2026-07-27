#!/usr/bin/env node
// Read one KeeperHub execution back out of the audit trail.
//
// The endpoint below was pinned during the pre-build check against a real
// execution; the earlier version of this script probed several candidates
// because the shape wasn't known yet. `ExecutionRecord` in packages/shared is
// typed from this response.
//
// Usage (key is read from .env, never typed on the command line):
//   node --env-file=.env scripts/fetch-execution.mjs <executionId> [--raw]
//
// Optional override:
//   $env:KH_BASE_URL = "https://app.keeperhub.com"   # default below

const apiKey = process.env.KH_API_KEY;
const baseUrl = (process.env.KH_BASE_URL || "https://app.keeperhub.com").replace(/\/$/, "");
const argv = process.argv.slice(2).filter((a) => a !== "--");
const executionId = argv[0];
const raw = argv.includes("--raw");

if (!apiKey) {
  console.error("Missing KH_API_KEY env var. Set it to your kh_ API key.");
  process.exit(1);
}
if (!executionId) {
  console.error("Usage: node --env-file=.env scripts/fetch-execution.mjs <executionId> [--raw]");
  process.exit(1);
}

const url = `${baseUrl}/api/execute/${executionId}/status`;
const res = await fetch(url, {
  headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
});
const text = await res.text();

let body;
try {
  body = JSON.parse(text);
} catch {
  console.error(`[${res.status}] non-JSON response from ${url}:\n${text}`);
  process.exit(1);
}

if (!res.ok) {
  console.error(`[${res.status}] ${url}`);
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

if (raw) {
  console.log(JSON.stringify(body, null, 2));
} else {
  const tx = body.transactionHash;
  console.log(`execution ${executionId}`);
  console.log(`  status     ${body.status}`);
  console.log(`  success    ${body.result?.success}`);
  console.log(`  tx         ${tx ?? "(none)"}`);
  if (tx) console.log(`  basescan   https://basescan.org/tx/${tx}`);
  console.log(`  gasUsedWei ${body.gasUsedWei ?? "(none)"}`);
  console.log(`  completed  ${body.completedAt ?? "(pending)"}`);
}
