# What Recourse actually is

A plain-language explanation of the project — what problem it solves, why that
problem is hard, and what every piece of the codebase is for.

---

## 1. Start with a story

You hire an AI agent to pay a supplier. The instruction is simple:

> Send 100 USDC to `0xSupplier`.

The agent runs. A transaction goes onto the blockchain. It confirms. Your
dashboard shows a green tick, a transaction hash, `success: true`. You pay the
agent its fee.

Then the supplier calls and says they received **10 USDC**.

Nothing malfunctioned. The transaction really did succeed. It just moved the
wrong amount — a slipped decimal, a stale variable, a hallucinated argument, a
partially-filled swap. The blockchain did exactly what it was told. What it was
told was wrong.

**Every payment system you could have used would still have paid that agent.**

---

## 2. The thing almost everyone gets wrong

When a blockchain transaction "succeeds", that means one specific, narrow thing:

> The transaction did not revert.

It ran to completion without throwing an error. That is *all* it means.

It does **not** mean:

- the right amount moved
- it went to the right address
- the balance you cared about actually changed
- the thing you were paying for happened

There is a gap between **"the transaction succeeded"** and **"the job was
done."** Most software treats those as the same thing. They are not, and the
distance between them is where money gets lost.

This is not theoretical. Two real examples from this project:

**Our own test.** Job #2 on Base. An agent was required to increase an address's
balance by 0.10 USDC. It sent 0.05 — half — and then claimed the job as
complete. Its execution record reads:

```json
{ "status": "completed", "result": { "success": true },
  "transactionHash": "0xa4eb2254...", "gasUsed": "67350" }
```

A confirmed transaction. Real gas burned. `success: true`. And the promise was
not kept.

**Somebody else's live system.** While integrating x402 (an agent payment
protocol), we paid $0.01 twice for listed services on a public marketplace. Both
payments settled on-chain. Both returned `HTTP 200`. **Neither returned a usable
result** — one service was misconfigured, another crashed, a third was offline.

The money left. The work never arrived. There was no refund, because nothing in
the system ever checked whether the thing we paid for actually happened.

That is the gap. That is what this project is about.

---

## 3. Why this is suddenly urgent

Until recently, humans clicked the buttons. A human notices when the supplier
says "you only sent me 10."

Now agents do it, at machine speed, and the payment rails for them have shipped:
**x402** (pay per HTTP call in USDC) and **MPP** (Stripe's machine payment
protocol) are both live and processing real volume.

Those rails answer *"how does an agent pay?"* extremely well.

Neither of them answers *"did the agent's work actually happen?"*

The layer underneath the payment — the part that checks whether the paid-for
outcome occurred before releasing the money — was never built. Recourse is an
attempt at that layer.

---

## 4. What Recourse does

The idea in one sentence:

> **Hold the payment in escrow, and release it only when the blockchain itself
> proves the promised thing happened.**

Concretely, a job has four stages:

### Stage 1 — Post
The buyer writes a promise a computer can check, and locks the payment in a
smart contract:

> "`0xSupplier`'s USDC balance must increase by **at least 0.10** before **3:00pm**."

The contract records the supplier's balance *right now* (the **baseline**) so
only increases from this moment count. The payment is now locked — the buyer
can't take it back, and the agent can't touch it yet.

### Stage 2 — Execute
An agent does the work — sends the USDC — and then **claims** the job, recording
a reference to the execution it performed.

### Stage 3 — Verify
This is the part that matters.

A **resolver** reads the supplier's balance *directly from the blockchain* and
subtracts the baseline. That difference is the **delta**.

It then compares the delta to the promise. Note what it does **not** do: it does
not ask whether the transaction succeeded. It does not trust the agent's claim.
It does not trust the execution log. It reads the ledger.

### Stage 4 — Settle
- Delta ≥ promise, before the deadline → **release**: the agent is paid.
- Deadline passes without that → **refund**: the buyer gets their money back.

Both outcomes are automatic. No arbitrator, no dispute queue, no support ticket.

---

## 5. The one design decision that makes it work

The promise is **always** the same shape:

> address X's USDC balance increases by at least N by time T

That is deliberately, almost stubbornly narrow. It is also the whole reason the
system can work without trusting anybody.

**Why narrow is the point.** A smart contract can check "did this balance go up
by 100?" with absolute certainty. The blockchain *is* the source of truth, and
the contract can read it directly. No human, no oracle, no judgement call.

Now consider the obvious "improvement": let people post any job, like Upwork.

> "Design me a logo."

A smart contract cannot look at a logo and decide whether it's good, or whether
it matches the brief. Nothing on-chain can. The moment you need a human — or an
AI — to say *"yes, this counts"*, you have re-introduced the trusted middleman
the escrow existed to remove. And now you need to answer: who watches them? What
happens when the two sides disagree?

