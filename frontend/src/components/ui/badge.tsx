import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-border bg-secondary text-muted-foreground",
        info: "border-info/30 bg-info-muted text-info",
        warning: "border-warning/30 bg-warning-muted text-warning",
        success: "border-success/30 bg-success-muted text-success",
        danger: "border-danger/30 bg-danger-muted text-danger",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** Job lifecycle → tone. Single mapping, used by every surface that shows status. */
export const STATUS_TONE: Record<string, BadgeTone> = {
  Open: "info",
  Claimed: "warning",
  Released: "success",
  Refunded: "danger",
};

/** Resolver decision → tone. */
export const DECISION_TONE: Record<string, BadgeTone> = {
  release: "success",
  refund: "danger",
  wait: "neutral",
};

export { Badge, badgeVariants };
