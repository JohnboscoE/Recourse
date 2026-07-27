import { useEffect, useState } from "react";
import NeuralBackground from "@/components/ui/flow-field-background";

/**
 * Canvas needs literal colour values, not CSS classes, so read the design
 * tokens back out of the stylesheet rather than keeping a second copy.
 */
export function useToken(name: string, fallback: string) {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    if (v) setValue(v);
  }, [name]);
  return value;
}

/** "#0b0e14" → "11, 14, 20" for the canvas trail fade. */
export function hexToRgbTriplet(hex: string, fallback: string) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
  if (!m) return fallback;
  return [m[1], m[2], m[3]].map((h) => parseInt(h, 16)).join(", ");
}

/**
 * The one backdrop, shared by both views — it is what makes the dashboard and
 * the landing page feel like one product.
 *
 * `intensity` trades presence for legibility. The landing page is a poster and
 * can carry a busy field; the dashboard is a working surface, so it runs far
 * fewer particles under a heavier veil. Data has to stay readable — the
 * background's job there is to suggest depth, not to be noticed.
 */
export function AmbientBackground({
  intensity = "full",
}: {
  intensity?: "full" | "subtle";
}) {
  const accent = useToken("--primary", "#10b981");
  const surface = useToken("--background", "#0b0e14");
  const subtle = intensity === "subtle";

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div
        className="absolute inset-0"
        style={{ opacity: subtle ? 0.32 : 1 }}
      >
        <NeuralBackground
          color={accent}
          scale={1}
          trailOpacity={subtle ? 0.14 : 0.1}
          speed={subtle ? 0.45 : 0.8}
          particleCount={subtle ? 220 : 700}
          fadeColor={hexToRgbTriplet(surface, "11, 14, 20")}
          className="bg-background"
        />
      </div>

      {/* Veil. Heavier on the dashboard so figures stay crisp over it. */}
      <div
        className="absolute inset-0"
        style={{
          background: subtle
            ? "linear-gradient(to bottom, color-mix(in oklab, var(--background) 82%, transparent), var(--background) 70%)"
            : "linear-gradient(to bottom, color-mix(in oklab, var(--background) 30%, transparent), color-mix(in oklab, var(--background) 70%, transparent) 45%, var(--background))",
        }}
      />

      {/* Brand wash — keeps the top of the page from reading as flat black. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(70rem 45rem at 12% -15%, color-mix(in oklab, var(--primary) 12%, transparent), transparent 60%)," +
            "radial-gradient(55rem 32rem at 100% -5%, color-mix(in oklab, var(--info) 8%, transparent), transparent 55%)",
        }}
      />
    </div>
  );
}
