import { resolveJob } from "./resolver.js";

// One-shot resolver: read chain state for a job, decide, and (unless --dry-run)
// submit the settlement via KeeperHub. Usage:
//   pnpm --filter @recourse/backend resolve <jobId> [--dry-run]
const jobId = BigInt(process.argv[2] ?? "");
const dryRun = process.argv.includes("--dry-run");

resolveJob(jobId, { dryRun })
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
    console.log(`\nDecision: ${report.decision.action.toUpperCase()} — ${report.decision.reason}`);
    if (report.settlement) {
      console.log(`Settlement ${report.settlement.functionName} via KeeperHub: ${report.settlement.executionId}`);
    }
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
