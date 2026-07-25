#!/usr/bin/env node
// Pre-build sanity check: does the kh_ API key authenticate against the REST API?
// Answers friction-log open question #1. Hits a few harmless read-only endpoints
// and reports which (if any) accept the key.
//
// Usage (PowerShell):
//   node --env-file=.env scripts/check-auth.mjs

const apiKey = process.env.KH_API_KEY;
const baseUrl = (process.env.KH_BASE_URL || "https://app.keeperhub.com").replace(/\/$/, "");

if (!apiKey) {
  console.error("Missing KH_API_KEY. Did you run with --env-file=.env ?");
  process.exit(1);
}

// Read-only endpoints that should exist for any authenticated user.
const candidates = [
  "/api/user",
  "/api/workflows",
  "/api/integrations",
];

async function probe(path) {
  const url = `${baseUrl}${path}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
    return { path, status: res.status, ok: res.ok, body };
  } catch (err) {
    return { path, status: 0, ok: false, body: String(err) };
  }
}

console.log(`Base: ${baseUrl}`);
console.log(`Key:  ${apiKey.slice(0, 6)}...${apiKey.slice(-4)} (loaded from .env)\n`);

let anyOk = false;
for (const path of candidates) {
  const r = await probe(path);
  if (r.ok) anyOk = true;
  console.log(`${r.ok ? "OK " : "-- "}[${r.status}] ${r.path}`);
  console.log(JSON.stringify(r.body, null, 2).slice(0, 800));
  console.log("");
}

console.log(
  anyOk
    ? "\n==> Key authenticates over REST. Good to proceed."
    : "\n==> No endpoint accepted the key over REST. Note this in the friction log — " +
        "REST may need a different credential than MCP, or the paths differ."
);
