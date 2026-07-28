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

## Executed via the KeeperHub MCP server (2026-07-27)

Job #5, plus cleanup of two expired jobs — every write routed through
`POST /mcp` (`execute_contract_call` / `execute_transfer`), not REST.

| Step | Tx |
|---|---|
| approve (job #5) | [`0xa02af3…d043936`](https://basescan.org/tx/0xa02af3dca97e35a1a129cc7dd45314205ca09939b617d7db6da9f9721d043936) |
| createJob #5 | [`0xac0b88…fa5ae598c`](https://basescan.org/tx/0xac0b88c11735d80e8d06c7d799970815a1171bf63fcb134c086c536fa5ae598c) |
| agent transfer 0.1 USDC | [`0x576d46…bce51f3e7`](https://basescan.org/tx/0x576d46381e1ff023b91034f3d23ee9cab6a7c0309bc2b6fb20ae477bce51f3e7) |
| claim #5 | [`0xce8d6d…4c1ecdfe3`](https://basescan.org/tx/0xce8d6dcb7168eb1b32decf650d960cf0c564b65c35540f1f2e31b9d4c1ecdfe3) |
| **release #5** | [`0xbac625…679a15bce6`](https://basescan.org/tx/0xbac625b28b5421e32027f3f650f9996fde9389f3ce4ae1a49d59ee679a15bce6) |
| refund #3 (never claimed) | [`0xb5d30f…9e235c93bb`](https://basescan.org/tx/0xb5d30fca1e76eeca9a7781ca5d04e4b5a91077bbb80a697763ef919e235c93bb) |
| refund #4 (delta met, deadline passed first) | [`0x8d1049…34984f2958`](https://basescan.org/tx/0x8d10493b0e2cd74b150968c79fc534c5780fc0160dd47eee53385c34984f2958) |
| fund agentic wallet (x402 float) | [`0xed96ed…063ee3ff12`](https://basescan.org/tx/0xed96ed84a75a074ecd75107645d2422e8ccb2affa8572443012c77063ee3ff12) |

Job #4 is worth noting: the delta *was* met, but the deadline passed before
anyone called `release`, so it refunds. Keeping the promise is necessary but
not sufficient — it has to be proven inside the window.

## x402: the agent as payer (2026-07-27)

Agentic wallet `0x6e2Dc65E242e3bdDA1d4397116CF7B25FB8BBC40` (Turnkey-backed,
provisioned by `@keeperhub/wallet`; no private key in the process). Funded from
the KeeperHub execution wallet, then used to pay for third-party listings.

| Payment | Tx |
|---|---|
| 0.01 USDC → `0x21DB…11A92` | [`0x109b1d…3456c54a1`](https://basescan.org/tx/0x109b1d4437276e6670d41deae6319dfb5d9ffd48d7f22e50a08456b3456c54a1) |
| 0.01 USDC → `0x21DB…11A92` | [`0x9416ef…4c83dbc7ee`](https://basescan.org/tx/0x9416efeb1eb9a4747439b6df5939de376a91f4a4c64c05637fd66c4c83dbc7ee) |

Both payments settled. **Neither call returned a usable result** — one listing
failed on an unresolved template reference, the other on
`network "undefined"`, and a third (`microtip`) answers 503.

That is the thesis, demonstrated with real money on somebody else's system: the
payment rail worked perfectly, `HTTP 200` came back both times, and no work was
delivered. There is no refund path, because nothing checked whether the paid-for
result actually arrived. `cli payments` audits the spend — x402's `exact` scheme
signs an EIP-3009 authorisation that a *facilitator* submits, so payments never
appear in the payer's own transaction history, only as USDC Transfer logs.

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
