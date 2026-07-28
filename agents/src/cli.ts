import { parseUnits, formatUnits } from "viem";
import { JobStatus } from "@recourse/shared";
import { config, USDC_DECIMALS } from "./config.js";
import { readJob, readJobCount, readUsdcBalance } from "./chain.js";
import { approveUsdc, createJob, claim, payToSubject } from "./actions.js";
import { listMcpTools, getExecutionVia } from "./keeperhub.js";
import {
  callPaidWorkflow,
  searchWorkflows,
  listX402Payments,
  agenticWalletAddress,
} from "./x402.js";

/**
 * Worker-agent CLI. Drives the full loop against the live escrow, with every
 * on-chain action routed through KeeperHub.
 *
 *   post      --subject 0x.. --min 0.1 --pay 0.05 [--deadline-mins 30]
 *   work      <jobId>                 # honest agent: deliver >= min, then claim
 *   work-fail <jobId> [--send 0.02]   # failing agent: deliver too little, then claim
 *   status                            # every job + wallet/escrow balances
 *
 * Run e.g.:  pnpm --filter @recourse/agents cli -- post --subject 0x.. --min 0.1 --pay 0.05
 */

// Drop any standalone "--" that the package manager may forward as an argument.
const argv = process.argv.slice(2).filter((a) => a !== "--");
const cmd = argv[0];

function flag(name: string, fallback?: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
}
function usdc(human: string): bigint {
  return parseUnits(human, USDC_DECIMALS);
}
/** Wallet the agent executes from — never a valid subject. */
const KH_WALLET =
  process.env.KH_WALLET_ADDRESS ?? "0x2dA51eA57157bc9CFB5799f1dBAAda9B7e432edA";

function requireEnv() {
  if (!config.escrowAddress) throw new Error("ESCROW_ADDRESS not set in .env");
  if (!config.keeperHub.apiKey) throw new Error("KH_API_KEY not set in .env");
}

async function post() {
  requireEnv();
  const subject = flag("subject");
  if (!subject) throw new Error("--subject required");
  // The agent pays FROM the execution wallet, so a job whose subject IS that
  // wallet is a self-transfer that nets to zero. Warn rather than refuse — an
  // unrelated inflow can still satisfy it, and staging a refund is valid.
  if (subject.toLowerCase() === KH_WALLET.toLowerCase()) {
    console.warn(
      `WARNING: --subject is the execution wallet. The agent pays from that ` +
        `address, so its own transfer nets to zero and cannot satisfy this job. ` +
        `Only an unrelated inflow could. Expect a refund.
`,
    );
  }
  const minIncreaseBase = usdc(flag("min", "0.1")!);
  const paymentBase = usdc(flag("pay", "0.05")!);
  const deadlineMins = Number(flag("deadline-mins", "30"));
  const deadline = BigInt(Math.floor(Date.now() / 1000) + Math.floor(deadlineMins * 60));

  console.log(
    `Posting job: subject=${subject} min=${formatUnits(minIncreaseBase, USDC_DECIMALS)} ` +
      `pay=${formatUnits(paymentBase, USDC_DECIMALS)} deadline=+${deadlineMins}min`,
  );

  console.log("1/2 approving USDC for escrow via KeeperHub...");
  const appr = await approveUsdc(paymentBase);
  console.log(`    approve tx: ${appr.transactionHash}`);

  console.log("2/2 createJob via KeeperHub...");
  const cj = await createJob({ subject, minIncreaseBase, paymentBase, deadline });
  console.log(`    createJob tx: ${cj.transactionHash}`);

  const jobId = await readJobCount(); // newest job id
  const job = await readJob(jobId);
  console.log(`\n✅ Job #${jobId} created. status=${JobStatus[job.status]} baseline=${job.baseline}`);
  console.log(`   Run:  pnpm --filter @recourse/agents cli -- work ${jobId}`);
}

