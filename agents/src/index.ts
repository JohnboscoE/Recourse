import { createPublicClient, http, erc20Abi } from "viem";
import { base } from "viem/chains";
import { BASE_USDC } from "@recourse/shared";

// Sanity check that the shared types resolve and viem can read Base USDC.
// This previews the resolver's core primitive: reading balanceOf on Base.
// Replace with the real agent + resolver logic in Week 1.
const client = createPublicClient({ chain: base, transport: http() });

async function readUsdcBalance(address: `0x${string}`): Promise<bigint> {
  return client.readContract({
    address: BASE_USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
}

const target = (process.argv[2] ?? BASE_USDC) as `0x${string}`;
readUsdcBalance(target)
  .then((bal) => console.log(`USDC balance of ${target}: ${bal} (base units)`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
