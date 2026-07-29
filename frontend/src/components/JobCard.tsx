import { useState } from "react";
import { ArrowUpRight, Clock } from "lucide-react";
import { api, type JobView, type AppConfig } from "../api.js";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge, STATUS_TONE } from "@/components/ui/badge";
import { Button } from "@/components/ui/liquid-glass-button";
import { InfoTip, GLOSSARY } from "@/components/ui/info-tip";

interface Props {
  job: JobView;
  cfg: AppConfig | null;
  nowSec: number;
  onAction: () => void;
  /** Live jobs sharing this subject, including this one. */
  siblings?: number;
}

function short(addr: string) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "—";
}

function countdown(deadline: number, nowSec: number) {
  const left = deadline - nowSec;
  if (left <= 0) {
    const m = Math.floor(-left / 60);
    return m < 60 ? `expired ${m}m ago` : `expired ${Math.floor(m / 60)}h ago`;
  }
  if (left < 60) return `${left}s left`;
  const m = Math.floor(left / 60);
  return m < 60 ? `${m}m ${left % 60}s left` : `${Math.floor(m / 60)}h ${m % 60}m left`;
}

/**
 * One labelled fact. No box, no divider — the label/value pair and the space
 * around it are enough structure. Boxing these was pure noise.
 */
function Fact({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="label-xs flex items-center">
        {label}
        {hint && <InfoTip term={label}>{hint}</InfoTip>}
      </div>
      <div className="mt-2 truncate font-mono text-[13px]">{value}</div>
    </div>
  );
}

const DECISION_DOT: Record<string, string> = {
  release: "bg-success",
  refund: "bg-danger",
  wait: "bg-muted-foreground/50",
};

