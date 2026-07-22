# Recourse

Hackathon project for the KeeperHub "Agents Onchain" hackathon (DoraHacks).
Build window: July 27 – August 13, 2026. Solo developer.

## What we are building

Escrowed payment for agent-executed onchain work. Funds are released to the
agent only when the resulting **chain state** matches what was promised — not
merely when a transaction succeeds.

The core insight: a transaction can confirm successfully and still do the wrong
thing. Payment rails for agents (x402, MPP) shipped without a settlement
verification layer underneath them. That gap is the product.

Execution happens through KeeperHub, which is the hackathon's one hard
requirement.

## Hard constraints — do not violate without asking

1. **Verification predicate is ERC-20 balance delta ONLY.**
   A job is a signed statement of the form: "address X's USDC balance increases
   by >= N by time T." Nothing else. Do NOT add other predicate types before
   August 13. If a more general verifier feels easy while implementing, it is
   not — it is the thing most likely to sink the deadline. Generalization is
   explicitly future work and belongs in the README, not the codebase.

2. **All onchain execution goes through KeeperHub.** Never bypass it with a
   direct RPC send for convenience. Submissions that don't execute via
   KeeperHub are disqualified.

3. **Chain is Base.** Not Ethereum mainnet, not a testnet the judges can't
   verify, not Arc. Base is cheap enough to build genuine transaction volume.

4. **No agent framework.** Plain TypeScript agents. ElizaOS / CrewAI /
   LangChain cost setup days and earn zero judging credit.

## Stack

- `contracts/` — Solidity + Foundry. `RecourseEscrow.sol`, tests, deploy scripts.
- `backend/` — Node + TypeScript (Fastify). API, resolver, KeeperHub audit-trail
  polling, persistence. SQLite to start; Postgres on Railway if needed.
- `agents/` — Node + TypeScript worker agents. `viem` for chain reads,
  KeeperHub MCP/REST for execution. Includes a deliberately-failing agent used
  to demo the refund path.
- `frontend/` — React + TypeScript + Vite + Tailwind. Job board and audit view.
  Deploys to Vercel.
- `packages/shared/` — Shared TS types: `Job`, `Predicate`, `ExecutionRecord`,
  ABI exports. The predicate type is written by the frontend, executed against
  by the agent, and verified by the resolver — it must live in exactly one place.

pnpm workspaces. No Turborepo (overkill for four packages and one person).

Note: developer is on Windows. Foundry work in `contracts/` should be run from
Git Bash or WSL. Do not try to unify the two shells.

## Contract shape (starting point, not gospel)

- `createJob(...)` — locks USDC, records the predicate and deadline
- `claim(...)` — agent submits a KeeperHub execution reference
- resolver verifies the balance delta
- `release(...)` or `refund(...)`

## KeeperHub surfaces — priority order

Judges score on how well the KeeperHub stack is exercised. Hit these in order:

1. **Audit trail** — core to the product, non-negotiable
2. **MCP server** — agent discovers and calls execution
3. **x402** — per-execution payment
4. **CLI** — ops and demo tooling

## BLOCKING PRE-BUILD CHECK — do this before writing any application code

Confirm that KeeperHub's audit trail can be queried **programmatically** for
per-execution outcome data (submitted tx, gas used, outcome, timestamp).

The resolver depends on this. If the audit trail is UI-only and not exposed via
API/MCP, the architecture changes: we would have to read chain state directly,
which thins the KeeperHub integration and hurts the surface-coverage score.

**Stop and report the finding before proceeding.** Do not design around an
assumption here.

## Schedule and fallback

- **July 23–26 (pre-build):** KeeperHub account, MCP server running, one
  throwaway transaction landed on Base, audit-trail API check above.
- **Week 1 (Jul 27 – Aug 3):** Escrow contract + one worker agent + resolver.
  Target: full loop end-to-end — job posted, agent executes via KeeperHub,
  resolver verifies delta, funds release. Ugly is fine. No frontend yet.
- **CHECKPOINT Aug 3:** If the loop does not work end-to-end, fall back to a
  simpler build (KeeperHub-executed treasury bot with a strong audit-trail
  dashboard). Deciding this on Aug 10 is too late.
- **Week 2 (Aug 4–10):** Deliberately-failing agent to demo the refund path
  (this is the differentiator on screen). Then x402, MCP integration, minimal
  frontend, and repeated runs to build real transaction volume.
- **Aug 11–13:** Demo video, README, submission. Do not leave this to the 13th.

## Submission requirements (all three are mandatory)

- GitHub source link
- Short demo video showing the agent executing onchain via KeeperHub
- A link to a transaction the agent executed via KeeperHub

Incomplete submissions cannot be judged.

## Side deliverable — $1,000 bounty, split between two winners

"Best Onboarding UX Improvement." Keep a running log of every point of friction
hit while setting up KeeperHub during week one. That log becomes a teardown or
starter template submission. Stacks with the grand prize, thin field, roughly
three hours of extra work. Do not skip it.

## Judging criteria (weighting matters)

Execution is weighted heavily. In rough priority:

1. Does it execute onchain via KeeperHub? Working transactions, not mockups.
2. Use of KeeperHub surfaces.
3. Reliability and observability — retries, gas handling, audit trail usage.
4. Originality and real-world usefulness.
5. Integration quality and developer experience.

A profound idea with three transactions loses to a boring auto-compounder with
fifty transactions across four surfaces. Prioritize accordingly.

## Working notes

- Scope creep is the primary failure mode of this project, not technical
  difficulty. Push back on scope expansion rather than implementing it.
- Verify the name `Recourse` is free (GitHub org / npm / domain) before the
  workspace is deep. Fallback name: `Warrant` (`WarrantEscrow.sol`).
