import { AlertTriangle, Check, ChevronRight } from "lucide-react";
import type { AppConfig, JobView } from "../../api.js";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

/**
 * Environment readiness.
 *
 * The failure this exists to prevent is the silent one: everything looks fine,
 * but automatic settlement is off, or the wallet is empty, so jobs sit forever
 * and nothing on screen says why. Each row states what is wrong AND the exact
 * fix — a checklist that only reports status just relocates the confusion.
 */

type Check = {
  label: string;
  ok: boolean;
  detail: string;
  /** Shown only when failing. */
  fix?: string;
  /** A failing row that isn't fatal — worth knowing, not worth alarming. */
  advisory?: boolean;
};

export function SetupChecklist({
  cfg,
  balances,
  jobs,
  backendUp,
  onDismiss,
}: {
  cfg: AppConfig | null;
  balances: { escrowUsdc: string; walletUsdc: string; stale: boolean } | null;
  jobs: JobView[];
  backendUp: boolean;
  onDismiss: () => void;
}) {
  const walletUsdc = Number(balances?.walletUsdc ?? 0);

  const checks: Check[] = [
    {
      label: "Backend connected",
      ok: backendUp,
      detail: backendUp
        ? "Resolver API reachable on :3001"
        : "Cannot reach the resolver API",
      fix: "Run `pnpm dev` from the repo root, or `pnpm backend` alone.",
    },
    {
      label: "Escrow contract configured",
      ok: Boolean(cfg?.escrowAddress),
      detail: cfg?.escrowAddress
        ? `${cfg.escrowAddress.slice(0, 10)}…${cfg.escrowAddress.slice(-6)} on Base`
        : "ESCROW_ADDRESS is not set",
      fix: "Set ESCROW_ADDRESS in .env to the deployed RecourseEscrow address.",
    },
    {
      label: "Automatic settlement running",
      ok: Boolean(cfg?.autoSettle),
      detail: cfg?.autoSettle
        ? `Resolver sweeps every ${Math.round((cfg.autoSettleMs ?? 0) / 1000)}s`
        : "Jobs will only settle when you click Settle",
      fix: "Unset RESOLVER_POLL_MS in .env (or set it above 0) and restart the backend.",
    },
    {
      label: "Execution wallet funded",
      ok: walletUsdc >= 0.2,
      advisory: true,
      detail:
        balances === null
          ? "Balance unavailable"
          : `${balances.walletUsdc} USDC available`,
      fix: "A full demo run needs roughly 0.15 USDC. Send Base USDC to the KeeperHub execution wallet.",
    },
  ];

  const failing = checks.filter((c) => !c.ok);
  const blocking = failing.filter((c) => !c.advisory);
  const allGood = failing.length === 0;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-7 sm:pt-7">
        <div>
          <h2 className="text-sm font-semibold">
            {allGood ? "Ready to go" : "Finish setting up"}
          </h2>
          <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
            {allGood
              ? "Everything checks out. Post a job, run an agent against it, and watch the resolver decide."
              : blocking.length > 0
                ? "A couple of things need attention before jobs will settle correctly."
                : "You can start now — one advisory below."}
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground shrink-0 text-xs transition-colors"
        >
          Dismiss
        </button>
      </div>

      <div className="px-5 py-5 sm:px-7 sm:py-6">
        <ul className="space-y-3.5">
          {checks.map((c) => (
            <li key={c.label} className="flex gap-3">
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                  c.ok
                    ? "bg-success-muted text-success"
                    : c.advisory
                      ? "bg-warning-muted text-warning"
                      : "bg-danger-muted text-danger",
                )}
              >
                {c.ok ? (
                  <Check className="size-3" />
                ) : (
                  <AlertTriangle className="size-3" />
                )}
              </span>

              <div className="min-w-0">
                <div className="text-sm font-medium">{c.label}</div>
                <div className="text-muted-foreground mt-0.5 text-xs">
                  {c.detail}
                </div>
                {!c.ok && c.fix && (
                  <div className="text-muted-foreground/80 mt-1.5 flex gap-1.5 text-xs">
                    <ChevronRight className="mt-0.5 size-3 shrink-0" />
                    <span className="font-mono">{c.fix}</span>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>

        {jobs.length === 0 && allGood && (
          <p className="text-muted-foreground mt-6 border-t border-white/[0.06] pt-5 text-xs leading-relaxed">
            <strong className="text-foreground">Suggested first run:</strong> post
            a job with a <strong>3 minute</strong> deadline, then use{" "}
            <strong>Failing agent</strong>. It delivers half of what was promised
            — the transfer still succeeds on-chain — and you&rsquo;ll watch the
            resolver refund you automatically when the deadline passes. That one
            run shows the whole point of the project.
          </p>
        )}
      </div>
    </Card>
  );
}
