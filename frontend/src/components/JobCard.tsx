import { ArrowUpRight, Check, X } from "lucide-react";
import { api, type JobView, type AppConfig } from "../api.js";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
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
  if (left <= 0) return `expired ${Math.floor(-left / 60)}m ago`;
  if (left < 60) return `${left}s left`;
  return `${Math.floor(left / 60)}m ${left % 60}s left`;
}

export function JobCard({ job, cfg, nowSec, onAction }: Props) {
  const deadline = Number(job.deadline);
  const settled = job.statusLabel === "Released" || job.statusLabel === "Refunded";
  const isOpen = job.statusLabel === "Open";
  const pct = Math.min(
    100,
    (Number(job.observedIncrease) / Math.max(Number(job.minIncrease), 1e-9)) * 100,
  );

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
    } finally {
      onAction();
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Job #{job.jobId}</span>
            <Badge tone={STATUS_TONE[job.statusLabel] ?? "neutral"}>
              {job.statusLabel}
            </Badge>
          </div>
          <span
            className={cn(
              "text-xs",
              job.deadlinePassed ? "text-danger" : "text-muted-foreground",
            )}
          >
            {countdown(deadline, nowSec)}
          </span>
        </div>

        {/* The predicate, made legible: observed vs required. */}
        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">
              subject{" "}
              <span className="text-foreground/80 font-mono">
                {short(job.subject)}
              </span>{" "}
              balance
            </span>
            <span
              className={cn(
                "font-mono",
                job.deltaMet ? "text-success" : "text-warning",
              )}
            >
              +{job.observedIncrease} / +{job.minIncrease} USDC
            </span>
          </div>
          <div className="bg-background border-border h-1.5 overflow-hidden rounded border">
            <div
              className={cn(
                "h-full transition-all duration-500",
                job.deltaMet ? "bg-success" : "bg-warning",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <span>
            pays <span className="text-foreground/80">{job.paymentAmount} USDC</span>
          </span>
          <span>
            agent{" "}
            <span className="text-foreground/80 font-mono">{short(job.agent)}</span>
          </span>
        </div>

        {job.executionRef && (
          <div className="text-muted-foreground text-xs">
            agent execution{" "}
            <span className="text-foreground/80 font-mono">{job.executionRef}</span>
          </div>
        )}

        {/* What the resolver would do right now, before anything is submitted. */}
        <div className="border-border bg-background rounded border px-3 py-2 text-xs">
          <span className="text-muted-foreground">resolver would </span>
          <Badge tone={DECISION_TONE[job.pendingDecision.action] ?? "neutral"}>
            {job.pendingDecision.action === "release" && <Check className="size-3" />}
            {job.pendingDecision.action === "refund" && <X className="size-3" />}
            {job.pendingDecision.action.toUpperCase()}
          </Badge>
          <span className="text-muted-foreground"> {job.pendingDecision.reason}</span>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            disabled={!isOpen}
            onClick={() => run(() => api.work(job.jobId, "honest"))}
            className="border-success/40 text-success hover:bg-success-muted hover:text-success"
          >
            Run honest agent
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!isOpen}
            onClick={() => run(() => api.work(job.jobId, "fail"))}
            className="border-danger/40 text-danger hover:bg-danger-muted hover:text-danger"
            title="Delivers half the required amount — the transfer still succeeds on-chain"
          >
            Run failing agent
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => run(() => api.resolve(job.jobId, true))}
          >
            Dry-run resolve
          </Button>
          <Button
            size="sm"
            disabled={settled || job.pendingDecision.action === "wait"}
            onClick={() => run(() => api.resolve(job.jobId, false))}
          >
            Settle
          </Button>
        </div>

        {cfg && (
          <a
            className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-xs transition-colors"
            href={`${cfg.explorer}/address/${cfg.escrowAddress}`}
            target="_blank"
            rel="noreferrer"
          >
            view escrow on Basescan
            <ArrowUpRight className="size-3" />
          </a>
        )}
      </CardContent>
    </Card>
  );
}
