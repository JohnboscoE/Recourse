import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseAbiItem, getAddress, formatUnits } from "viem";
import { paymentSigner } from "@keeperhub/wallet";
import { publicClient } from "./chain.js";
import { USDC_BASE } from "./config.js";
import { config } from "./config.js";
import { mcp } from "./mcp.js";

/**
 * Paying for work the agent does not do itself.
 *
 * KeeperHub's marketplace lists workflows priced per call. `call_workflow` over
 * MCP deliberately does NOT auto-pay: a paid listing answers with HTTP 402 and
 * an x402 challenge, and the caller is expected to sign a payment and retry.
 *
 * The signing happens in `@keeperhub/wallet`, which holds a Turnkey-backed
 * agentic wallet (`~/.keeperhub/wallet.json`) — separate from the KeeperHub
 * execution wallet, and deliberately so: the thing that spends money per call
 * is not the thing that holds the escrow float. There is no private key in this
 * process.
 *
 * Note the payment itself is gasless for us. The x402 "exact" scheme signs an
 * EIP-3009 `transferWithAuthorization` off-chain; the facilitator submits it.
 * So the agentic wallet needs USDC and no ETH at all.
 */

/** A single accepted payment method from an x402 challenge. */
export interface X402Accept {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds?: number;
}

export interface X402Challenge {
  x402Version: number;
  error?: string;
  resource?: { url: string; description?: string };
  accepts?: X402Accept[];
}

export interface PaidCallResult {
  slug: string;
  /** Price actually quoted by the 402, in atomic units of `asset`. */
  quoted?: X402Accept;
  /** Whether a payment was required at all (a free listing needs none). */
  paid: boolean;
  /** Settlement details echoed back in the X-PAYMENT-RESPONSE header. */
  settlement?: { success?: boolean; transaction?: string; network?: string };
  status: number;
  body: unknown;
}

/**
 * x402 settles the payment server-side and reports the result in a base64
 * `X-PAYMENT-RESPONSE` header. Decoding it is how the payer learns the
 * transaction hash of what it just paid — otherwise the spend is invisible.
 */
function readSettlement(res: Response): PaidCallResult["settlement"] {
  const raw = res.headers.get("x-payment-response");
  if (!raw) return undefined;
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    return undefined;
  }
}

/**
 * Payment signatures are HMACs over a timestamp, and KeeperHub enforces a tight
 * replay window. A host whose clock has drifted therefore fails *every* payment
 * with an opaque HMAC_INVALID — which is exactly what happened on this machine
 * (2h32m slow, Windows time service running but never synchronised).
 *
 * An agent cannot assume its own clock is correct: it may be a long-lived VM or
 * a container with no NTP. So take the truth from the server's `Date` header and
 * run the signing under that clock.
 *
 * This overrides `Date.now` for the duration of the call only, and restores it
 * afterwards. That is deliberately narrow — the offset is not applied process-
 * wide, because the right long-term fix is to sync the host clock, and a
 * permanent patch would hide that.
 */
async function serverSkewMs(): Promise<number> {
  const res = await fetch(`${config.keeperHub.baseUrl}/api/user`, {
    method: "HEAD",
    headers: { Authorization: `Bearer ${config.keeperHub.apiKey}` },
  }).catch(() => null);

  const header = res?.headers.get("date");
  if (!header) return 0;
  const server = Date.parse(header);
  if (Number.isNaN(server)) return 0;
  return server - Date.now();
}

async function underServerClock<T>(fn: () => Promise<T>): Promise<T> {
  const skew = await serverSkewMs();

  // Under a minute of drift is inside anyone's replay window; leave it alone.
  if (Math.abs(skew) < 60_000) return fn();

  console.warn(
    `[x402] host clock is ${(skew / 1000).toFixed(0)}s off server time — ` +
      `signing under server clock for this call. Fix the host clock: ` +
      `run "w32tm /resync /force" in an elevated shell.`,
  );

  const realNow = Date.now;
  Date.now = () => realNow() + skew;
  try {
    return await fn();
  } finally {
    Date.now = realNow;
  }
}

