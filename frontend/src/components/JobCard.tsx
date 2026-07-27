import { ArrowUpRight, Check, Clock, Target, User, X } from "lucide-react";
import { api, type JobView, type AppConfig } from "../api.js";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge, STATUS_TONE, DECISION_TONE } from "@/components/ui/badge";
import { Button } from "@/components/ui/liquid-glass-button";

interface Props {
  job: JobView;
  cfg: AppConfig | null;
  nowSec: number;
  onAction: () => void;
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

/** One labelled fact. Keeps the meta row on a consistent rhythm. */
function Fact({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof User;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-muted-foreground/70 flex items-center gap-1 text-[10px] tracking-wide uppercase">
        <Icon className="size-3" />
        {label}
      </div>
      <div className={cn("mt-1 truncate text-xs", mono && "font-mono")}>{value}</div>
    </div>
  );
}

export function JobCard({ job, cfg, nowSec, onAction }: Props) {
  const deadline = Number(job.deadline);
  const settled = job.statusLabel === "Released" || job.statusLabel === "Refunded";
  const isOpen = job.statusLabel === "Open";
  const canSettle = !settled && job.pendingDecision.action !== "wait";

  const observed = Number(job.observedIncrease);
  const required = Number(job.minIncrease);
  const pct = Math.min(100, (observed / Math.max(required, 1e-9)) * 100);

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
    } finally {
      onAction();
    }
  }

  return (
    <Card
      className={cn(
        "group relative overflow-hidden transition-colors",
        // Settled jobs recede; live ones hold attention.
        settled && "opacity-[0.72] hover:opacity-100",
      )}
    >
      {/* Status spine — reads the job's state before any text is parsed. */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-px",
          job.statusLabel === "Released" && "bg-success/60",
          job.statusLabel === "Refunded" && "bg-danger/60",
          job.statusLabel === "Claimed" && "bg-warning/60",
          job.statusLabel === "Open" && "bg-info/60",
        )}
      />

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="rounded-md bg-white/[0.06] px-2 py-1 font-mono text-xs ring-1 ring-white/10">
              #{job.jobId}
            </span>
            <Badge tone={STATUS_TONE[job.statusLabel] ?? "neutral"}>
              {job.statusLabel}
            </Badge>
          </div>

          <div
            className={cn(
              "flex items-center gap-1 text-xs",
              job.deadlinePassed ? "text-danger" : "text-muted-foreground",
            )}
          >
            <Clock className="size-3" />
            {countdown(deadline, nowSec)}
          </div>
        </div>

        {/* The predicate — the reason this card exists, so it gets the space. */}
        <div className="mt-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="label-xs">Balance delta</div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span
                  className={cn(
                    "display tnum text-2xl font-semibold",
                    job.deltaMet ? "text-success" : "text-warning",
                  )}
                >
                  +{job.observedIncrease}
                </span>
                <span className="text-muted-foreground tnum text-xs">
                  / +{job.minIncrease} USDC required
                </span>
              </div>
            </div>

            <div className="text-right">
              <div className="label-xs">Pays</div>
              <div className="tnum mt-1.5 text-sm font-medium">
                {job.paymentAmount} <span className="text-muted-foreground">USDC</span>
              </div>
            </div>
          </div>

          <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700",
                job.deltaMet ? "bg-success" : "bg-warning",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-4 border-t border-white/[0.06] pt-4">
          <Fact icon={Target} label="subject" value={short(job.subject)} mono />
          <Fact icon={User} label="agent" value={short(job.agent)} mono />
          <Fact
            icon={Check}
            label="execution"
            value={job.executionRef || "—"}
            mono
          />
        </div>

        {/* What the resolver would do right now, before anything is submitted. */}
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/[0.06]">
          <Badge tone={DECISION_TONE[job.pendingDecision.action] ?? "neutral"}>
            {job.pendingDecision.action === "release" && <Check className="size-3" />}
            {job.pendingDecision.action === "refund" && <X className="size-3" />}
            {job.pendingDecision.action.toUpperCase()}
          </Badge>
          <p className="text-muted-foreground pt-0.5 text-xs leading-relaxed">
            {job.pendingDecision.reason}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!isOpen}
            onClick={() => run(() => api.work(job.jobId, "honest"))}
            className="border-success/30 text-success hover:bg-success-muted hover:text-success"
          >
            Honest agent
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!isOpen}
            onClick={() => run(() => api.work(job.jobId, "fail"))}
            className="border-danger/30 text-danger hover:bg-danger-muted hover:text-danger"
            title="Delivers half the required amount — the transfer still succeeds on-chain"
          >
            Failing agent
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => run(() => api.resolve(job.jobId, true))}
          >
            Dry run
          </Button>

          <div className="flex-1" />

          {cfg && (
            <a
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
              href={`${cfg.explorer}/address/${cfg.escrowAddress}`}
              target="_blank"
              rel="noreferrer"
            >
              Basescan
              <ArrowUpRight className="size-3" />
            </a>
          )}

          <Button
            size="sm"
            disabled={!canSettle}
            onClick={() => run(() => api.resolve(job.jobId, false))}
          >
            Settle
          </Button>
        </div>
      </div>
    </Card>
  );
}
