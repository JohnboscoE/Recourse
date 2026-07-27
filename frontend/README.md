# frontend/ — Job board + audit view

React + TypeScript + Vite + Tailwind v4. Talks to the backend at `:3001`; Vite
proxies `/api/*` there in dev, so the browser sees one origin.

## Run

```bash
pnpm dev            # from the repo root: backend + frontend together
```

Then open http://localhost:5173. The backend must be able to read `.env`
(`KH_API_KEY`, `ESCROW_ADDRESS`, `BASE_RPC_URL`).

## What it does

Left column posts jobs and lists them; right column tails the execution log.

- **Post a job** — approve + `createJob`, both via KeeperHub. A job is one kind
  of statement only: *address X's USDC balance increases by >= N by time T*.
- **Run honest agent** — delivers the required amount, then claims.
- **Run failing agent** — delivers *half*, then claims anyway. The transfer still
  succeeds on-chain; the promise is not kept. This is the demo case.
- **Dry-run resolve** — shows the decision without submitting anything.
- **Settle** — submits `release` or `refund` via KeeperHub.

Each card shows observed-vs-required delta and what the resolver *would* do right
now, so the divergence between "the transaction succeeded" and "the promise was
kept" is visible before anything is settled.

## No wallet connect — on purpose

The browser never signs. It calls the backend, which executes through KeeperHub.
Two reasons: all on-chain execution must route through KeeperHub (a browser
wallet signing `createJob` would bypass it), and wagmi/RainbowKit is setup cost
that earns no judging credit. The poster and agent are both the KeeperHub
execution wallet.

## Notes

- Actions are long-running (a post is two KeeperHub executions). Endpoints return
  immediately and progress arrives over `GET /events` — the UI tails that rather
  than blocking on a spinner.
- The board is a projection of chain state, never of the event log. The log is
  observability only; nothing in it decides a settlement.
- `@recourse/shared` holds the predicate type. The frontend writes predicates,
  the agent executes against them, the resolver verifies. One source of truth.
