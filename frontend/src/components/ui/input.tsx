import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "border-input bg-background text-foreground placeholder:text-muted-foreground/60",
        "focus-visible:border-ring focus-visible:ring-ring/40 h-9 w-full rounded-md border px-3",
        "font-mono text-sm transition-colors outline-none focus-visible:ring-2",
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
