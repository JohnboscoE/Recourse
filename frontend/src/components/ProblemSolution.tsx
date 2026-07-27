import { AlertTriangle, CheckCircle2, FileWarning, Landmark, ScanLine } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * The problem, then the answer. Deliberately concrete: the failure being
 * described is one we reproduced on Base, not a hypothetical.
 */

const PROBLEM = [
  {
    icon: FileWarning,
    title: "“Success” only means “did not revert”",
    body: "Every payment rail keys off transaction status. But a transfer of the wrong amount, to the wrong address, or a partial fill all confirm successfully. The receipt says done; the ledger disagrees.",
  },
  {
    icon: AlertTriangle,
    title: "Agents are now spending the money",
    body: "x402 and MPP shipped per-call payment for autonomous agents. Nothing underneath them checks that the paid-for work actually happened — so whoever funds the agent absorbs every failure.",
  },
  {
    icon: Landmark,
    title: "Escrow alone doesn’t fix it",
    body: "Holding funds only helps if something can decide, without being trusted, whether to let go of them. Otherwise you have re-invented the middleman you were trying to remove.",
  },
];

const SOLUTION = [
  {
    icon: ScanLine,
    title: "The promise is machine-checkable",
    body: "A job is one statement: address X’s USDC balance rises by at least N before time T. No prose, no interpretation — a claim the chain itself can settle.",
  },
  {
    icon: CheckCircle2,
    title: "Chain state decides, not the receipt",
    body: "The resolver reads the balance delta on Base and compares it to the promise. The KeeperHub execution record is used for observability, never as the verification signal.",
  },
  {
    icon: Landmark,
    title: "Both outcomes are automatic",
    body: "Delta met, the agent is paid instantly. Deadline passed without it, the poster is refunded — even though the agent’s transaction succeeded. No arbiter, no dispute queue.",
  },
];

function Column({
  eyebrow,
  tone,
  items,
}: {
  eyebrow: string;
  tone: "danger" | "success";
  items: typeof PROBLEM;
}) {
  return (
    <div>
      <div
        className={
          "mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs " +
          (tone === "danger"
            ? "border-danger/30 bg-danger-muted text-danger"
            : "border-success/30 bg-success-muted text-success")
        }
      >
        {eyebrow}
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.title} className="p-4 text-left">
              <div className="flex gap-3">
                <Icon
                  className={
                    "mt-0.5 size-4 shrink-0 " +
                    (tone === "danger" ? "text-danger" : "text-success")
                  }
                />
                <div>
                  <h3 className="text-foreground text-sm font-medium">{item.title}</h3>
                  <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
                    {item.body}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function ProblemSolution() {
  return (
    <div className="w-full">
      <div className="grid gap-8 text-left md:grid-cols-2">
        <Column eyebrow="The problem" tone="danger" items={PROBLEM} />
        <Column eyebrow="How Recourse solves it" tone="success" items={SOLUTION} />
      </div>

      <p className="text-muted-foreground mt-8 text-center text-xs">
        This is not hypothetical. Job #2 on Base was refunded while its agent’s
        execution reported{" "}
        <code className="text-foreground/80 font-mono">success: true</code> on a
        confirmed transaction.
      </p>
    </div>
  );
}
