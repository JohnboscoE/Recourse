import { useCallback, useEffect, useRef, useState } from "react";
import { api, type AppConfig, type JobView, type LogEvent } from "./api.js";
import { PostJobForm } from "./components/PostJobForm.js";
import { JobCard } from "./components/JobCard.js";
import { EventLog } from "./components/EventLog.js";
import { Hero } from "./components/Hero.js";
import { NavBar } from "./components/NavBar.js";

type View = "board" | "landing";

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
  // Board by default — it's the working tool. Overview is the pitch, and the
  // opening shot for the demo video.
  const [view, setView] = useState<View>("board");
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

  const chrome = (
    <NavBar
      cfg={cfg}
      balances={balances}
      view={view}
      onNavigate={setView}
      connected={!err}
    />
  );

  if (view === "landing") {
    return (
      <div className="h-full overflow-y-auto">
        {chrome}
        <Hero onEnter={() => setView("board")} />
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* Ambient wash so the dashboard sits on the same material as the
          landing page. Static rather than the animated canvas — the board is
          a working surface and shouldn't burn a core on decoration. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60rem 40rem at 15% -10%, color-mix(in oklab, var(--primary) 10%, transparent), transparent 60%)," +
            "radial-gradient(50rem 30rem at 100% 0%, color-mix(in oklab, var(--info) 7%, transparent), transparent 55%)",
        }}
      />

      {chrome}

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
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Jobs</h2>
              {jobs.length > 0 && (
                <span className="text-muted-foreground text-xs">
                  {jobs.length} total
                </span>
              )}
            </div>
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
