import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Load repo-root .env regardless of cwd.
const here = path.dirname(fileURLToPath(import.meta.url)); // agents/src
loadEnv({ path: path.resolve(here, "../../.env") });

export const config = {
  keeperHub: {
    apiKey: process.env.KH_API_KEY ?? "",
    baseUrl: (process.env.KH_BASE_URL ?? "https://app.keeperhub.com").replace(/\/$/, ""),
  },
  chain: {
    id: 8453,
    rpcUrl: process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
  },
  escrowAddress: (process.env.ESCROW_ADDRESS ?? "") as `0x${string}`,
};

export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const USDC_DECIMALS = 6;
