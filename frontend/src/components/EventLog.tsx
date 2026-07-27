import { useEffect, useRef } from "react";
import type { LogEvent, AppConfig } from "../api.js";

const LEVEL_STYLE: Record<LogEvent["level"], string> = {
  info: "text-slate-300",
  success: "text-emerald-400",
  warn: "text-amber-400",
  error: "text-rose-400",
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
    <div className="bg-[#131822] border border-[#232b3a] rounded-lg flex flex-col h-full min-h-0">
      <div className="px-4 py-3 border-b border-[#232b3a] flex items-center justify-between">
        <h2 className="font-semibold text-sm">Execution log</h2>
        <span className="text-xs text-slate-500">{events.length} events</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-1.5 min-h-0">
        {events.length === 0 && (
          <p className="text-slate-500 p-2">
            Nothing yet. Post a job, or run an agent against an open one.
          </p>
        )}

        {events.map((e) => (
          <div key={e.seq} className="leading-relaxed">
            <span className="text-slate-600">{e.ts.slice(11, 19)} </span>
            <span className={LEVEL_STYLE[e.level]}>{LEVEL_MARK[e.level]} </span>
            {e.jobId && <span className="text-sky-400">job#{e.jobId} </span>}
            {e.phase && <span className="text-slate-500">[{e.phase}] </span>}
            <span className={LEVEL_STYLE[e.level]}>{e.message}</span>
            {e.txHash && cfg && (
              <a
                href={`${cfg.explorer}/tx/${e.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="ml-2 text-slate-500 hover:text-sky-300 underline"
              >
                {e.txHash.slice(0, 10)}… ↗
              </a>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
