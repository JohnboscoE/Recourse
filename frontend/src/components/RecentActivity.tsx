import { useState } from "react";
import { ArrowUpRight, History } from "lucide-react";
import type { LogEvent, AppConfig } from "../api.js";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";

/**
 * Compact activity strip for narrow screens.
 *
 * On desktop the execution log sits in its own sticky column. Below xl the
 * layout collapses to one column and the log lands underneath every job card —
 * so on a phone the most live part of the app is the least reachable. This puts
 * the last few events directly above the jobs, with the full history one tap
 * away in a sheet.
 *
 * Desktop hides it entirely; the sticky column already does this job there.
 */

const LEVEL_DOT: Record<LogEvent["level"], string> = {
  info: "bg-muted-foreground/50",
  success: "bg-success",
  warn: "bg-warning",
  error: "bg-danger",
};

const LEVEL_TEXT: Record<LogEvent["level"], string> = {
  info: "text-foreground/70",
  success: "text-success",
  warn: "text-warning",
  error: "text-danger",
};

function Line({ e, cfg }: { e: LogEvent; cfg: AppConfig | null }) {
  return (
    <div className="flex items-start gap-2.5 text-xs leading-relaxed">
      <span
        className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", LEVEL_DOT[e.level])}
      />
      <div className="min-w-0 flex-1">
        <span className="text-muted-foreground/60 font-mono text-[10px]">
          {e.ts.slice(11, 19)}
        </span>{" "}
        {e.jobId && (
          <span className="bg-info-muted text-info mr-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium">
            #{e.jobId}
          </span>
        )}
        <span className={cn("break-words", LEVEL_TEXT[e.level])}>{e.message}</span>
        {e.txHash && cfg && (
          <a
            href={`${cfg.explorer}/tx/${e.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-primary ml-1.5 inline-flex items-center gap-0.5 font-mono transition-colors"
          >
            {e.txHash.slice(0, 8)}…
            <ArrowUpRight className="size-3" />
          </a>
        )}
      </div>
    </div>
  );
}

export function RecentActivity({
  events,
  cfg,
  className,
}: {
  events: LogEvent[];
  cfg: AppConfig | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // Newest first here — on a small strip the latest line should be at the top,
  // the opposite of the desktop log which reads as a scrolling tail.
  const latest = [...events].reverse();

  return (
    <>
      <Card className={cn("overflow-hidden", className)}>
        <div className="flex items-center justify-between gap-3 px-5 pt-5">
          <div className="flex items-center gap-2">
            <History className="text-muted-foreground size-3.5" />
            <h2 className="text-sm font-semibold">Recent activity</h2>
          </div>
          <button
            onClick={() => setOpen(true)}
            disabled={events.length === 0}
            className="text-primary text-xs font-medium disabled:opacity-40"
          >
            History{events.length > 0 && ` (${events.length})`}
          </button>
        </div>

        <div className="space-y-2.5 px-5 pt-4 pb-5">
          {latest.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              Nothing yet. Post a job, or run an agent against an open one.
            </p>
          ) : (
            latest.slice(0, 3).map((e) => <Line key={e.seq} e={e} cfg={cfg} />)
          )}
        </div>
      </Card>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Execution log"
        description={`${events.length} events — every action this app has taken, newest first.`}
        size="lg"
      >
        <div className="space-y-3">
          {latest.map((e) => (
            <Line key={e.seq} e={e} cfg={cfg} />
          ))}
        </div>
      </Dialog>
    </>
  );
}
