import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { api, type AppConfig, type JobView, type LogEvent } from "./api.js";
import { PostJobForm } from "./components/PostJobForm.js";
import { JobCard } from "./components/JobCard.js";
import { EventLog } from "./components/EventLog.js";
import { Hero } from "./components/Hero.js";

export default function App() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [balances, setBalances] = useState<{
    escrowUsdc: string;
    walletUsdc: string;
    stale: boolean;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nowSec, setNowSec] = useState(Math.floor(Date.now() / 1000));
  // Board by default — it's the working tool. The landing screen is the opening
  // shot for the demo video, reachable from the header.
  const [showHero, setShowHero] = useState(false);
  const seqRef = useRef(0);

  const refreshJobs = useCallback(async () => {
    try {
      const [{ jobs }, bal] = [await api.jobs(), await api.balances()];
      setJobs(jobs);
      setBalances(bal);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  // Initial load.
  useEffect(() => {
    api.config().then(setCfg).catch(() => {});
    void refreshJobs();
  }, [refreshJobs]);

  // Tail the event log. New events almost always mean chain state moved, so
  // refresh the board too rather than polling it on its own timer.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const { events: fresh, latestSeq } = await api.events(seqRef.current);
        if (!alive) return;
        if (fresh.length) {
          seqRef.current = latestSeq;
          setEvents((prev) => [...prev, ...fresh]);
          void refreshJobs();
        }
      } catch {
        /* backend not up yet; the next tick retries */
      }
    };
    const id = setInterval(tick, 1500);
    void tick();
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [refreshJobs]);

  // Ticking clock for deadline countdowns.
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  if (showHero) return <Hero onEnter={() => setShowHero(false)} />;

  return (
    <div className="flex h-full flex-col">
      <header className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">
            Recourse{" "}
            <span className="text-muted-foreground font-normal">
              — verified settlement
            </span>
          </h1>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Agents get paid when <em>chain state</em> matches the promise — not
            when the transaction merely succeeds.
          </p>
        </div>

        <div className="flex items-center gap-5 text-xs">
          <button
            onClick={() => setShowHero(true)}
            className="text-muted-foreground hover:text-primary underline underline-offset-4 transition-colors"
          >
            landing
          </button>

          {balances && (
            <>
              <div>
                <div className="text-muted-foreground">escrow held</div>
                <div className="font-mono">{balances.escrowUsdc} USDC</div>
              </div>
              <div>
                <div className="text-muted-foreground">
                  KeeperHub wallet
                  {balances.stale && (
                    <span
                      className="text-warning ml-1"
                      title="RPC unavailable — last known value"
                    >
                      (stale)
                    </span>
                  )}
                </div>
                <div className="font-mono">{balances.walletUsdc} USDC</div>
              </div>
            </>
          )}

          {cfg && (
            <a
              href={`${cfg.explorer}/address/${cfg.escrowAddress}`}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 font-mono transition-colors"
            >
              {cfg.escrowAddress.slice(0, 8)}…{cfg.escrowAddress.slice(-4)}
              <ArrowUpRight className="size-3" />
            </a>
          )}
        </div>
      </header>

      {err && (
        <div className="border-danger/30 bg-danger-muted text-danger border-b px-6 py-2 font-mono text-xs">
          {err} — is the backend running on :3001?
        </div>
      )}

      <main className="grid min-h-0 flex-1 gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          <PostJobForm
            defaultSubject={cfg?.keeperHubWallet ?? ""}
            onPosted={() => void refreshJobs()}
          />

          <div className="space-y-3">
            <h2 className="text-sm font-semibold">
              Jobs{" "}
              {jobs.length > 0 && (
                <span className="text-muted-foreground font-normal">
                  ({jobs.length})
                </span>
              )}
            </h2>
            {jobs.length === 0 && (
              <p className="text-muted-foreground text-xs">No jobs yet.</p>
            )}
            {jobs.map((j) => (
              <JobCard
                key={j.jobId}
                job={j}
                cfg={cfg}
                nowSec={nowSec}
                onAction={() => void refreshJobs()}
              />
            ))}
          </div>
        </div>

        <div className="min-h-0">
          <EventLog events={events} cfg={cfg} />
        </div>
      </main>
    </div>
  );
}
