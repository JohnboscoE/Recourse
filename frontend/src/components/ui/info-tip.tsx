import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Inline definition for a domain term.
 *
 * Onboarding isn't only a first-run tour — most confusion happens later, at the
 * moment someone reads "baseline" or "delta" on a card and doesn't know what it
 * means. Explaining in place beats sending them back to a doc.
 */
export function InfoTip({
  term,
  children,
  className,
}: {
  term: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <button
        type="button"
        aria-label={`What is ${term}?`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="text-muted-foreground/50 hover:text-muted-foreground ml-1 transition-colors"
      >
        <HelpCircle className="size-3" />
      </button>

      {open && (
        <span
          role="tooltip"
          className={cn(
            "glass absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2",
            "rounded-lg p-3 text-xs leading-relaxed normal-case",
            "text-muted-foreground pointer-events-none tracking-normal",
          )}
        >
          <span className="text-foreground block font-medium">{term}</span>
          <span className="mt-1 block">{children}</span>
        </span>
      )}
    </span>
  );
}

/** The terms a first-time reader trips over, defined once. */
export const GLOSSARY = {
  predicate:
    "The promise being escrowed. Always the same shape: an address's USDC balance must rise by at least N before a deadline.",
  baseline:
    "The subject's balance at the moment the job was created. Only increases after that point count, so pre-existing funds can't be used to claim the payment.",
  delta:
    "Current balance minus the baseline. This single number decides whether the agent is paid or the poster is refunded.",
  subject:
    "The address whose balance has to rise. Usually the beneficiary of the work — often not the agent doing it.",
  execution:
    "One action KeeperHub performed on-chain, with its own audit record. Note it reports success when the transaction didn't revert — which is not the same as the promise being kept.",
  settle:
    "Submit the final decision on-chain: release to the agent, or refund to the poster. The contract re-verifies the delta itself, so it can't be tricked.",
} as const;
