import { ArrowUpRight, ShieldCheck } from "lucide-react";
import type { AppConfig } from "../api.js";
import { cn } from "@/lib/utils";

interface Props {
  cfg: AppConfig | null;
  balances: { escrowUsdc: string; walletUsdc: string; stale: boolean } | null;
  view: "board" | "landing";
  onNavigate: (view: "board" | "landing") => void;
  /** True while the event stream is being polled successfully. */
  connected: boolean;
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative flex size-8 items-center justify-center">
        {/* Mark: a shield for escrow, emerald for the verified state. */}
        <span className="from-primary/30 absolute inset-0 rounded-lg bg-gradient-to-br to-transparent ring-1 ring-white/10" />
        <ShieldCheck className="text-primary relative size-4" />
      </span>
      <div className="leading-none">
        <div className="text-[15px] font-semibold tracking-tight">Recourse</div>
        <div className="text-muted-foreground mt-0.5 text-[10px] tracking-wide">
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

export function NavBar({ cfg, balances, view, onNavigate, connected }: Props) {
  const tabs = [
    { id: "board" as const, label: "Dashboard" },
    { id: "landing" as const, label: "Overview" },
  ];

  return (
    <header className="glass-bar sticky top-0 z-50">
      <div className="flex items-center gap-4 px-5 py-3">
        <button
          onClick={() => onNavigate("board")}
          className="shrink-0 cursor-pointer"
          aria-label="Recourse home"
        >
          <Wordmark />
        </button>

        {/* Segmented nav — the SaaS convention, and it makes the two views
            feel like one product rather than a page with a link on it. */}
        <nav className="ml-2 hidden rounded-lg border border-white/8 bg-white/[0.03] p-0.5 sm:flex">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => onNavigate(t.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
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