/** Discover listed workflows other agents have published. */
export function searchWorkflows(query?: string) {
  return mcp.callTool<{ items: unknown[] }>("search_workflows", {
    ...(query ? { query } : {}),
    sort: "popular",
  });
}

/**
 * Call a listed workflow, paying its x402 charge if one is demanded.
 *
 * Uses the marketplace's own HTTP endpoint rather than the MCP tool, because
 * the payment handshake is an HTTP concern: the signer needs the raw 402 to
 * read the challenge from, and the retry has to carry the original body.
 */
export async function callPaidWorkflow(
  slug: string,
  inputs: Record<string, unknown>,
): Promise<PaidCallResult> {
  const url = `${config.keeperHub.baseUrl}/api/mcp/workflows/${slug}/call`;
  // Inputs go at the top level of the body. The MCP tool nests them under
  // `inputs`, but the HTTP endpoint does not — nesting them here makes the
  // workflow's trigger node fail to resolve its own fields, and you still get
  // charged for the call. The 402's bazaar schema (input.body.<field>) is the
  // authority on this.
  const body = JSON.stringify(inputs);
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${config.keeperHub.apiKey}`,
  };

  // Peek first, so the price is observable even when the payment succeeds.
  const probe = await fetch(url, { method: "POST", headers, body });
  let quoted: X402Accept | undefined;
  let challenge: X402Challenge | null = null;

  if (probe.status === 402) {
    challenge = (await probe.clone().json().catch(() => null)) as X402Challenge | null;
    quoted = challenge?.accepts?.[0];
  } else {
    // Free (or already-entitled) listing: nothing to pay.
    return {
      slug,
      paid: false,
      status: probe.status,
      body: await probe.json().catch(() => null),
    };
  }

  // Sign the challenge and retry. `fetch` threads the body through for us.
  const res = await underServerClock(() =>
    paymentSigner.fetch(url, {
      method: "POST",
      headers,
      body,
      paymentHint: "x402",
    }),
  );

  return {
    slug,
    quoted,
    paid: true,
    settlement: readSettlement(res),
    status: res.status,
    body: await res.json().catch(() => null),
  };
}

/** Public address of the local agentic wallet, if one has been provisioned. */
export function agenticWalletAddress(): `0x${string}` | null {
  try {
    const cfg = JSON.parse(
      readFileSync(join(homedir(), ".keeperhub", "wallet.json"), "utf8"),
    );
    return getAddress(cfg.walletAddress);
  } catch {
    return null;
  }
}

export interface X402Payment {
  amount: string;
  to: string;
  blockNumber: bigint;
  transactionHash: string;
}

/**
 * Every x402 payment this agent has made, read off-chain.
 *
 * The "exact" scheme signs an EIP-3009 authorisation which a *facilitator*
 * submits, so payments never appear in the wallet's own transaction history —
 * only as USDC Transfer logs. Reading them back is the only way for the payer
 * to audit what it actually spent.
 */
export async function listX402Payments(blocksBack = 4000n): Promise<X402Payment[]> {
  const wallet = agenticWalletAddress();
  if (!wallet) return [];

  const head = await publicClient.getBlockNumber();
  const fromBlock = head > blocksBack ? head - blocksBack : 0n;

  const logs = await publicClient.getLogs({
    address: USDC_BASE,
    event: parseAbiItem(
      "event Transfer(address indexed from, address indexed to, uint256 value)",
    ),
    args: { from: wallet },
    fromBlock,
    toBlock: head,
  });

  return logs.map((l) => ({
    amount: formatUnits(l.args.value ?? 0n, 6),
    to: l.args.to ?? "",
    blockNumber: l.blockNumber ?? 0n,
    transactionHash: l.transactionHash ?? "",
  }));
}
