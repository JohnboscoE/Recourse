import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, ScanLine, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/liquid-glass-button";
import { cn } from "@/lib/utils";

/**
 * First-run explainer.
 *
 * Three screens, in the order a newcomer actually needs them: the failure they
 * probably don't know exists, why nothing today catches it, then what this app
 * does about it. Deliberately no jargon — "predicate", "baseline" and "delta"
 * are taught in place on the board via InfoTip, not front-loaded here.
 */

const STEPS = [
  {
    key: "problem",
    eyebrow: "The problem",
    title: "A transaction can succeed and still do the wrong thing",
    body: (
      <>
        <p>
          You pay an agent to send <strong>100 USDC</strong> to a supplier. It
          sends <strong>10</strong>.
        </p>
        <p className="mt-3">
          The transaction confirms. Real gas is burned. The receipt says{" "}
          <code className="text-foreground/80 font-mono text-[11px]">
            success: true
          </code>
          . Every payment system in existence looks at that and pays the agent.
        </p>
        <p className="mt-3">
          Nothing malfunctioned. A transaction &ldquo;succeeding&rdquo; only
          means it <em>didn&rsquo;t revert</em> — never that it did the right
          thing.
        </p>
      </>
    ),
  },
  {
    key: "gap",
    eyebrow: "Why it matters now",
    title: "Agents spend the money, and nothing checks the result",
    body: (
      <>
        <p>
          Payment rails for agents shipped — x402 and MPP are live and moving
          real volume. They answer <em>how does an agent pay?</em> very well.
        </p>
        <p className="mt-3">
          Neither answers <em>did the work actually happen?</em>
        </p>
        <p className="mt-3">
          While building this, we paid <strong>$0.01 twice</strong> to listed
          services on a live marketplace. Both payments settled. Both returned{" "}
          <code className="text-foreground/80 font-mono text-[11px]">200 OK</code>
          . Neither returned a usable result — and there was no refund, because
          nothing checked.
        </p>
      </>
    ),
  },
  {
    key: "solution",
    eyebrow: "What Recourse does",
    title: "Pay on proof, not on receipts",
    body: (
      <>
        <p>
          A job is a promise a machine can check:{" "}
          <em>this address&rsquo;s USDC balance must rise by at least N before
          a deadline.</em>
        </p>
        <ol className="mt-4 space-y-2.5">
          {[
            "The payment is locked in escrow, and the balance is recorded.",
            "An agent does the work and claims the job.",
            "The resolver reads the balance from the chain — not the receipt.",
            "Promise kept → the agent is paid. Deadline passes → you're refunded.",
          ].map((t, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="bg-primary/15 text-primary mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">
                {i + 1}
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4">
          Both outcomes are automatic. No arbitrator, no dispute queue.
        </p>
      </>
    ),
  },
] as const;

export function WelcomeDialog({
  open,
  onClose,
  onStartTour,
}: {
  open: boolean;
  onClose: () => void;
  onStartTour: () => void;
}) {
  const [step, setStep] = useState(0);
  const current = STEPS[step]!;
  const last = step === STEPS.length - 1;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={current.title}
      description={undefined}
    >
      <div className="-mt-2">
        <div className="text-primary label-xs mb-4">{current.eyebrow}</div>

        <div className="text-muted-foreground text-sm leading-relaxed">
          {current.body}
        </div>

        <div className="mt-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            {STEPS.map((s, i) => (
              <button
                key={s.key}
                onClick={() => setStep(i)}
                aria-label={`Step ${i + 1}`}
                className={cn(
                  "h-1 rounded-full transition-all",
                  i === step ? "bg-primary w-6" : "w-1.5 bg-white/15",
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
            )}

            {last ? (
              <Button size="sm" onClick={onStartTour}>
                <ScanLine className="size-4" />
                Show me on the board
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep(step + 1)}>
                Next
                <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>

        {last && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground mt-4 w-full text-center text-xs transition-colors"
          >
            Skip — I&rsquo;ll explore on my own
          </button>
        )}
      </div>
    </Dialog>
  );
}

/** Tiny badge used in the checklist and tour. */
export function StepState({ done }: { done: boolean }) {
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full",
        done ? "bg-success-muted text-success" : "bg-white/[0.06] text-muted-foreground/60",
      )}
    >
      {done ? <Check className="size-3" /> : <X className="size-3" />}
    </span>
  );
}
