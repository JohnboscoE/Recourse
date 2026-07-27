import { useCallback, useEffect, useRef, useState } from "react";
import { api, type AppConfig, type JobView, type LogEvent } from "./api.js";
import { PostJobForm } from "./components/PostJobForm.js";
import { JobCard } from "./components/JobCard.js";
import { EventLog } from "./components/EventLog.js";

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

  return (
    <div className="h-full flex flex-col">
      <header className="border-b border-[#232b3a] px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold">
            Recourse <span className="text-slate-500 font-normal">— verified settlement</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Agents get paid when <em>chain state</em> matches the promise — not when the
            transaction merely succeeds.
          </p>
        </div>

        <div className="flex items-center gap-5 text-xs">
          {balances && (
            <>
              <div>
                <div className="text-slate-500">escrow held</div>
                <div className="font-mono text-slate-200">{balances.escrowUsdc} USDC</div>
              </div>
              <div>
                <div className="text-slate-500">
                  KeeperHub wallet
                  {balances.stale && (
                    <span className="ml-1 text-amber-400" title="RPC unavailable — last known value">
                      (stale)
                    </span>
                  )}
                </div>
                <div className="font-mono text-slate-200">{balances.walletUsdc} USDC</div>
              </div>
            </>
          )}
          {cfg && (
            <a
              href={`${cfg.explorer}/address/${cfg.escrowAddress}`}
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 hover:text-sky-300 underline font-mono"
            >
              {cfg.escrowAddress.slice(0, 8)}…{cfg.escrowAddress.slice(-4)} ↗
            </a>
          )}
        </div>
      </header>

      {err && (
        <div className="bg-rose-500/10 border-b border-rose-500/30 text-rose-300 text-xs px-6 py-2 font-mono">
          {err} — is the backend running on :3001?
        </div>
      )}

      <main className="flex-1 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 p-5 min-h-0">
        <div className="space-y-4 overflow-y-auto min-h-0 pr-1">
          <PostJobForm
            defaultSubject={cfg?.keeperHubWallet ?? ""}
            onPosted={() => void refreshJobs()}
          />

          <div className="space-y-3">
            <h2 className="font-semibold text-sm text-slate-300">
              Jobs {jobs.length > 0 && <span className="text-slate-500">({jobs.length})</span>}
            </h2>
            {jobs.length === 0 && (
              <p className="text-xs text-slate-500">No jobs yet.</p>
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
