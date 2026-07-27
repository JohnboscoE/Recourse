import { useCallback, useEffect, useRef, useState } from "react";
import { Inbox, Plus } from "lucide-react";
import { api, type AppConfig, type JobView, type LogEvent } from "./api.js";
import { PostJobForm } from "./components/PostJobForm.js";
import { JobCard } from "./components/JobCard.js";
import { EventLog } from "./components/EventLog.js";
import { Hero } from "./components/Hero.js";
import { NavBar } from "./components/NavBar.js";
import { MetricsRow } from "./components/MetricsRow.js";
import { AmbientBackground } from "./components/ui/ambient-background.js";
import { LiquidButton } from "./components/ui/liquid-glass-button.js";
import { Card } from "./components/ui/card.js";

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
  const [view, setView] = useState<View>("board");
  const [composing, setComposing] = useState(false);
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
        <AmbientBackground intensity="full" />
        {chrome}
        <Hero onEnter={() => setView("board")} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <AmbientBackground intensity="subtle" />
      {chrome}

      {err && (
        <div className="border-danger/30 bg-danger-muted text-danger border-b px-6 py-2 font-mono text-xs">
          {err} — is the backend running on :3001?
        </div>
      )}

      <main className="mx-auto max-w-[1440px] px-6 py-8">
        {/* Page header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="display text-2xl font-semibold">Dashboard</h1>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Escrowed jobs, settled against Base chain state — not against
              transaction receipts.
            </p>
          </div>

          {!composing && (
            <LiquidButton size="lg" onClick={() => setComposing(true)}>
              <Plus className="size-4" />
              New job
            </LiquidButton>
          )}
        </div>

        <div className="mt-7">
          <MetricsRow jobs={jobs} escrowUsdc={balances?.escrowUsdc ?? null} />
        </div>

        {composing && (
          <div className="mt-6">
            <PostJobForm
              defaultSubject={cfg?.keeperHubWallet ?? ""}
              onPosted={() => void refreshJobs()}
              onClose={() => setComposing(false)}
            />
          </div>
        )}

        {/* Asymmetric split: jobs carry more weight than the log. */}
        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Jobs</h2>
              {jobs.length > 0 && (
                <span className="text-muted-foreground tnum text-xs">
                  {jobs.length} total
                </span>
              )}
            </div>

            {jobs.length === 0 ? (
              <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-white/[0.06] ring-1 ring-white/10">
                  <Inbox className="text-muted-foreground size-5" />
                </span>
                <h3 className="text-sm font-medium">No jobs yet</h3>
                <p className="text-muted-foreground mt-1.5 max-w-xs text-xs leading-relaxed">
                  Post one to lock USDC in escrow against a balance-delta
                  promise, then run an agent against it.
                </p>
                {!composing && (
                  <button
                    onClick={() => setComposing(true)}
                    className="text-primary mt-4 text-xs font-medium hover:underline"
                  >
                    Create the first job →
                  </button>
                )}
              </Card>
            ) : (
              <div className="space-y-4">
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
            )}
          </section>

          {/* Log follows the page but stays in view while scrolling jobs. */}
          <section className="xl:sticky xl:top-24">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Execution log</h2>
              <span className="text-muted-foreground tnum text-xs">
                {events.length} events
              </span>
            </div>
            <EventLog events={events} cfg={cfg} />
          </section>
        </div>
      </main>
    </div>
  );
}
