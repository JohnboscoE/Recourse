import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

/**
 * Worker runtime configuration.
 *
 * The Node backend reads a .env file from disk at import time. Workers have no
 * filesystem and no process.env — bindings arrive per-request on the `Env`
 * object. So config is built per-request rather than being a module-level
 * singleton, which is also what makes the same isolate safe to reuse across
 * different requests.
 */

export interface Env {
  // --- secrets (wrangler secret put ...) ---
  KH_API_KEY: string;

  // --- vars (wrangler.toml) ---
  ESCROW_ADDRESS: string;
  BASE_RPC_URL?: string;
  KH_BASE_URL?: string;
  KH_MCP_PATH?: string;
  KH_WALLET_ADDRESS?: string;
  CORS_ORIGINS?: string;

  // --- bindings ---
  DB: D1Database;
}

export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const USDC_DECIMALS = 6;
export const CHAIN_ID = 8453;

const DEFAULT_KH_WALLET = "0x2dA51eA57157bc9CFB5799f1dBAAda9B7e432edA";

export interface Config {
  keeperHub: { apiKey: string; baseUrl: string; mcpPath: string };
  escrowAddress: `0x${string}`;
  keeperHubWallet: `0x${string}`;
  corsOrigins: string[];
}

export function readConfig(env: Env): Config {
  return {
    keeperHub: {
      apiKey: env.KH_API_KEY ?? "",
      baseUrl: (env.KH_BASE_URL ?? "https://app.keeperhub.com").replace(/\/$/, ""),
      mcpPath: env.KH_MCP_PATH ?? "/mcp",
    },
    escrowAddress: (env.ESCROW_ADDRESS ?? "") as `0x${string}`,
    keeperHubWallet: (env.KH_WALLET_ADDRESS ?? DEFAULT_KH_WALLET) as `0x${string}`,
    corsOrigins: (env.CORS_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/**
 * A public client per request.
 *
 * Batching is kept; the Node version's TTL cache is not. Isolates are
 * short-lived and may not be reused, so an in-memory cache would be a
 * coin-flip rather than a guarantee — and a cache that only sometimes exists
 * is worse than none for reasoning about staleness. Cloudflare's own fetch
 * cache sits in front of the RPC instead.
 */
export function makeClient(env: Env) {
  return createPublicClient({
    chain: base,
    transport: http(env.BASE_RPC_URL || undefined, {
      batch: { wait: 16 },
      retryCount: 4,
      retryDelay: 250,
    }),
  });
}
