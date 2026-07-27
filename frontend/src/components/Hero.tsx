import { useEffect, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import NeuralBackground from "@/components/ui/flow-field-background";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { HowItWorks } from "@/components/HowItWorks";

/**
 * Canvas needs literal colour values, not CSS classes, so read the design
 * tokens back out of the stylesheet rather than hardcoding a second copy.
 */
function useToken(name: string, fallback: string) {
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
function hexToRgbTriplet(hex: string, fallback: string) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
  if (!m) return fallback;
  return [m[1], m[2], m[3]].map((h) => parseInt(h, 16)).join(", ");
}

/**
 * Landing screen and opening shot for the demo video: the thesis in one line,
 * then an animation of the actual loop, then a way into the live board.
 */
export function Hero({ onEnter }: { onEnter: () => void }) {
  const accent = useToken("--primary", "#10b981");
  const surface = useToken("--background", "#0b0e14");

  return (
    <div className="relative h-full w-full overflow-y-auto">
      {/* Backdrop. fadeColor matches the page surface so trails fade into it
          rather than leaving a black haze. Fixed so it survives scrolling. */}
      <div className="fixed inset-0">
        <NeuralBackground
          color={accent}
          scale={1}
          trailOpacity={0.1}
          speed={0.8}
          particleCount={700}
          fadeColor={hexToRgbTriplet(surface, "11, 14, 20")}
          className="bg-background"
        />
        <div className="from-background/40 to-background pointer-events-none absolute inset-0 bg-gradient-to-b" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
        <div className="border-success/30 bg-success-muted text-success mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
          <ShieldCheck className="size-3.5" />
          Live on Base · executed via KeeperHub
        </div>

        <h1 className="text-foreground max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Agents get paid for <span className="text-primary">results</span>, not
          receipts.
        </h1>

        <p className="text-muted-foreground mt-5 max-w-xl text-sm text-pretty sm:text-base">
          A transaction can succeed and still do the wrong thing. Recourse holds
          payment in escrow until chain state proves the promise was kept.
        </p>

        <LiquidButton onClick={onEnter} className="text-foreground mt-10">
          Open the job board
          <ArrowRight className="size-4" />
        </LiquidButton>

        {/* The loop, animated. */}
        <div className="mt-20 w-full">
          <p className="text-muted-foreground mb-6 text-xs tracking-[0.2em] uppercase">
            How it works
          </p>
          <HowItWorks />
        </div>

        <p className="text-muted-foreground/60 mt-12 font-mono text-xs">
          escrow 0xE21A…5982 · both settlement paths verified on-chain
        </p>
      </div>
    </div>
  );
}
