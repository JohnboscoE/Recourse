import { resolveJob } from "./resolver.js";

// One-shot resolver: read chain state for a job, decide, and (unless --dry-run)
// submit the settlement via KeeperHub. Usage:
//   pnpm --filter @recourse/backend resolve <jobId> [--dry-run]
// Drop any standalone "--" that the package manager may forward as an argument.
const argv = process.argv.slice(2).filter((a) => a !== "--");
const jobId = BigInt(argv[0] ?? "");
const dryRun = argv.includes("--dry-run");

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
