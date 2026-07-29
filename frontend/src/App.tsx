import { useCallback, useEffect, useRef, useState } from "react";
import { Inbox, Plus } from "lucide-react";
import { api, type AppConfig, type JobView, type LogEvent } from "./api.js";
import { PostJobForm } from "./components/PostJobForm.js";
import { JobCard } from "./components/JobCard.js";
import { EventLog } from "./components/EventLog.js";
import { Hero } from "./components/Hero.js";
import { NavBar } from "./components/NavBar.js";
import { MetricsRow } from "./components/MetricsRow.js";
import { RecentActivity } from "./components/RecentActivity.js";
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
  // A first-time visitor lands on the overview; returning visitors go straight
  // to the board. `null` until localStorage has been read, so we never flash
  // the wrong view.
  const [view, setView] = useState<View | null>(null);
  const [composing, setComposing] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
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

  // Landing first for anyone who hasn't been through the intro.
  useEffect(() => {
    if (!onboarding.hydrated || view !== null) return;
    setView(onboarding.isNewVisitor ? "landing" : "board");
  }, [onboarding.hydrated, onboarding.isNewVisitor, view]);

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

  /**
   * Refresh the board on its own timer, not only when an event arrives.
   *
   * Chain state moves without always producing a log line: a createJob lands a
   * few seconds after its "submitted" event, and a job crosses its deadline
   * with no event at all. Refreshing only on events meant the board could sit
   * stale — showing a job as Open past its deadline, or not showing a newly
   * created job until something unrelated happened to log.
   */
  useEffect(() => {
    const id = setInterval(() => void refreshJobs(), 10_000);
    return () => clearInterval(id);
  }, [refreshJobs]);

  // Ticking clock for deadline countdowns.
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  /**
   * How many other live jobs watch the same subject.
   *
   * The delta is just "balance now minus baseline", so one delivery can satisfy
   * every open job on that subject whose baseline predates it. That is a real
   * property worth surfacing rather than a surprise to discover.
   */
  const openBySubject = new Map<string, number>();
  for (const j of jobs) {
    if (j.statusLabel !== "Open" && j.statusLabel !== "Claimed") continue;
    const k = j.subject.toLowerCase();
    openBySubject.set(k, (openBySubject.get(k) ?? 0) + 1);
  }

  const chrome = (
    <NavBar
      cfg={cfg}
      balances={balances}
      view={view ?? "board"}
      onNavigate={setView}
      connected={!err}
      onReplayOnboarding={() => {
        // Replay means "show me the intro again", so go back to where the
        // intro lives rather than just clearing the flag on the board.
        onboarding.replay();
        setView("landing");
        setShowIntro(true);
      }}
    />
  );

  // Nothing until we know which view to show — avoids a flash of the board
  // before the landing page for a first-time visitor.
  if (view === null) {
    return <div className="h-full" />;
  }

  if (view === "landing") {
    return (
      <div className="h-full overflow-y-auto">
        <AmbientBackground intensity="full" />
        {chrome}
        <Hero
          onEnter={() => {
            // New visitor: intro first, then the board (the dialog's own CTA
            // carries them through). Returning visitor: straight in.
            if (onboarding.isNewVisitor) setShowIntro(true);
            else setView("board");
          }}
        />
        <WelcomeDialog
          open={showIntro}
          onClose={() => {
            setShowIntro(false);
            onboarding.completeWelcome();
            setView("board");
          }}
          onStartTour={() => {
            setShowIntro(false);
            onboarding.completeWelcome();
            setView("board");
          }}
        />
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

      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        {/* Page header */}
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="display text-2xl leading-none font-semibold sm:text-[1.75rem]">
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
              agentWallet={cfg?.keeperHubWallet ?? ""}
              onPosted={() => void refreshJobs()}
              onClose={() => setComposing(false)}
            />
          </div>
        )}

        {/* Below xl the log collapses to the bottom of the page, past every
            job card. This keeps the latest activity reachable on a phone. */}
        <RecentActivity events={events} cfg={cfg} className="mt-10 xl:hidden" />

        {/* Asymmetric split: jobs carry more weight than the log. */}
        <div className="mt-10 grid items-start gap-6 sm:mt-14 sm:gap-8 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
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
              <Card className="flex flex-col items-center justify-center px-6 py-16 text-center sm:px-8 sm:py-20">
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
          <section className="hidden xl:sticky xl:top-24 xl:block">
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
