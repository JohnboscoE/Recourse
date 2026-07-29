import { ArrowUpRight, HelpCircle, ShieldCheck } from "lucide-react";
import type { AppConfig } from "../api.js";
import { cn } from "@/lib/utils";

interface Props {
  cfg: AppConfig | null;
  balances: { escrowUsdc: string; walletUsdc: string; stale: boolean } | null;
  view: "board" | "landing";
  onNavigate: (view: "board" | "landing") => void;
  /** True while the event stream is being polled successfully. */
  connected: boolean;
  /** Re-show the first-run explainer and setup checklist. */
  onReplayOnboarding?: () => void;
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative flex size-8 items-center justify-center">
        {/* Mark: a shield for escrow, emerald for the verified state. */}
        <span className="from-primary/25 absolute inset-0 rounded-[0.6rem] bg-gradient-to-br to-transparent" />
        <ShieldCheck className="text-primary relative size-4" />
      </span>
      <div className="leading-none">
        <div className="text-[15px] font-semibold tracking-tight">Recourse</div>
        <div className="text-muted-foreground mt-0.5 hidden text-[10px] tracking-wide sm:block">
          verified settlement
        </div>
      </div>
    </div>
  );
}

/** Compact metric, so balances read as telemetry rather than body copy. */
function Stat({
  label,
  value,
  flag,
}: {
  label: string;
  value: string;
  flag?: string;
}) {
  return (
    <div className="px-3 text-right">
      <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
        {label}
        {flag && <span className="text-warning ml-1 normal-case">{flag}</span>}
      </div>
      <div className="mt-0.5 font-mono text-xs">{value}</div>
    </div>
  );
}

export function NavBar({
  cfg,
  balances,
  view,
  onNavigate,
  connected,
  onReplayOnboarding,
}: Props) {
  const tabs = [
    { id: "board" as const, label: "Dashboard" },
    { id: "landing" as const, label: "Overview" },
  ];

  return (
    <header className="glass-bar sticky top-0 z-50">
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:gap-5 sm:px-6 sm:py-4 lg:px-8">
        <button
          onClick={() => onNavigate("board")}
          className="shrink-0 cursor-pointer"
          aria-label="Recourse home"
        >
          <Wordmark />
        </button>

        {/* Segmented nav — the SaaS convention, and it makes the two views
            feel like one product rather than a page with a link on it. */}
        <nav className="flex shrink-0 rounded-lg border border-white/8 bg-white/[0.03] p-0.5 sm:ml-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => onNavigate(t.id)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors sm:px-3 sm:text-xs",
                view === t.id
                  ? "bg-white/8 text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex-1" />

        <div className="flex items-center">
          {/* Live indicator: quiet when healthy, obvious when not. */}
          <div className="hidden items-center gap-1.5 px-3 md:flex">
            <span className="relative flex size-1.5">
              {connected && (
                <span className="bg-success absolute inline-flex size-full animate-ping rounded-full opacity-60" />
              )}
              <span
                className={cn(
                  "relative inline-flex size-1.5 rounded-full",
                  connected ? "bg-success" : "bg-danger",
                )}
              />
            </span>
            <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
              {connected ? "live" : "offline"}
            </span>
          </div>

          {/*
            Whether settlement is automatic is the single most important thing
            to know about a running instance — if it's off, expired jobs sit
            unrefunded and nothing on screen would otherwise say so.
          */}
          {cfg && (
            <div
              className="hidden items-center gap-1.5 px-3 md:flex"
              title={
                cfg.autoSettle
                  ? `Resolver sweeps every ${Math.round(cfg.autoSettleMs / 1000)}s`
                  : "Automatic settlement is off — jobs only settle when you click Settle"
              }
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  cfg.autoSettle ? "bg-success" : "bg-warning",
                )}
              />
              <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                {cfg.autoSettle ? "auto-settle" : "manual"}
              </span>
            </div>
          )}

          {balances && (
            <div className="hidden items-center divide-x divide-white/8 lg:flex">
              <Stat label="escrow" value={`${balances.escrowUsdc} USDC`} />
              <Stat
                label="wallet"
                value={`${balances.walletUsdc} USDC`}
                flag={balances.stale ? "stale" : undefined}
              />
            </div>
          )}

          {/* An agent spending on its own is the single most important thing
              to know about a running instance. */}
          {cfg?.autoAgent && (
            <div
              className="hidden items-center gap-1.5 px-3 md:flex"
              title={`An autonomous ${cfg.autoAgent} agent is picking up open jobs`}
            >
              <span className="bg-warning size-1.5 animate-pulse rounded-full" />
              <span className="text-warning text-[10px] tracking-wide uppercase">
                auto-agent
              </span>
            </div>
          )}

          {onReplayOnboarding && (
            <button
              onClick={onReplayOnboarding}
              title="Replay the introduction and setup checklist"
              aria-label="Help"
              className={cn(
                "text-muted-foreground hover:text-foreground ml-2 rounded-lg p-2",
                "transition-colors hover:bg-white/[0.06]",
              )}
            >
              <HelpCircle className="size-4" />
            </button>
          )}

          {cfg && (
            <a
              href={`${cfg.explorer}/address/${cfg.escrowAddress}`}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "ml-3 inline-flex items-center gap-1.5 rounded-lg border border-white/8",
                "bg-white/[0.03] px-2.5 py-1.5 font-mono text-[11px] transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-white/[0.06]",
              )}
            >
              <span className="bg-info size-1.5 rounded-full" />
              {cfg.escrowAddress.slice(0, 6)}…{cfg.escrowAddress.slice(-4)}
              <ArrowUpRight className="size-3" />
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
