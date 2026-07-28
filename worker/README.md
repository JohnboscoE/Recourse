# worker/ — Recourse API on Cloudflare

The same API as `backend/`, ported to Workers. Both are maintained; pick one.

The settlement decision itself lives in `@recourse/shared` and is imported by
both, so the two runtimes cannot disagree about whether a job releases or
refunds. Everything else here differs only where the platform forces it.

## What changed, and why

| Node backend | Worker | Why |
|---|---|---|
| Fastify | Hono | Workers speak `fetch`, not `node:http` |
| `setInterval` every 30s | Cron Trigger every 60s | Nothing stays alive between requests. One minute is Cloudflare's finest granularity — it changes how fast a settlement lands, never whether it does |
| In-memory event log | D1 | Isolates are ephemeral; an in-memory log would return different history depending on which isolate answered |
| `.env` via dotenv | bindings + secrets | No filesystem |
| Module-level config | per-request `readConfig(env)` | Bindings arrive on the request, not the process |
| TTL read cache | none | Isolates may not be reused, so a cache would exist only sometimes — worse than none for reasoning about staleness |

D1 was chosen over KV (write-rate limited, eventually consistent — both wrong
for an append-heavy log the UI tails) and over Durable Objects (correct, but
needs the paid plan, which defeats the point of moving off Railway).

## Deploy

```bash
cd worker

# 1. Create the database, then paste the returned id into wrangler.toml
npx wrangler d1 create recourse

# 2. Create the events table
npx wrangler d1 execute recourse --remote --file=./schema.sql

# 3. The one secret
npx wrangler secret put KH_API_KEY

# 4. Ship
npx wrangler deploy
```

Then in `wrangler.toml` set `CORS_ORIGINS` to the frontend's origin and
`BASE_RPC_URL` to a dedicated endpoint — the Worker has no read cache in front
of the RPC, so the public Base endpoint throttles harder here than locally.

Finally point the frontend at it: `VITE_API_URL=https://recourse-api.<you>.workers.dev`
and redeploy (Vite inlines it at build time).

## Local

```bash
npx wrangler dev --local
npx wrangler d1 execute recourse --local --file=./schema.sql   # once
```

Put `KH_API_KEY` and `BASE_RPC_URL` in `worker/.dev.vars` (gitignored).

Two gotchas that cost time here:

- `wrangler dev` does not fail loudly if the port is taken — you can end up with
  two instances and silently talk to the stale one. `netstat -ano | grep 8787`
  if behaviour looks impossible.
- Miniflare does not fire Cron Triggers automatically. Use `--test-scheduled`
  and hit `/__scheduled` to exercise the sweep locally.

## Verified

Against the live Base deployment, from inside the Workers runtime:

- `/jobs` — 20 jobs via a single Multicall3 round trip
- `/config`, `/health`, `/events` (D1)
- `/resolve/:id?dryRun=1` — decision logic
- KeeperHub audit lookup **over MCP**, returning Job #2's record
  (`success: true`, tx `0xa4eb22…`) — the record the whole project exists to
  distrust
- Bundle: 852 KiB raw, **163 KiB gzipped**, inside the 1 MB limit
