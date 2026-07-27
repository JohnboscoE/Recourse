import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Recessed rather than outlined: an inset well reads as a place to
        // type, where a bright 1px box just adds another edge to the page.
        "well text-foreground placeholder:text-muted-foreground/50",
        "focus-visible:ring-ring/50 h-10 w-full rounded-lg border border-white/[0.04] px-3.5",
        "font-mono text-sm transition-shadow outline-none focus-visible:ring-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "text-muted-foreground mb-1.5 block text-xs tracking-wide uppercase",
        className,
      )}
      {...props}
    />
  );
}

export { Input, Label };
