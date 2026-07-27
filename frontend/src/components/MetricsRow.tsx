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

const TONE_CHIP: Record<Tone, string> = {
  neutral: "bg-white/[0.06] text-muted-foreground ring-white/10",
  success: "bg-success-muted text-success ring-success/20",
  danger: "bg-danger-muted text-danger ring-danger/20",
  info: "bg-info-muted text-info ring-info/20",
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
    <Card className="relative overflow-hidden p-5">
      {/* Tone wash, so the card carries meaning before you read it. */}
      {tone !== "neutral" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            background: `radial-gradient(20rem 12rem at 100% 0%, currentColor, transparent 70%)`,
          }}
        />
      )}

      <div className="relative flex items-start justify-between gap-3">
        <span className="label-xs">{label}</span>
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-lg ring-1",
            TONE_CHIP[tone],
          )}
        >
          <Icon className="size-3.5" />
        </span>
      </div>

      <div className="relative mt-4 flex items-baseline gap-1.5">
        <span
          className={cn(
            "display tnum text-3xl font-semibold",
            TONE_TEXT[tone],
          )}
        >
          {value}
        </span>
        {unit && (
          <span className="text-muted-foreground text-xs font-medium">{unit}</span>
        )}
      </div>

      <p className="text-muted-foreground relative mt-1.5 text-xs">{caption}</p>
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
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric
        label="Total jobs"
        value={String(jobs.length)}
        caption={
          live.length > 0 ? `${live.length} still in flight` : "none in flight"
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
        caption="promise unmet, poster made whole"
        icon={RotateCcw}
        tone="danger"
      />
      <Metric
        label="In escrow"
        value={escrowUsdc ?? "—"}
        unit="USDC"
        caption={
          keptRate === null
            ? "no jobs settled yet"
            : `${keptRate}% of settled jobs kept the promise`
        }
        icon={Wallet}
        tone="info"
      />
    </div>
  );
}