async function work(fail: boolean) {
  requireEnv();
  const jobId = BigInt(argv[1] ?? "");
  const job = await readJob(jobId);
  if (job.status !== JobStatus.Open) {
    throw new Error(`job #${jobId} is not Open (status=${JobStatus[job.status]})`);
  }

  // Honest agent delivers exactly the required min; failing agent delivers less.
  const sendBase = fail ? usdc(flag("send", formatUnits(job.minIncrease / 2n, USDC_DECIMALS))!) : job.minIncrease;

  console.log(
    `${fail ? "FAILING" : "Honest"} agent on job #${jobId}: delivering ` +
      `${formatUnits(sendBase, USDC_DECIMALS)} USDC to ${job.subject} (min ${formatUnits(job.minIncrease, USDC_DECIMALS)})`,
  );

  console.log("1/2 executing paying transfer via KeeperHub...");
  const work = await payToSubject(job.subject, sendBase, jobId);
  console.log(`    work tx: ${work.transactionHash} (executionId ${work.executionId})`);

  console.log("2/2 claim via KeeperHub (recording executionId)...");
  const cl = await claim(jobId, work.executionId);
  console.log(`    claim tx: ${cl.transactionHash}`);

  console.log(
    `\n✅ Job #${jobId} claimed.` +
      (fail
        ? " Delta is short — resolver should refund the poster after the deadline."
        : " Delta should be met — resolver can release now."),
  );
  console.log(`   Resolve: pnpm --filter @recourse/backend resolve ${jobId}`);
}

/** Read-only overview of every job plus the balances that back them. */
async function status() {
  const count = await readJobCount();
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  console.log(`escrow ${config.escrowAddress} — ${count} job(s)\n`);

  for (let id = 1n; id <= count; id++) {
    // Paired reads issued together so the transport can batch them.
    const [job, subjectBalance] = await Promise.all([
      readJob(id),
      readJob(id).then((j) => readUsdcBalance(j.subject)),
    ]);
    const observed = subjectBalance - job.baseline;
    const secsLeft = job.deadline - nowSec;
    const when =
      secsLeft > 0n ? `${secsLeft}s left` : `deadline passed ${-secsLeft}s ago`;
    console.log(
      `Job #${id} ${JobStatus[job.status]}\n` +
        `  subject   ${job.subject}\n` +
        `  delta     ${formatUnits(observed, USDC_DECIMALS)} observed / ` +
        `${formatUnits(job.minIncrease, USDC_DECIMALS)} required` +
        `${observed >= job.minIncrease ? " ✅" : " ❌"}\n` +
        `  payment   ${formatUnits(job.paymentAmount, USDC_DECIMALS)} USDC\n` +
        `  deadline  ${new Date(Number(job.deadline) * 1000).toISOString()} (${when})\n` +
        `  execRef   ${job.executionRef || "(none)"}`,
    );
  }

  console.log(
    `\nescrow USDC held: ${formatUnits(await readUsdcBalance(config.escrowAddress), USDC_DECIMALS)}`,
  );
}

/**
 * Capability discovery: ask the KeeperHub MCP server what it can do. The agent
 * does not hardcode an endpoint list — it asks, then calls what it finds.
 */
async function tools() {
  requireEnv();
  const found = await listMcpTools();
  const filter = argv[1]?.toLowerCase();
  const shown = filter
    ? found.filter((t) => t.name.toLowerCase().includes(filter))
    : found;

  console.log(
    `KeeperHub MCP (${config.keeperHub.baseUrl}${config.keeperHub.mcpPath}) — ` +
      `${found.length} tools${filter ? `, ${shown.length} matching "${filter}"` : ""}\n`,
  );
  for (const t of shown) {
    console.log(`• ${t.name}`);
    if (t.description) {
      console.log(`    ${(t.description.split("\n")[0] ?? "").slice(0, 120)}`);
    }
  }
  console.log(`\nExecution transport in use: ${config.keeperHub.transport}`);
}

