import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The one panel surface in the app.
 *
 * `glass` (default) frosts over whatever sits behind it and is what gives the
 * dashboard the same material as the landing page. `solid` is the opaque
 * fallback for anywhere a blur would cost more than it earns — long scrolling
 * lists, or nested panels where stacked blurs turn to mud.
 */
function Card({
  className,
  variant = "glass",
  ...props
}: React.ComponentProps<"div"> & { variant?: "glass" | "solid" }) {
  return (
    <div
      data-slot="card"
      data-variant={variant}
      className={cn(
        "rounded-[var(--radius-panel)]",
        variant === "glass" ? "glass" : "bg-card border-border border",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex items-center justify-between gap-3 px-4 py-3", className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cn("text-sm font-semibold", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-muted-foreground text-xs", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("p-4", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
