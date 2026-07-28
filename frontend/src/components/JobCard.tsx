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
        "transition-opacity duration-300",
        settled && "opacity-70 hover:opacity-100",
      )}
    >
      <div className="p-7">
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
              Balance delta
              <InfoTip term="Balance delta">{GLOSSARY.delta}</InfoTip>
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span
                className={cn(
                  "display tnum text-[2.25rem] leading-none font-semibold",
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
        <div className="mt-7 grid grid-cols-3 gap-6">
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

        {/* Actions. Neutral by default; only the primary one carries weight. */}
        <div className="mt-7 flex flex-wrap items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={!isOpen}
            onClick={() => run(() => api.work(job.jobId, "honest"))}
          >
            Honest agent
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!isOpen}
            onClick={() => run(() => api.work(job.jobId, "fail"))}
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
              className="text-muted-foreground hover:text-foreground mr-2 inline-flex items-center gap-1 text-xs transition-colors"
              href={`${cfg.explorer}/address/${cfg.escrowAddress}`}
              target="_blank"
              rel="noreferrer"
            >
              Basescan
              <ArrowUpRight className="size-3" />
            </a>
          )}

          <Button size="sm" disabled={!canSettle} onClick={() => run(() => api.resolve(job.jobId, false))}>
            Settle
          </Button>
        </div>
      </div>
    </Card>
  );
}