That is why Upwork has arbitrators, reputation systems, and lawyers. It is a
company, not a contract.

**So Recourse is not a worse Upwork. It's a different thing.** It works only for
jobs whose result is objectively visible on-chain — which happens to be exactly
the category "agents doing onchain work" falls into.

---

## 6. Where KeeperHub fits

KeeperHub is the execution layer. The agent never signs transactions itself;
it asks KeeperHub to execute them and KeeperHub returns an audit record.

This matters for two reasons.

**Practically:** it's the hackathon's one hard requirement, and it gives us
sponsored gas, retries, idempotency and a queryable audit trail we'd otherwise
have to build.

**Conceptually — and this is the interesting part:** KeeperHub's audit trail is
*honest and correct*, and it still isn't enough. It faithfully reports
`success: true` for a transaction that moved the wrong amount, because that
transaction genuinely did succeed. It's answering the question it was asked.

Recourse uses that audit trail everywhere for **observability** — showing what
happened, linking transactions, tracking gas. But it never uses it as the
**verification** signal. Chain state decides. That separation is the product.

---

## 7. What's in the repo

```
contracts/   RecourseEscrow.sol — holds the money, does the verification
backend/     the resolver + an API for the dashboard
agents/      worker agents + CLI (post jobs, do work, pay over x402)
frontend/    dashboard and landing page
packages/    shared types used by all of the above
```

### `contracts/` — the escrow
`RecourseEscrow.sol` is where trust is *not* required. It holds the USDC and
contains the verification logic itself:

- `createJob(...)` — records the promise, snapshots the baseline, pulls in payment
- `claim(...)` — an agent takes the job and records its execution reference
- `release(...)` — **re-reads the balance on-chain**, and reverts if the delta
  is short. Anyone may call this; it cannot be tricked, because it verifies
  rather than trusting the caller.
- `refund(...)` — after the deadline, returns the money to the buyer

The important line: `release` does its own check. Even if the resolver were
malicious or buggy, the contract will not pay out on an unmet promise.

### `backend/` — the resolver
Watches jobs, reads chain state, decides `release` / `refund` / `wait`, and
submits the settlement through KeeperHub. The decision logic (`decide()`) is a
pure function with no I/O, so it's fully unit-tested — 9 tests covering the
boundaries.

It also serves the dashboard API and an event log the UI streams.

### `agents/` — the workers
- an **honest agent** that delivers what was promised
- a **failing agent** that deliberately delivers half, then claims anyway —
  this is how the refund path gets demonstrated
- an MCP client, so the agent *discovers* KeeperHub's capabilities rather than
  hardcoding endpoints
- x402 support, so the agent can pay for other services per call
- a CLI: `post`, `work`, `work-fail`, `status`, `tools`, `exec`, `market`,
  `buy`, `payments`

### `frontend/` — the dashboard
Post jobs, run either agent, watch the resolver decide, see every execution
stream into a log with links to Basescan. The landing page has an animation of
the whole loop, showing the honest and failing runs side by side.

---

## 8. Glossary

| Term | Meaning |
|---|---|
| **Predicate** | The promise. Always: "balance of X rises by ≥ N by time T". |
| **Baseline** | The subject's balance at job creation. Only later increases count. |
| **Delta** | Current balance − baseline. The number that decides everything. |
| **Subject** | The address whose balance must rise. Often not the agent. |
| **Poster** | Whoever funded the job and gets the refund if it fails. |
| **Agent** | Whoever claimed the job and gets paid if it succeeds. |
| **Resolver** | The off-chain service that reads chain state and triggers settlement. |
| **Execution / executionId** | One action KeeperHub performed, with its own audit record. |
| **x402** | Pay-per-HTTP-call protocol. A `402` response carries a payment demand. |
| **MCP** | Model Context Protocol — how the agent discovers and calls KeeperHub tools. |

---

## 9. What it deliberately does not do

Being clear about this is a feature, not an apology.

- **Only USDC balance deltas.** No other predicate types. Generalising the
  verifier is the fastest way to make it unverifiable.
- **No subjective work.** No logos, no code review, no "was this good?".
- **No dispute resolution.** There is nothing to dispute — the ledger is not an
  opinion.
- **No wallet connect yet.** Today the KeeperHub execution wallet posts jobs.
  Letting a real user fund from their own wallet needs no contract change (the
  contract already uses `msg.sender`), only frontend work.

---

## 10. If you remember one thing

> A transaction succeeding tells you the blockchain didn't reject it.
> It tells you nothing about whether the work was done.
>
> Recourse is the layer that checks the difference — and refuses to pay when
> they disagree.
