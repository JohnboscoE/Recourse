# Demo video script

Target: **2:45**. Judges watch a lot of these — the thesis has to land in the
first fifteen seconds, and the refund has to be on screen by 2:00.

The single most important requirement: *show the agent executing onchain via
KeeperHub, with a real transaction.* Everything else is supporting material.

---

## Before you hit record

| Check | Why |
|---|---|
| `w32tm /resync /force` (admin shell) | Clock is ~2.5h slow; it already broke x402 signing once |
| `BASE_RPC_URL` set to a dedicated endpoint | The public Base RPC rate-limits and will stall the UI mid-take |
| Backend running, nav shows **auto-settle** | If it shows `manual`, expired jobs never refund and the finale dies |
| Wallet ≥ 0.5 USDC | A full run costs ~0.15 |
| Browser at 1440×900, zoom 100%, Chrome | The glass distortion is Chromium-only |
| Close the dev console and other tabs | |
| Clear `localStorage` if you want the welcome dialog to appear | Key: `recourse.onboarding.v1` |

**Stage this first — do not skip.** Blockchain confirmations take 20–60s, which
is dead air on camera. Before recording, post a job with a **4 minute** deadline
and run the failing agent against it. By the time you reach Act 4 it will be
seconds from expiry, and the automatic refund lands live instead of you watching
a spinner.

Post a *second* job with a 30-minute deadline to use for the live posting shot.

---

## Act 1 — The problem (0:00–0:25)

**Screen:** Landing page. Let the flow-field settle for a beat before speaking.

> "A blockchain transaction succeeding means one thing: it didn't revert.
> It does *not* mean the right amount moved, or that it reached the right
> address, or that the thing you paid for actually happened."

**Scroll to "Why this exists".** Hover the three problem cards.

> "Payment rails for agents shipped — x402, MPP, live and moving real volume.
> They answer *how does an agent pay*. Nothing underneath them answers
> *did the work happen*. That's the gap."

---

## Act 2 — How it works (0:25–0:50)

**Screen:** Scroll to the How-it-works animation. Let one full honest cycle run,
then click **"Agent under-delivers"**.

> "A job is a promise a machine can check: this address's USDC balance must rise
> by at least N, before a deadline. Payment sits in escrow. An agent does the
> work. Then a resolver reads the *balance on chain* — not the receipt — and
> compares."

Point at the pipeline as the failing run diverges at Settle.

> "Same successful transaction. Opposite outcome. Only the measured delta
> decides."

---

## Act 3 — Executing onchain via KeeperHub (0:50–1:35)

**Screen:** Dashboard. This is the act that satisfies the hard requirement.

> "This is live on Base. Every onchain action here goes through KeeperHub."

Click **New job**. Fill: subject (an address that is *not* the agent wallet),
required `0.1`, payment `0.05`, deadline `30`. Submit.

> "Posting locks the payment and snapshots the subject's balance as a baseline —
> so only increases from this moment count."

**Cut to the execution log** as entries stream in. Point at them:

> "Approve, then createJob. Two KeeperHub executions, both real transactions
> on Base."

Click a **tx hash → Basescan**. Hold for 3 seconds on the confirmed transaction.

> "That's on chain, right now."

*(If the confirmations run slow, cut here to the pre-staged job.)*

---

## Act 4 — The money shot (1:35–2:15)

**Screen:** The pre-staged job, seconds from expiry.

Click **Failing agent**.

> "This agent delivers half of what it promised — and then claims the job
> anyway, as if it had finished."

**Point at the log line showing the transfer succeeded.** This is the moment
that matters — say it slowly:

> "Look carefully. KeeperHub reports the execution *completed*. `success: true`.
> A real transaction hash, real gas burned. **The transaction did not fail.**
> Every payment rail in existence pays the agent right here."

**Point at the delta bar** — amber, half full.

> "But the balance only moved half as far as promised. The resolver reads chain
> state, not the receipt."

**Wait for the automatic refund.** Do not click Settle — the point is that
nobody has to.

> "Deadline passes. No arbitrator, no dispute, nobody clicking anything —
> the poster is refunded automatically."

Job flips to **Refunded**. Open that transaction on Basescan.

---

## Act 5 — It isn't hypothetical (2:15–2:40)

**Screen:** Terminal. Run:

```bash
pnpm --filter @recourse/agents cli -- payments
```

> "While building this, I integrated x402 and paid a cent each to two listed
> services on a live marketplace. Both payments settled on chain. Both returned
> HTTP 200. **Neither returned a usable result** — one misconfigured, one
> crashed, one offline."

> "The rail worked perfectly. No work was delivered. And there's no refund,
> because nothing checked. That's not my demo — that's production, today."

---

## Act 6 — Close (2:40–2:55)

**Screen:** Dashboard with the metrics row visible.

> "Recourse is the settlement layer those rails shipped without. Escrow, an
> objectively checkable promise, and payment that releases only when the chain
> agrees."

> "Everything executes through KeeperHub — MCP for discovery and execution, the
> audit trail for observability, x402 for per-call payment. Both settlement
> paths are verified on Base. Links in the description."

---

## If something breaks mid-take

| Symptom | Do this |
|---|---|
| Job stuck `Open`, nothing settling | Nav says `manual` — backend restarted without auto-settle. Cut, restart it. |
| Balances show `(stale)` | RPC is throttling. Keep going — it's cosmetic and verification reads are unaffected. |
| An execution hangs > 90s | Cut to the pre-staged job. Never film a spinner. |
| Agent buttons greyed out | Job isn't `Open` — it's already claimed or settled. Use a fresh one. |

## Don't say

- "Trustless" without immediately explaining *why* — it's noise otherwise.
- "Could be extended to any kind of job." It can't, and a sharp judge will
  pounce. The narrowness is the design; say so if it comes up.

## Links for the description

- Repo: https://github.com/JohnboscoE/Recourse
- Escrow: https://basescan.org/address/0xE21A7446a89b3A8C9A455dC5e1c2A61D21E25982
- Release via MCP: https://basescan.org/tx/0xbac625b28b5421e32027f3f650f9996fde9389f3ce4ae1a49d59ee679a15bce6
- Refund (promise unmet): https://basescan.org/tx/0x84b6acfdb8508493171a5d3b28d3c630eaadde4da55d7a996dbd1a1bf9951f6b
