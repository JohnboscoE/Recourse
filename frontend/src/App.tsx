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
import { WelcomeDialog } from "./components/onboarding/WelcomeDialog.js";
import { SetupChecklist } from "./components/onboarding/SetupChecklist.js";
import { useOnboarding } from "./components/onboarding/useOnboarding.js";
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
  const onboarding = useOnboarding();
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
      onReplayOnboarding={onboarding.replay}
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

      <WelcomeDialog
        open={onboarding.showWelcome}
        onClose={onboarding.completeWelcome}
        onStartTour={() => {
          onboarding.completeWelcome();
          setView("board");
        }}
      />

      {err && (
        <div className="border-danger/30 bg-danger-muted text-danger border-b px-6 py-2 font-mono text-xs">
          {err} — is the backend running on :3001?
        </div>
      )}

      <main className="mx-auto max-w-[1400px] px-8 py-12">
        {/* Page header */}
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="display text-[1.75rem] leading-none font-semibold">
              Dashboard
            </h1>
            <p className="text-muted-foreground mt-3 max-w-lg text-sm leading-relaxed">
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

        {onboarding.showChecklist && (
          <div className="mt-8">
            <SetupChecklist
              cfg={cfg}
              balances={balances}
              jobs={jobs}
              backendUp={!err}
              onDismiss={onboarding.dismissChecklist}
            />
          </div>
        )}

        <div className="mt-10">
          <MetricsRow jobs={jobs} escrowUsdc={balances?.escrowUsdc ?? null} />
        </div>

        {composing && (
          <div className="mt-8">
            <PostJobForm
              defaultSubject={cfg?.keeperHubWallet ?? ""}
              onPosted={() => void refreshJobs()}
              onClose={() => setComposing(false)}
            />
          </div>
        )}

        {/* Asymmetric split: jobs carry more weight than the log. */}
        <div className="mt-14 grid items-start gap-8 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <section>
            <div className="mb-5 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Jobs</h2>
              {jobs.length > 0 && (
                <span className="text-muted-foreground tnum text-xs">
                  {jobs.length} total
                </span>
              )}
            </div>

            {jobs.length === 0 ? (
              <Card className="flex flex-col items-center justify-center px-8 py-20 text-center">
                <Inbox className="text-muted-foreground/40 size-7" />
                <h3 className="mt-5 text-sm font-medium">No jobs yet</h3>
                <p className="text-muted-foreground mt-2.5 max-w-xs text-xs leading-relaxed">
                  Post one to lock USDC in escrow against a balance-delta
                  promise, then run an agent against it.
                </p>
                {!composing && (
                  <button
                    onClick={() => setComposing(true)}
                    className="text-primary mt-6 text-xs font-medium hover:underline"
                  >
                    Create the first job →
                  </button>
                )}
              </Card>
            ) : (
              <div className="space-y-5">
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
