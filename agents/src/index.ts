/**
 * Public surface of the worker-agent package.
 *
 * The CLI (`src/cli.ts`) and the backend's job orchestration both drive these
 * same actions, so there is one implementation of "post a job", "do the work",
 * "claim" — and all of them route through KeeperHub.
 */
export { approveUsdc, createJob, claim, payToSubject, waitTerminal } from "./actions.js";
export { readJob, readJobCount, readUsdcBalance, publicClient } from "./chain.js";
export { config, USDC_BASE, USDC_DECIMALS } from "./config.js";
