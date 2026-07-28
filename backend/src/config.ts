import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Load the repo-root .env regardless of where the process is started from.
const here = path.dirname(fileURLToPath(import.meta.url)); // backend/src
loadEnv({ path: path.resolve(here, "../../.env") });

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  keeperHub: {
    apiKey: process.env.KH_API_KEY ?? "",
    baseUrl: (process.env.KH_BASE_URL ?? "https://app.keeperhub.com").replace(/\/$/, ""),
  },
  chain: {
    id: 8453, // Base mainnet
    rpcUrl: process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
  },
  escrowAddress: (process.env.ESCROW_ADDRESS ?? "") as `0x${string}`,
  /** KeeperHub-provisioned execution wallet — the poster/agent in demo runs. */
  keeperHubWallet: (process.env.KH_WALLET_ADDRESS ??
    "0x2dA51eA57157bc9CFB5799f1dBAAda9B7e432edA") as `0x${string}`,
  port: Number(process.env.PORT ?? 3001),
  /**
   * Poll interval for the resolver loop, ms. Set 0 to disable.
   *
   * On by default. The product promise is that settlement is automatic — a job
   * whose deadline has passed should refund without anyone clicking anything.
   * Defaulting this off meant the resolver only ever ran when invoked by hand,
   * which quietly turned "automatic escrow" into "escrow you must remember to
   * settle".
   */
  pollIntervalMs: Number(process.env.RESOLVER_POLL_MS ?? 30_000),
  required,
};
