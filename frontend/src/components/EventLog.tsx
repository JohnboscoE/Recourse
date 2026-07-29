import { useEffect, useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import type { LogEvent, AppConfig } from "../api.js";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

const LEVEL_STYLE: Record<LogEvent["level"], string> = {
  info: "text-foreground/70",
  success: "text-success",
  warn: "text-warning",
  error: "text-danger",
};

const LEVEL_MARK: Record<LogEvent["level"], string> = {
  info: "·",
  success: "✓",
  warn: "!",
  error: "✕",
};

export function EventLog({ events, cfg }: { events: LogEvent[]; cfg: AppConfig | null }) {
  const endRef = useRef<HTMLDivElement>(null);

  // Follow the tail as new events land.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [events.length]);

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="h-[60vh] min-h-[20rem] space-y-2 overflow-y-auto p-4 font-mono text-xs break-words sm:h-[calc(100vh-19rem)] sm:min-h-[26rem] sm:p-6">
        {events.length === 0 && (
          <p className="text-muted-foreground p-2">
            Nothing yet. Post a job, or run an agent against an open one.
          </p>
        )}

        {events.map((e) => (
          <div key={e.seq} className="leading-relaxed break-words">
            <span className="text-muted-foreground/50">{e.ts.slice(11, 19)} </span>
            <span className={LEVEL_STYLE[e.level]}>{LEVEL_MARK[e.level]} </span>
            {e.jobId && (
              <span className="bg-info-muted text-info mr-1 rounded px-1.5 py-0.5 text-[10px] font-medium">
                #{e.jobId}
              </span>
            )}
            {e.phase && <span className="text-muted-foreground/70">[{e.phase}] </span>}
            <span className={LEVEL_STYLE[e.level]}>{e.message}</span>
            {e.txHash && cfg && (
              <a
                href={`${cfg.explorer}/tx/${e.txHash}`}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "text-muted-foreground hover:text-primary ml-2",
                  "inline-flex items-center gap-0.5 transition-colors",
                )}
              >
                {e.txHash.slice(0, 10)}…
                <ArrowUpRight className="size-3" />
              </a>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </Card>
  );
}
