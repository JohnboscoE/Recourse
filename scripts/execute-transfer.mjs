#!/usr/bin/env node
// FIRST REAL TRANSACTION via KeeperHub.
// Submits a USDC transfer on Base through KeeperHub's direct-execution API,
// then polls the execution status and prints the RAW JSON audit-trail response.
// That raw response is what we turn into the shared `ExecutionRecord` type.
//
// Usage (PowerShell):
//   node --env-file=.env scripts/execute-transfer.mjs --to 0xYourRecipient --amount 0.5
//
// Defaults: Base (chainId 8453), native USDC token. Amount is in human units.

const apiKey = process.env.KH_API_KEY;
const baseUrl = (process.env.KH_BASE_URL || "https://app.keeperhub.com").replace(/\/$/, "");

// Base mainnet + native USDC
const CHAIN_ID = 8453;
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// --- tiny arg parser ---
const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
const to = arg("to");
const amount = arg("amount", "0.5");
const tokenAddress = arg("token-address", USDC_BASE);

if (!apiKey) {
  console.error("Missing KH_API_KEY. Run with: node --env-file=.env scripts/execute-transfer.mjs ...");
  process.exit(1);
}
if (!to) {
  console.error("Missing --to <recipientAddress>. Example:");
  console.error("  node --env-file=.env scripts/execute-transfer.mjs --to 0xYourWallet --amount 0.5");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

async function submit() {
  const body = {
    chainId: CHAIN_ID,
    recipientAddress: to,
    amount,
    tokenAddress,
  };
  console.log("Submitting transfer:");
  console.log(JSON.stringify(body, null, 2), "\n");

  const res = await fetch(`${baseUrl}/api/execute/transfer`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`Submit response [${res.status}]:`);
  console.log(JSON.stringify(json, null, 2), "\n");
  if (!res.ok) {
    console.error("Submit failed — see response above. Nothing was sent.");
    process.exit(1);
  }
  return json.executionId;
}

async function pollStatus(executionId) {
  // A few candidate status paths in case the exact one differs from docs.
  const paths = [
    `/api/execute/${executionId}/status`,
    `/api/workflows/executions/${executionId}/status`,
  ];
  for (let attempt = 1; attempt <= 10; attempt++) {
    for (const path of paths) {
      const res = await fetch(`${baseUrl}${path}`, { headers });
      if (!res.ok) continue;
      const json = await res.json();
      console.log(`Status [attempt ${attempt}] via ${path}:`);
      console.log(JSON.stringify(json, null, 2), "\n");
      const status = (json.status || "").toLowerCase();
      if (["completed", "success", "error", "failed", "cancelled"].includes(status)) {
        return json;
      }
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log("Still not terminal after polling. Re-run fetch-execution.mjs later with the executionId.");
}

const executionId = await submit();
console.log(`>>> executionId: ${executionId}\n`);
const final = await pollStatus(executionId);
console.log("\n==================== COPY EVERYTHING ABOVE ====================");
console.log("Paste the raw JSON (especially the final status block) back into chat.");
console.log("That becomes the ExecutionRecord shared type.");
if (final?.transactionHashes) {
  console.log("\nTx hashes:", JSON.stringify(final.transactionHashes));
}
