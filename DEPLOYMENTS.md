# Deployments

## Base mainnet (chainId 8453)

### RecourseEscrow
- **Address:** [`0xE21A7446a89b3A8C9A455dC5e1c2A61D21E25982`](https://basescan.org/address/0xE21A7446a89b3A8C9A455dC5e1c2A61D21E25982)
- **Bound token (USDC):** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **Deployed:** 2026-07-25
- **Deploy tx:** [`0x5960c6e9183f4fdfa5ee1465f6bb407a97a16930c28f5b763dff142adf54d06d`](https://basescan.org/tx/0x5960c6e9183f4fdfa5ee1465f6bb407a97a16930c28f5b763dff142adf54d06d)
- **Deployer:** `0x5051D27f406436D934630C3Da1fCe918AEf88312`
- **Gas paid:** 0.000006391734 ETH (~$0.02)

## KeeperHub executions (submission evidence)

Transactions executed by/through KeeperHub on Base:

| Purpose | Tx |
|---|---|
| First USDC transfer (0.1) | [`0x720fe5…404f3`](https://basescan.org/tx/0x720fe563e56dbdb664955529feb9fafc8d3b1e06ec09741dd11562fc26e404f3) |
| Native ETH transfer (gas top-up) | [`0x3068b9…4c32d`](https://basescan.org/tx/0x3068b97dabb11621505d42a483c5d0a78eea8edb52264d6b0e055c6288d4c32d) |
| Native ETH transfer (deployer gas) | [`0xf90938…83df2`](https://basescan.org/tx/0xf90938407d1b5abfce19e6c69c453b3d1bd4cbae6ec04003b9af13aeef583df2) |
| Failing agent's short delivery (0.05 of 0.1) | [`0xa4eb22…d759ce`](https://basescan.org/tx/0xa4eb2254023f6725ca9f05c65d80798f4fe2392b7e7da3d3f4b0dcbb41d759ce) |
| **Resolver refund of Job #2** | [`0x84b6ac…951f6b`](https://basescan.org/tx/0x84b6acfdb8508493171a5d3b28d3c630eaadde4da55d7a996dbd1a1bf9951f6b) |

## Demo evidence: both settlement paths verified live

Both terminal outcomes have been exercised against the live escrow on Base, with
every write routed through KeeperHub.

**Job #1 — release (happy path), 2026-07-25.** Honest agent delivered 0.1 USDC to
the subject, claimed, resolver observed the on-chain delta and released the 0.05
payment. Final status `Released`, escrow drained to 0.

**Job #2 — refund (the differentiator), settled 2026-07-27.** The deliberately
failing agent delivered only 0.05 USDC against a 0.1 requirement, then claimed
anyway. This is the case the product exists for:

- The agent's KeeperHub execution reports `status: "completed"`, `result.success: true`,
  with a real confirmed tx (`0xa4eb22…d759ce`, 67350 gas). **The transaction did not fail.**
- The resolver ignored that signal, read chain state, and found the delta short:
  `50000 < 100000`.
- Decision: `REFUND — delta not met by deadline`. Poster was made whole via
  KeeperHub (`0x84b6ac…951f6b`). Final status `Refunded`.

A payment rail keyed on "did the transaction succeed?" pays the agent here.
Recourse does not. That gap is the product.

## Redeploy

```bash
cd contracts
forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://mainnet.base.org \
  --sender <deployer-address> \
  --account deployer \
  --broadcast
```
Then update `ESCROW_ADDRESS` in `.env` (and here).