/** Audit-trail lookup for one execution, over whichever transport is active. */
async function exec() {
  requireEnv();
  const id = argv[1];
  if (!id) throw new Error("usage: cli exec <executionId>");

  const { record: rec, via } = await getExecutionVia(id);
  console.log(`execution ${rec.executionId}  (served via ${via})`);
  console.log(`  status     ${rec.status}`);
  console.log(`  success    ${rec.result?.success}`);
  console.log(`  call       ${rec.result?.executedCall?.functionSignature ?? rec.type ?? "—"}`);
  console.log(`  tx         ${rec.transactionHash ?? "(none)"}`);
  if (rec.transactionHash) {
    console.log(`  basescan   https://basescan.org/tx/${rec.transactionHash}`);
  }
  console.log(`  gasUsedWei ${rec.gasUsedWei ?? "—"}   retries ${rec.retryCount ?? 0}`);
  console.log(`  sponsored  ${rec.result?.sponsored ?? "—"}`);
  console.log(`  completed  ${rec.completedAt ?? "(pending)"}`);
}

/** Browse workflows other agents have listed on the KeeperHub marketplace. */
async function market() {
  requireEnv();
  const res = await searchWorkflows(argv[1]);
  const items = (res.items ?? []) as any[];
  console.log(`${items.length} listed workflow(s)
`);
  for (const w of items) {
    const price = w.priceUsdcPerCall ? `$${w.priceUsdcPerCall}/call` : "free";
    console.log(`• ${w.listedSlug}  ${price}  [${w.workflowType ?? "?"}]`);
    console.log(`    ${(w.name ?? "").slice(0, 90)}`);
    if (w.inputSchema) {
      console.log(`    inputs: ${Object.keys(w.inputSchema).join(", ")}`);
    }
  }
}

/** Pay for and invoke a listed workflow over x402. */
async function buy() {
  requireEnv();
  const slug = argv[1];
  if (!slug) throw new Error("usage: cli buy <slug> [--input k=v ...]");

  // --input key=value, repeatable.
  const inputs: Record<string, string> = {};
  argv.forEach((a, i) => {
    if (a === "--input" && argv[i + 1]) {
      const [k, ...rest] = argv[i + 1]!.split("=");
      if (k) inputs[k] = rest.join("=");
    }
  });

  console.log(`Calling listed workflow "${slug}"...`);
  const out = await callPaidWorkflow(slug, inputs);

  if (out.quoted) {
    const usdc = Number(out.quoted.amount) / 1e6;
    console.log(
      `x402 challenge: ${out.quoted.scheme} ${usdc} USDC on ${out.quoted.network}
` +
        `  asset ${out.quoted.asset}
  payTo ${out.quoted.payTo}`,
    );
  } else {
    console.log("no payment required");
  }

  if (out.settlement) {
    console.log(
      `
settled: success=${out.settlement.success} network=${out.settlement.network}`,
    );
    if (out.settlement.transaction) {
      console.log(`  payment tx: https://basescan.org/tx/${out.settlement.transaction}`);
    }
  }

  console.log(`
HTTP ${out.status}${out.paid ? " (after payment)" : ""}`);
  console.log(JSON.stringify(out.body, null, 2));
}

/** Audit every x402 payment this agent has made. */
async function payments() {
  const wallet = agenticWalletAddress();
  if (!wallet) {
    console.log("No agentic wallet provisioned (~/.keeperhub/wallet.json).");
    return;
  }
  console.log(`agentic wallet ${wallet}
`);

  const found = await listX402Payments(BigInt(argv[1] ?? 4000));
  if (found.length === 0) {
    console.log("no x402 payments found in range");
    return;
  }
  for (const p of found) {
    console.log(`${p.amount} USDC -> ${p.to}`);
    console.log(`  block ${p.blockNumber}`);
    console.log(`  https://basescan.org/tx/${p.transactionHash}`);
  }
  const total = found.reduce((s, p) => s + Number(p.amount), 0);
  console.log(`
${found.length} payment(s), ${total.toFixed(2)} USDC total`);
}

async function main() {
  switch (cmd) {
    case "post":
      return post();
    case "work":
      return work(false);
    case "work-fail":
      return work(true);
    case "status":
      return status();
    case "tools":
      return tools();
    case "exec":
      return exec();
    case "market":
      return market();
    case "buy":
      return buy();
    case "payments":
      return payments();
    default:
      console.log("Usage: cli <post|work|work-fail|status|tools|exec|market|buy|payments> [...]");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
