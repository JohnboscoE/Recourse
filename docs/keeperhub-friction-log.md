# KeeperHub Onboarding Friction Log

Running log of every point of friction hit while setting up KeeperHub.
Feeds the "Best Onboarding UX Improvement" bounty ($1,000, split two ways).

Rules: log it the moment it bites, while the detail is fresh. Include what you
expected, what happened, and (if you found it) the workaround. Screenshots/links
welcome. Even small papercuts count — they add up to the teardown.

| # | Date | Area | What I expected | What actually happened | Workaround / fix | Severity |
|---|------|------|-----------------|------------------------|------------------|----------|
| 1 | 2026-07-25 | Auth | REST auth method documented on the executions page | Executions page only links to `/api/authentication`; had to test empirically to learn the `kh_` key works for REST as `Authorization: Bearer` | RESOLVED — same `kh_` key works for REST. Docs should state this on the executions/auth page. | low |
| 2 | 2026-07-25 | Wallet | Clear signal at signup about what the provisioned wallet is | KeeperHub auto-creates an execution wallet on signup, but it wasn't obvious whether it's custodial or user-owned; API shows `isManaged: false` yet the wallet is KeeperHub-created. Had to check MetaMask + dashboard to confirm it's withdrawable. | RESOLVED — wallet is KeeperHub-provisioned AND user-withdrawable. Onboarding should state this explicitly (custody model + how to withdraw) so users trust it enough to fund it. | med |
| 3 | 2026-07-25 | Gas/UX | Clarity on who pays gas for direct executions | Pleasant surprise, not friction: direct transfers came back `"sponsored": true` — KeeperHub sponsored gas via a smart account (paymaster), so the funded ETH wasn't consumed. This is a selling point that isn't front-and-center in onboarding. | Suggestion: surface gas sponsorship in onboarding — it materially lowers the "will this drain my wallet?" fear when funding. | n/a (positive) |
| 4 |      | | | | | |

## Open questions to resolve during pre-build

- [x] Does the `kh_`-prefixed API key work for **REST** as `Authorization: Bearer`, or does REST need a separate credential? → **YES**, same key works for REST (confirmed 2026-07-25 via `/api/user`, `/api/workflows`, `/api/integrations`).
- [ ] Does an agent-side `execute_transfer` return a **workflow** `executionId` (`/api/workflows/executions/{id}/...`) or a **direct** execution reference (`/api/direct-execution`, `get_direct_execution_status`)? This determines what `claim()` stores.
- [ ] What is the exact JSON shape returned for a completed execution? (Drives the `ExecutionRecord` shared type.)
- [ ] Chain ID reported for Base in `transactionHashes[]` — confirm `8453`.
- [ ] Is `gasUsedWei` populated for a simple ERC-20 transfer?

## Teardown notes (fill in as themes emerge)

_Group the friction above into 2–4 concrete improvement suggestions once week one
is done. Each should be actionable by the KeeperHub team (doc fix, API change,
onboarding step)._
