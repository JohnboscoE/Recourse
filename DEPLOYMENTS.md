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