export function JobCard({ job, cfg, nowSec, onAction, siblings = 1 }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const deadline = Number(job.deadline);
  const settled = job.statusLabel === "Released" || job.statusLabel === "Refunded";
  const isOpen = job.statusLabel === "Open";
  const canSettle = !settled && job.pendingDecision.action !== "wait";

  const observed = Number(job.observedIncrease);
  const required = Number(job.minIncrease);
  const pct = Math.min(100, (observed / Math.max(required, 1e-9)) * 100);

  /**
   * try/finally with no catch meant a failed request surfaced as an unhandled
   * rejection: the button looked like it did nothing at all. Errors now show on
   * the card, and the control is disabled while in flight so a slow request
   * cannot be fired twice.
   */
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      onAction();
    }
  }

  return (
    <Card
      className={cn(
        "transition-opacity duration-300",
        settled && "opacity-70 hover:opacity-100",
      )}
    >
      <div className="p-5 sm:p-7">
        {/* Identity */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <span className="text-muted-foreground font-mono text-sm">
              #{job.jobId}
            </span>
            <Badge tone={STATUS_TONE[job.statusLabel] ?? "neutral"}>
              {job.statusLabel}
            </Badge>
          </div>

          <div
            className={cn(
              "flex items-center gap-1.5 text-xs",
              job.deadlinePassed ? "text-danger/90" : "text-muted-foreground",
            )}
          >
            <Clock className="size-3.5" />
            {countdown(deadline, nowSec)}
          </div>
        </div>

        {/* The predicate. This is why the card exists, so it gets the scale. */}
        <div className="mt-7 flex items-end justify-between gap-6">
          <div>
            <div className="label-xs flex items-center">
              {settled ? "Balance delta (now)" : "Balance delta"}
              <InfoTip term="Balance delta">{GLOSSARY.delta}</InfoTip>
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span
                className={cn(
                  "display tnum text-3xl leading-none font-semibold sm:text-[2.25rem]",
                  job.deltaMet ? "text-success" : "text-warning",
                )}
              >
                +{job.observedIncrease}
              </span>
              <span className="text-muted-foreground tnum text-sm">
                / +{job.minIncrease}
              </span>
            </div>
          </div>

          <div className="text-right">
            <div className="label-xs">Payment</div>
            <div className="tnum mt-2.5 text-lg leading-none font-medium">
              {job.paymentAmount}
              <span className="text-muted-foreground ml-1 text-xs">USDC</span>
            </div>
          </div>
        </div>

        {!settled && siblings > 1 && (
          <p className="text-info mt-3 text-xs leading-relaxed">
            {siblings - 1} other live job{siblings > 2 ? "s" : ""} watch
            {siblings === 2 ? "es" : ""} this same subject. The delta is just the
            balance minus each job&rsquo;s baseline, so one delivery can satisfy
            several at once — but only those whose deadline hasn&rsquo;t passed.
          </p>
        )}

        {/*
          A settled job keeps showing a LIVE delta, so funds arriving after the
          deadline make a correct refund look wrong — "it says 0.05 / 0.05 but
          it refunded". Settlement used the balance at the deadline; say so.
        */}
        {settled && job.deltaMet && job.statusLabel === "Refunded" && (
          <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
            This delta is <em>current</em>. At the deadline it was short, so the
            job refunded — the balance rose afterwards. Settlement reads chain
            state at the deadline, and a settled job is final.
          </p>
        )}

        <div className="well mt-5 h-1.5 overflow-hidden rounded-full">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700",
              job.deltaMet ? "bg-success" : "bg-warning",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Facts. Spacing carries the structure; no dividers, no boxes. */}
        <div className="mt-7 grid grid-cols-2 gap-5 sm:grid-cols-3 sm:gap-6">
          <Fact label="Subject" value={short(job.subject)} hint={GLOSSARY.subject} />
          <Fact label="Agent" value={short(job.agent)} />
          <Fact
            label="Execution"
            value={job.executionRef || "—"}
            hint={GLOSSARY.execution}
          />
        </div>

        {/* Resolver's current verdict — a dot and a sentence, not a panel. */}
        <div className="mt-7 flex items-center gap-2.5 text-xs">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              DECISION_DOT[job.pendingDecision.action] ?? "bg-muted-foreground/50",
            )}
          />
          <span className="text-foreground/90 font-medium">
            {job.pendingDecision.action === "wait"
              ? "Waiting"
              : job.pendingDecision.action === "release"
                ? "Would release"
                : "Would refund"}
          </span>
          <span className="text-muted-foreground truncate">
            {job.pendingDecision.reason}
          </span>
        </div>

        {/*
          A disabled control with no explanation is why "the button did nothing"
          is such a common report — the job had already been claimed or settled,
          and nothing on screen said so.
        */}
        {!isOpen && (
          <p className="text-muted-foreground mt-6 text-xs">
            {settled
              ? `This job is ${job.statusLabel.toLowerCase()} — agents can only run on Open jobs.`
              : "Already claimed by an agent — waiting on settlement."}
          </p>
        )}

        {/* Actions. Neutral by default; only the primary one carries weight. */}
        <div className="mt-7 flex flex-wrap items-center gap-x-1 gap-y-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={!isOpen || busy}
            onClick={() => run(() => api.work(job.jobId, "honest"))}
          >
            Honest agent
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!isOpen || busy}
            onClick={() => run(() => api.work(job.jobId, "fail"))}
            title="Delivers half the required amount — the transfer still succeeds on-chain"
          >
            Failing agent
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => run(() => api.resolve(job.jobId, true))}
          >
            Dry run
          </Button>

          <div className="flex-1" />

          {cfg && (
            <a
              className="text-muted-foreground hover:text-foreground mr-2 inline-flex items-center gap-1 text-xs transition-colors"
              href={`${cfg.explorer}/address/${cfg.escrowAddress}`}
              target="_blank"
              rel="noreferrer"
            >
              Basescan
              <ArrowUpRight className="size-3" />
            </a>
          )}

          <Button size="sm" disabled={!canSettle || busy} onClick={() => run(() => api.resolve(job.jobId, false))}>
            Settle
          </Button>
        </div>

        {err && (
          <p className="text-danger mt-4 font-mono text-xs break-words">{err}</p>
        )}
      </div>
    </Card>
  );
}
