import { parseUnits, formatUnits } from "viem";
import { JobStatus } from "@recourse/shared";
import { config, USDC_DECIMALS } from "./config.js";
import { readJob, readJobCount, readUsdcBalance } from "./chain.js";
import { approveUsdc, createJob, claim, payToSubject } from "./actions.js";

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
function requireEnv() {
  if (!config.escrowAddress) throw new Error("ESCROW_ADDRESS not set in .env");
  if (!config.keeperHub.apiKey) throw new Error("KH_API_KEY not set in .env");
}

async function post() {
  requireEnv();
  const subject = flag("subject");
  if (!subject) throw new Error("--subject required");
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
  const work = await payToSubject(job.subject, sendBase);
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
    const job = await readJob(id);
    const observed = (await readUsdcBalance(job.subject)) - job.baseline;
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
    default:
      console.log("Usage: cli <post|work|work-fail|status> [...]");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
