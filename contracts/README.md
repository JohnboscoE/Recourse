# contracts/ — RecourseEscrow (Foundry)

Solidity escrow for agent-executed onchain work. On Windows, run Foundry from
**Git Bash or WSL** (per CLAUDE.md), not PowerShell.

## Planned (Week 1)
- `src/RecourseEscrow.sol`
  - `createJob(...)` — locks USDC, records predicate + deadline
  - `claim(...)` — agent submits a KeeperHub executionId
  - `release(...)` / `refund(...)` — after the resolver verifies the balance delta
- `test/RecourseEscrow.t.sol` — fork tests against Base USDC
- `script/Deploy.s.sol`

## Setup (once Foundry is installed)
```bash
cd contracts
forge init --force --no-git   # scaffolds lib/forge-std, then add sources
forge build
```

Env (never commit): `BASE_RPC_URL`, `BASESCAN_API_KEY`, and a deployer key.
