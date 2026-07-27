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
| 4 | 2026-07-27 | Audit trail / API | One documented, discoverable path to read an execution back by id | Finding the right read endpoint took trial and error across five candidates (`/api/workflows/executions/{id}/status`, `/api/direct-execution/{id}`, `/api/executions/{id}`, …). Four return `404 Route ... not found`. The correct one is `GET /api/execute/{executionId}/status` — i.e. the read path mirrors the **write** path (`POST /api/execute/transfer`), not any of the plural/resource-style URLs a REST-shaped guess lands on. | RESOLVED — use `GET /api/execute/{id}/status`. Docs should show the write and its matching read side by side in one snippet. | med |
| 5 | 2026-07-27 | Audit trail semantics | `result.success: true` to mean the intended effect happened | It only means the tx did not revert. A transfer of the *wrong amount* still reports `status: "completed"`, `result.success: true`, with a confirmed tx hash. Verified live: execution `sx3cfrou33htzw1mbawfg` moved 0.05 USDC where 0.1 was required and reported full success. | Not a bug — but the field name invites over-trust. Docs should say plainly that `success` is "did not revert", and that verifying intent is the caller's job. This gap is the premise of our project. | med |

| 6 | 2026-07-27 | MCP / discovery | The MCP endpoint path documented or discoverable | Guessed four paths before finding it. `/api/mcp` — the obvious one given every REST route is under `/api/` — returns `404 Route POST /api/mcp not found`. The real path is **`/mcp`**, off the `/api` prefix. `/api/mcp/sse`, `/sse` also 404. | RESOLVED — `POST /mcp`, Streamable HTTP, protocol `2025-06-18`. Docs should state the path and transport in one line next to the API-key setup. | med |
| 7 | 2026-07-27 | MCP / naming | One naming convention across transports | The same operations take **snake_case** over MCP (`chain_id`, `to_address`, `token_address`) and **camelCase** over REST (`chainId`, `recipientAddress`, `tokenAddress`). Worse, `chain_id` is a *string* over MCP and a *number* over REST. Silent source of bugs when porting a working REST call to MCP. | Suggestion: accept both casings on both transports, or document the mapping in `tools_documentation`. | med |
| 8 | 2026-07-27 | Docs | `tools_documentation` covering the paid/marketplace surface | It documents workflow creation, projects, tags, templates and chain IDs — but says nothing about x402, pricing, or the marketplace. That detail lives only in the `call_workflow` tool description, which listings truncate. A builder reading the docs tool would not learn paid workflows exist. | Suggestion: add a PAID WORKFLOWS section to `tools_documentation` covering the 402 challenge and the payment paths. | med |
| 9 | 2026-07-27 | x402 | — | Positive: the 402 response is genuinely excellent. Full x402 v2 challenge (scheme, network, asset, amount, payTo, timeout, EIP-3009 domain) **plus** a human-readable error listing three concrete ways to pay. Best-designed error in the API so far. | Keep — this is the model other endpoints should follow. | n/a (positive) |

## Open questions to resolve during pre-build

- [x] Does the `kh_`-prefixed API key work for **REST** as `Authorization: Bearer`, or does REST need a separate credential? → **YES**, same key works for REST (confirmed 2026-07-25 via `/api/user`, `/api/workflows`, `/api/integrations`).
- [x] Does an agent-side `execute_transfer` return a **workflow** `executionId` or a **direct** execution reference? → **Direct.** Read it back at `GET /api/execute/{executionId}/status`. This is what `claim()` stores.
- [x] What is the exact JSON shape returned for a completed execution? → Captured at `packages/shared/fixtures/execution-transfer.example.json`, typed as `ExecutionRecord`.
- [x] Chain ID reported for Base — confirmed `8453`.
- [x] Is `gasUsedWei` populated for a simple ERC-20 transfer? → **Yes** (e.g. `67350` for the failing agent's transfer, `79134` for the escrow refund call).

## Bounty target — "Best Onboarding UX Improvement" ($500 × 2 winners, stackable)

Goal: get a new builder from zero to first landed transaction faster / with less
friction. Winning forms (aim for at least one, ideally a mergeable PR):
- **A merged PR to the KeeperHub repo** — docs, quickstart, CLI/setup UX, clearer
  error messages, or a setup script. (Bonus: merged *during* the event.)
- **A starter template / boilerplate** that gets a new builder running fast —
  our `scripts/` (check-auth, execute-transfer, fetch-execution) + `.env` flow +
  the ExecutionRecord type are basically this already; package them up.
- **A teardown** of where we got stuck, with concrete proposed fixes (this log).

Candidate PRs from friction found so far:
1. Document that the `kh_` key works for REST as `Authorization: Bearer` (item #1)
   — currently only discoverable by trial.
2. Surface the wallet custody model + withdrawal path at signup (item #2).
3. Highlight gas sponsorship in onboarding (item #3) to reduce funding anxiety.
4. **Strongest candidate:** document the execute→read round trip in one snippet
   (item #4). A new builder's first real question after landing a tx is "how do I
   read it back?", and the answer currently costs a round of 404s. Pairs naturally
   with a docs note on what `result.success` does and doesn't mean (item #5).

## Teardown notes (fill in as themes emerge)

_Group the friction above into 2–4 concrete improvement suggestions once week one
is done. Each should be actionable by the KeeperHub team (doc fix, API change,
onboarding step)._
