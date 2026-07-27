import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Wraps a child in a border with a bright highlight travelling around it.
 *
 * The highlight is a conic-gradient whose start angle animates. Gradients
 * can't be interpolated directly, so the angle is a registered custom
 * property (`--glow-angle`, declared in index.css) — that's what makes it
 * sweep smoothly instead of jumping.
 *
 * The ring is carved out with a mask rather than by covering the middle with
 * an opaque panel: the child here is a *glass* button, and painting a solid
 * colour behind it would defeat the point. Two boxes are masked against each
 * other — border-box minus content-box — leaving only the rim painted and the
 * centre fully transparent.
 *
 * Degrades safely: without @property the angle stays at its initial value, so
 * the highlight is static rather than broken. Motion is dropped entirely under
 * prefers-reduced-motion.
 */
export function GlowBorder({
  className,
  children,
  radius = "0.5rem",
  /** Seconds for one full lap. */
  duration = 4,
  /** Ring thickness. */
  thickness = 1.5,
  ...props
}: React.ComponentProps<"div"> & {
  radius?: string;
  duration?: number;
  thickness?: number;
}) {
  const ring = (pad: number): React.CSSProperties => ({
    background:
      "conic-gradient(from var(--glow-angle)," +
      "transparent 0deg, transparent 200deg," +
      "rgba(255,255,255,0.30) 292deg," +
      "#ffffff 330deg," +
      "rgba(255,255,255,0.30) 352deg," +
      "transparent 360deg)",
    animation: `glow-travel ${duration}s linear infinite`,
    borderRadius: radius,
    padding: `${pad}px`,
    // Paint the padding band only: full box minus the inner content box.
    WebkitMask:
      "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
    mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
    WebkitMaskComposite: "xor",
    maskComposite: "exclude",
  });

  return (
    <div
      className={cn("relative inline-flex isolate", className)}
      style={{ borderRadius: radius }}
      {...props}
    >
      {/* Bloom: a thicker, blurred copy so the light spills onto the page. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-[3px] blur-[5px] motion-reduce:animate-none"
        style={ring(thickness + 2)}
      />
      {/* The lit edge itself. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-px motion-reduce:animate-none"
        style={ring(thickness)}
      />
      {children}
    </div>
  );
}
