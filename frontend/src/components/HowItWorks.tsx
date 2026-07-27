import { useEffect, useState } from "react";
import { Check, Lock, RotateCcw, ScanSearch, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * Animated explainer for the whole product loop.
 *
 * It runs the honest scenario, then the failing one, and loops. Both scenarios
 * are identical through step 2 — including a genuinely confirmed transaction —
 * and diverge only at settlement. That divergence is the entire thesis, so the
 * animation is built to make it the thing you actually notice.
 */

type Mode = "honest" | "failing";

const STAGES = [
  { key: "post", label: "Post", icon: Lock },
  { key: "execute", label: "Execute", icon: Send },
  { key: "verify", label: "Verify", icon: ScanSearch },
  { key: "settle", label: "Settle", icon: Check },
] as const;

const REQUIRED = 0.1;
const PAYMENT = 0.05;

interface StageCopy {
  title: string;
  body: string;
  /** Observed on-chain delta at the end of this stage. */
  observed: number;
}

const SCRIPT: Record<Mode, StageCopy[]> = {
  honest: [
    {
      title: "Poster funds the job",
      body: `${PAYMENT} USDC locked in escrow against one promise: the subject's balance rises by at least ${REQUIRED} USDC before the deadline.`,
      observed: 0,
    },
    {
      title: "Agent executes via KeeperHub",
      body: `The agent transfers ${REQUIRED} USDC to the subject, then claims the job — recording the KeeperHub execution id on-chain.`,
      observed: REQUIRED,
    },
    {
      title: "Resolver reads chain state",
      body: `Not the receipt — the ledger. Observed +${REQUIRED.toFixed(2)} against required +${REQUIRED.toFixed(2)}.`,
      observed: REQUIRED,
    },
    {
      title: "Release",
      body: `The promise holds, so escrow pays the agent ${PAYMENT} USDC. Settlement is submitted through KeeperHub.`,
      observed: REQUIRED,
    },
  ],
  failing: [
    {
      title: "Poster funds the job",
      body: `Identical setup: ${PAYMENT} USDC locked, the subject's balance must rise by at least ${REQUIRED} USDC.`,
      observed: 0,
    },
    {
      title: "Agent executes via KeeperHub",
      body: `The agent transfers only ${(REQUIRED / 2).toFixed(2)} USDC — then claims anyway. The transaction confirms and does not revert.`,
      observed: REQUIRED / 2,
    },
    {
      title: "Resolver reads chain state",
      body: `KeeperHub reports success. The ledger disagrees: observed +${(REQUIRED / 2).toFixed(2)} against required +${REQUIRED.toFixed(2)}.`,
      observed: REQUIRED / 2,
    },
    {
      title: "Refund",
      body: `A successful transaction is not a kept promise. Escrow returns ${PAYMENT} USDC to the poster instead.`,
      observed: REQUIRED / 2,
    },
  ],
};

const STEP_MS = 2600;

export function HowItWorks({ className }: { className?: string }) {
  const [mode, setMode] = useState<Mode>("honest");
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setTimeout(() => {
      if (step < STAGES.length - 1) {
        setStep(step + 1);
      } else {
        // End of a run: swap scenario and start over.
        setMode(mode === "honest" ? "failing" : "honest");
        setStep(0);
      }
    }, STEP_MS);
    return () => clearTimeout(id);
  }, [step, mode, paused]);

  const copy = SCRIPT[mode][step];
  const settled = step === STAGES.length - 1;
  const failing = mode === "failing";
  const observedPct = Math.min(100, (copy.observed / REQUIRED) * 100);

  return (
    <div
      className={cn("w-full", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Which scenario is running. */}
      <div className="mb-5 flex items-center justify-center gap-2">
        {(["honest", "failing"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setStep(0);
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              mode === m
                ? m === "honest"
                  ? "border-success/40 bg-success-muted text-success"
                  : "border-danger/40 bg-danger-muted text-danger"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "honest" ? "Agent keeps the promise" : "Agent under-delivers"}
          </button>
        ))}
      </div>

      {/* Pipeline. */}
      <div className="flex items-center">
        {STAGES.map((stage, i) => {
          const Icon = stage.icon;
          const done = i < step;
          const active = i === step;
          // The final node reflects the outcome; earlier nodes are neutral.
          const isOutcome = i === STAGES.length - 1 && active;
          const OutcomeIcon = failing ? RotateCcw : Check;

          return (
            <div key={stage.key} className="flex flex-1 items-center last:flex-none">
              <button
                onClick={() => setStep(i)}
                className="flex flex-col items-center gap-2"
                aria-label={stage.label}
              >
                <span
                  className={cn(
                    "flex size-11 items-center justify-center rounded-full border transition-all duration-500",
                    done && "border-success/40 bg-success-muted text-success",
                    active &&
                      !isOutcome &&
                      "border-primary bg-primary/15 text-primary scale-110 shadow-[0_0_0_4px] shadow-primary/10",
                    isOutcome &&
                      (failing
                        ? "border-danger bg-danger-muted text-danger scale-110 shadow-[0_0_0_4px] shadow-danger/10"
                        : "border-success bg-success-muted text-success scale-110 shadow-[0_0_0_4px] shadow-success/10"),
                    !done && !active && "border-border text-muted-foreground/50",
                  )}
                >
                  {isOutcome ? (
                    <OutcomeIcon className="size-5" />
                  ) : done ? (
                    <Check className="size-5" />
                  ) : (
                    <Icon className="size-5" />
                  )}
                </span>
                <span
                  className={cn(
                    "text-xs transition-colors",
                    active ? "text-foreground font-medium" : "text-muted-foreground",
                  )}
                >
                  {stage.label}
                </span>
              </button>

              {/* Connector */}
              {i < STAGES.length - 1 && (
                <div className="bg-border mx-2 h-px flex-1 self-start mt-[22px] overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all ease-linear",
                      failing && i >= 1 ? "bg-danger/60" : "bg-success/60",
                    )}
                    style={{
                      width: i < step ? "100%" : "0%",
                      transitionDuration: `${STEP_MS}ms`,
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Detail for the current stage. */}
      <div className="glass mt-6 rounded-xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-foreground text-sm font-semibold">{copy.title}</h3>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              {copy.body}
            </p>
          </div>

          {/* From step 1 onward both runs have a confirmed transaction. */}
          {step >= 1 && (
            <Badge tone="success" className="shrink-0">
              <Check className="size-3" />
              tx confirmed
            </Badge>
          )}
        </div>

        {/* Chain state — the only thing that decides the outcome. */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">
              subject balance delta
            </span>
            <span
              className={cn(
                "font-mono transition-colors",
                copy.observed >= REQUIRED ? "text-success" : "text-warning",
              )}
            >
              +{copy.observed.toFixed(2)} / +{REQUIRED.toFixed(2)} USDC
            </span>
          </div>
          <div className="bg-background border-border h-1.5 overflow-hidden rounded border">
            <div
              className={cn(
                "h-full transition-all duration-700",
                copy.observed >= REQUIRED ? "bg-success" : "bg-warning",
              )}
              style={{ width: `${observedPct}%` }}
            />
          </div>
        </div>

        {/* Outcome line. */}
        <div
          className={cn(
            "mt-4 flex items-center gap-2 text-xs transition-opacity duration-500",
            settled ? "opacity-100" : "opacity-0",
          )}
        >
          {failing ? (
            <>
              <X className="text-danger size-4 shrink-0" />
              <span className="text-danger font-medium">Refunded to poster</span>
              <span className="text-muted-foreground">
                — the transaction succeeded; the promise did not.
              </span>
            </>
          ) : (
            <>
              <Check className="text-success size-4 shrink-0" />
              <span className="text-success font-medium">Released to agent</span>
              <span className="text-muted-foreground">
                — chain state matched the promise.
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
