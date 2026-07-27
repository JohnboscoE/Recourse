import type { LucideIcon } from "lucide-react";
import { CheckCircle2, Layers, RotateCcw, Wallet } from "lucide-react";
import type { JobView } from "../api.js";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

type Tone = "neutral" | "success" | "danger" | "info";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-foreground",
  success: "text-success",
  danger: "text-danger",
  info: "text-info",
};

const TONE_ICON: Record<Tone, string> = {
  neutral: "text-muted-foreground/60",
  success: "text-success/70",
  danger: "text-danger/70",
  info: "text-info/70",
};

function Metric({
  label,
  value,
  unit,
  caption,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  unit?: string;
  caption: string;
  icon: LucideIcon;
  tone?: Tone;
}) {
  return (
    <Card className="p-6">
      {/* Bare icon, no chip. A tinted rounded square behind every icon is
          decoration pretending to be structure. */}
      <div className="flex items-center justify-between gap-3">
        <span className="label-xs">{label}</span>
        <Icon className={cn("size-4", TONE_ICON[tone])} />
      </div>

      <div className="mt-5 flex items-baseline gap-1.5">
        <span
          className={cn(
            "display tnum text-[2rem] leading-none font-semibold",
            TONE_TEXT[tone],
          )}
        >
          {value}
        </span>
        {unit && (
          <span className="text-muted-foreground text-xs font-medium">{unit}</span>
        )}
      </div>

      <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
        {caption}
      </p>
    </Card>
  );
}

export function MetricsRow({
  jobs,
  escrowUsdc,
}: {
  jobs: JobView[];
  escrowUsdc: string | null;
}) {
  const released = jobs.filter((j) => j.statusLabel === "Released");
  const refunded = jobs.filter((j) => j.statusLabel === "Refunded");
  const live = jobs.filter(
    (j) => j.statusLabel === "Open" || j.statusLabel === "Claimed",
  );

  const settled = released.length + refunded.length;
  // Share of settled jobs where the promise actually held.
  const keptRate = settled === 0 ? null : Math.round((released.length / settled) * 100);

  const paidOut = released
    .reduce((sum, j) => sum + Number(j.paymentAmount), 0)
    .toFixed(2);

  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      <Metric
        label="Total jobs"
        value={String(jobs.length)}
        caption={
          live.length > 0 ? `${live.length} still in flight` : "None in flight"
        }
        icon={Layers}
      />
      <Metric
        label="Released"
        value={String(released.length)}
        caption={`${paidOut} USDC paid to agents`}
        icon={CheckCircle2}
        tone="success"
      />
      <Metric
        label="Refunded"
        value={String(refunded.length)}
        caption="Promise unmet, poster made whole"
        icon={RotateCcw}
        tone="danger"
      />
      <Metric
        label="In escrow"
        value={escrowUsdc ?? "—"}
        unit="USDC"
        caption={
          keptRate === null
            ? "No jobs settled yet"
            : `${keptRate}% of settled jobs kept the promise`
        }
        icon={Wallet}
        tone="info"
      />
    </div>
  );
}
