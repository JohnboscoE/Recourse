# Recourse

**Escrowed payment for agent-executed onchain work, released only when chain
state proves the promised outcome happened — not when the transaction merely
succeeded.**

Live on Base · every onchain action executed through [KeeperHub](https://keeperhub.com)

`RecourseEscrow` → [`0xE21A7446a89b3A8C9A455dC5e1c2A61D21E25982`](https://basescan.org/address/0xE21A7446a89b3A8C9A455dC5e1c2A61D21E25982)

---

## The problem

A blockchain transaction "succeeding" means exactly one thing: **it did not
revert.** It does not mean the right amount moved, or that it reached the right
address, or that the thing you paid for happened.

Payment rails for agents — x402, MPP — shipped without a layer underneath them
that checks the difference. So an agent can burn real gas, land a confirmed
transaction, report `success: true`, deliver nothing, and get paid.

We didn't have to invent an example. **While integrating x402 for this project,
we paid $0.01 twice to listed services on a live marketplace. Both payments
settled on-chain. Both returned `HTTP 200`. Neither returned a usable result** —
one misconfigured, one crashed, one offline. No refund, because nothing checked
whether the paid-for work arrived.

That gap is the product.

## What it does

A job is a promise a machine can check:

> *`0xSubject`'s USDC balance increases by at least **N** before time **T***

1. **Post** — payment is locked in escrow; the subject's current balance is
   snapshotted as the baseline
2. **Execute** — an agent does the work via KeeperHub, then claims the job
3. **Verify** — the resolver reads the balance *from the chain* and subtracts the
   baseline
4. **Settle** — delta met in time → **release** to the agent; otherwise →
   **refund** to the poster

Step 3 never asks whether the transaction succeeded. It reads the ledger.

> 📖 **New to the project? Read [`docs/CONCEPT.md`](docs/CONCEPT.md)** — a
> plain-language explanation of the problem, the design, and why the predicate
> is deliberately narrow.

## The four controls on a job

Each job card exposes the whole lifecycle, so the honest and dishonest paths can
be driven side by side against the same escrow.

### Honest agent — *spends real USDC*

Runs a worker that delivers exactly what was promised. Two KeeperHub executions:
a USDC transfer of `minIncrease` to the subject, then `claim()` recording the
execution id on-chain. The delta is met, and the resolver releases payment to
the agent. This is the happy path.

### Failing agent — *spends real USDC*

The same flow, except it delivers **half** of what was promised — then claims
anyway, as if it had finished.

This is the case the project exists for. The transfer **genuinely succeeds**:
KeeperHub reports `completed` / `success: true`, with a real transaction hash
and gas burned. Any rail keyed on transaction status pays the agent here. The
resolver reads chain state instead, finds the balance moved half as far as
promised, and refunds the poster.

### Dry run — *free, submits nothing*

Runs the resolver's decision logic and reports what it *would* do —
`RELEASE`, `REFUND` or `WAIT` — with the reasoning, without touching the chain.
It reads the balance delta and pulls the agent's KeeperHub execution record for
context. Use it to see the verdict before committing to it.

### Settle — *submits a transaction*

Executes the pending decision: `release` to the agent, or `refund` to the
poster, via KeeperHub.

Mostly a manual override. Settlement is automatic — the resolver sweeps on a
timer (30s on the Node backend, 60s on the Worker) and settles anything due. Use
this when you don't want to wait for the next sweep.

> **A job must be claimed before it can pay.** `release` reverts unless the job
> is `Claimed`, because the payment goes to *an agent* — an unclaimed job has
> nobody to pay, so it waits and then refunds no matter how well the delta is
> met. Meeting the requirement is necessary, not sufficient: an agent has to
> claim the job too. This is why posting a job and watching the balance rise on
> its own never results in a payout.

> **Timing.** `release` reverts if `block.timestamp > deadline`, so the
> settlement transaction itself has to land inside the window — meeting the
> delta is necessary but not sufficient. Measured end to end: ~16s to create a
> job, ~16s for an agent run, up to 60s for the Worker's cron to notice, ~10s
> for settlement. Give jobs on the deployed app **at least 3 minutes**, and 5+
> if you're demoing. Short deadlines are useful for showing the refund path.

## Proof it works

Five jobs settled on Base, both outcomes exercised.

### The case that makes the point — Job #2

The failing agent delivered 0.05 USDC against a 0.10 requirement, then claimed
anyway. Its KeeperHub execution record:

```json
{ "status": "completed", "result": { "success": true },
  "transactionHash": "0xa4eb2254...", "gasUsed": "67350" }
```

**The transaction did not fail.** Any rail keyed on transaction status pays the
agent here. The resolver ignored that signal, read chain state, found
`50000 < 100000`, and [refunded the poster](https://basescan.org/tx/0x84b6acfdb8508493171a5d3b28d3c630eaadde4da55d7a996dbd1a1bf9951f6b).

### Job #4 — a subtler failure

The delta *was* met, but the deadline passed before anyone called `release`, so
it [refunded](https://basescan.org/tx/0x8d10493b0e2cd74b150968c79fc534c5780fc0160dd47eee53385c34984f2958).
Keeping the promise is necessary but not sufficient — it has to be proven inside
the window.

### Executed via the MCP server

Job #5, end to end over `POST /mcp`:

| Step | Transaction |
|---|---|
| approve | [`0xa02af3…`](https://basescan.org/tx/0xa02af3dca97e35a1a129cc7dd45314205ca09939b617d7db6da9f9721d043936) |
| createJob | [`0xac0b88…`](https://basescan.org/tx/0xac0b88c11735d80e8d06c7d799970815a1171bf63fcb134c086c536fa5ae598c) |
| agent transfer | [`0x576d46…`](https://basescan.org/tx/0x576d46381e1ff023b91034f3d23ee9cab6a7c0309bc2b6fb20ae477bce51f3e7) |
| claim | [`0xce8d6d…`](https://basescan.org/tx/0xce8d6dcb7168eb1b32decf650d960cf0c564b65c35540f1f2e31b9d4c1ecdfe3) |
| **release** | [`0xbac625…`](https://basescan.org/tx/0xbac625b28b5421e32027f3f650f9996fde9389f3ce4ae1a49d59ee679a15bce6) |

Full transaction list: [`DEPLOYMENTS.md`](DEPLOYMENTS.md)

## KeeperHub surfaces

| Surface | How it's used |
|---|---|
| **Audit trail** | Every execution record is read back for observability — and deliberately *never* used as the verification signal |
| **MCP server** | The agent discovers tools via `tools/list` rather than hardcoding endpoints, then executes through them. `idempotency_key` makes the paying transfer safe to retry |
| **x402** | The agent pays per call for third-party listed workflows, signing through a Turnkey-backed wallet with no private key in the process |
| **CLI** | `post`, `work`, `work-fail`, `status`, `tools`, `exec`, `market`, `buy`, `payments` |

## Architecture

```
contracts/    RecourseEscrow.sol — holds funds, verifies the delta on-chain
backend/      resolver (pure, unit-tested decision logic) + dashboard API
agents/       honest + deliberately-failing agents, MCP client, x402 payer, CLI
frontend/     dashboard, animated explainer, live execution log
packages/     shared types — one definition of the predicate
```

pnpm workspaces. Solidity + Foundry. TypeScript everywhere else.

**The verification lives in the contract, not just the resolver.** `release()`
re-reads the balance and reverts if the delta is short, so even a malicious or
broken resolver cannot cause an unearned payout.

## Reliability

- **Idempotency** — the paying transfer carries a deterministic key, so a retry
  after an ambiguous failure returns the original execution instead of sending
  the money twice
- **Transport fallback** — MCP failures fall back to REST *only* for transport
  errors; a tool-level error is a real failure and is never retried onto a second
  code path
- **Honest reporting** — the CLI reports which transport actually served a
  request, not which was configured
- **RPC hardening** — Multicall3 batching, TTL caching and retries; balance reads
  degrade to last-known while verification reads never do

## Quickstart

```bash
pnpm install
cp .env.example .env      # KH_API_KEY, ESCROW_ADDRESS, BASE_RPC_URL
pnpm dev                  # backend :3001 + frontend :5173
```

Drive it from the CLI:

```bash
# what can KeeperHub do?
pnpm --filter @recourse/agents cli -- tools

# post a job, then have an agent keep or break the promise
pnpm --filter @recourse/agents cli -- post --subject 0x… --min 0.1 --pay 0.05
pnpm --filter @recourse/agents cli -- work 6         # honest
pnpm --filter @recourse/agents cli -- work-fail 6    # under-delivers

# decide without submitting, then settle
pnpm --filter @recourse/backend resolve -- 6 --dry-run
pnpm --filter @recourse/backend resolve -- 6
```

> A dedicated `BASE_RPC_URL` is strongly recommended — the public Base endpoint
> rate-limits hard under a polling UI.

## Deploying

Locally the frontend reaches the backend through Vite's dev-server proxy, so
they share an origin. Deployed they don't, and two things have to be configured
or every request fails.

**Backend — Railway (or any Node host)**

Deploy from the repo root, not `backend/` — it depends on workspace packages.

| Setting | Value |
|---|---|
| Install | `pnpm install` |
| Start | `pnpm --filter @recourse/backend start` |
| Health check | `/health` |

Environment: `KH_API_KEY`, `ESCROW_ADDRESS`, `BASE_RPC_URL`, and
`CORS_ORIGINS` set to the frontend's origin. `PORT` is provided by the host.
Leave `RESOLVER_POLL_MS` unset so automatic settlement stays on — without a
running backend, expired jobs never refund.

**Frontend — Vercel**

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Build | `pnpm build` |
| Output | `dist` |

Set **`VITE_API_URL`** to the backend's public origin, no trailing slash. Vite
inlines it at build time, so it must exist *before* the build — adding it
afterwards requires a redeploy, not just a restart. Unset, the built app calls
`/api/...` on the static host and every request 404s.

Then add the Vercel domain to the backend's `CORS_ORIGINS` and redeploy the
backend.

## Security model

The escrow is a public contract on Base. Anyone can post a job to it, so
"anyone could post a job and drain the agent" is the right question to ask.

### The escrow itself

Funds in `RecourseEscrow` can only ever move to one of two places: the **agent**,
if the balance delta is met before the deadline, or back to the **poster**, once
the deadline has passed. There is no third path.

`release()` re-reads the subject's balance on-chain and reverts if the delta is
short. It is callable by anyone precisely because it does not trust the caller —
correctness comes from the chain read, not from who asked. So a malicious or
buggy resolver cannot cause an unearned payout, and a poster cannot reclaim
funds from a job that was genuinely completed in time.

Posting is not free: `createJob` pulls the payment from the poster via
`transferFrom`, so a job cannot exist without its payment already locked.

### The agent's wallet

This is the surface that actually needs defending, and only when the autonomous
agent is enabled. **It is off by default.** With it off, an agent only ever runs
because a human clicked, and nothing can be drained by a stranger posting jobs.

With `AUTO_AGENT` on, the naive attack is to post a job that pays less than it
costs to fulfil — *deliver 0.1, earn 0.001* — and pocket the difference. The
agent refuses: it only accepts jobs where **payment ≥ required delivery**. Under
that rule an attacker's best case is break-even, and any spread they leave for
the agent is a loss for themselves.

The subtler attack is on timing. Between delivering and being released the agent
is exposed: it has moved USDC but has not been paid, and `release` reverts once
the deadline passes. A poster choosing a deadline just long enough to deliver
but too short to settle would be refunded *and* keep the delivery. Two defences:

- The agent calls `release` itself the moment it has claimed, rather than
  waiting for the next sweep. This is why that call exists — it shrinks the
  exposure window from up to ~70 seconds to a single round trip.
- It declines any job with under three minutes remaining, matching the floor
  enforced at creation.

Plus a spending cap (`AUTO_AGENT_MAX_USDC`, default 0.1 per job) and one job per
sweep, so even an unforeseen path is rate-limited rather than instant.

### The known hole: the delta is instantaneous

`release()` reads the subject's balance **at the moment it runs**. So whoever
controls the subject can withdraw the delivery before release lands, making it
revert; the deadline then passes and they are refunded while keeping what the
agent delivered.

This is a property of the predicate, not a bug in the implementation — "balance
is higher now" is checkable on-chain, "balance went up and stayed up" is not,
without either escrowing the subject's funds too or snapshotting at claim time
and accepting a different set of trade-offs.

With the agent driven by a human it does not arise: you choose which jobs to
work. It only matters with `AUTO_AGENT` enabled against a public escrow, and it
is why that is bounded rather than trusted:

- Immediate release after claiming, shrinking the window to one round trip.
- Jobs where poster and subject are the same address are declined outright —
  that is the attack's natural shape, and not what a real job looks like.
- `AUTO_AGENT_MAX_USDC` caps a single incident, and one job per sweep caps the
  rate.

Treat the autonomous agent's wallet as a hot wallet holding only what you are
willing to lose. That is the honest framing, and it is the reason the feature
ships off by default.

### What is deliberately not defended

- **Griefing.** Anyone can post jobs the agent declines, or waste its attention.
  This costs the poster gas and locked capital and gains them nothing.
- **The KeeperHub API key.** It authorises execution from the project's wallet.
  It lives in a Worker secret and a gitignored `.env`, never in `wrangler.toml`
  or the client bundle — but anyone holding it can spend. Rotate it if exposed.
- **The subject address.** A poster naming any address is fine; the predicate is
  about a balance rising, and the agent only cares whether the job pays.

## Limitations

Stated plainly, because the narrowness is the design:

- **USDC balance deltas only.** Other predicate types are future work. A general
  verifier is the fastest way to make the system unverifiable.
- **No subjective work.** "Did this balance rise by N" is machine-checkable;
  "is this logo good" is not, and no smart contract can settle it. That is why
  freelancing platforms need human arbitration and this doesn't.
- **No wallet connect yet.** The KeeperHub execution wallet currently posts jobs.
  The contract already uses `msg.sender`, so user-funded posting needs frontend
  work only — no redeploy.

## Future work

Predicates that stay objectively verifiable: NFT ownership transferred, a
position opened, a governance vote cast, a contract reaching a given state. Same
trustless property, wider surface.

Also: listing Recourse's own verification as a priced workflow, so other agents
can buy settlement verification over x402.

---

Built for the KeeperHub "Agents Onchain" hackathon.
Onboarding friction log: [`docs/keeperhub-friction-log.md`](docs/keeperhub-friction-log.md)
