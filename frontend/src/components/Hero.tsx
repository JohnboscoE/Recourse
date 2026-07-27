import { useEffect, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import NeuralBackground from "@/components/ui/flow-field-background";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { GlowBorder } from "@/components/ui/glow-border";
import { HowItWorks } from "@/components/HowItWorks";
import { ProblemSolution } from "@/components/ProblemSolution";

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

function Section({
  eyebrow,
  children,
}: {
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-24 w-full">
      <p className="text-muted-foreground mb-6 text-center text-xs tracking-[0.2em] uppercase">
        {eyebrow}
      </p>
      {children}
    </section>
  );
}

export function Hero({ onEnter }: { onEnter: () => void }) {
  const accent = useToken("--primary", "#10b981");
  const surface = useToken("--background", "#0b0e14");

  return (
    <div className="relative w-full">
      {/* Backdrop. fadeColor matches the page surface so trails fade into it
          rather than leaving a black haze. Fixed so it survives scrolling. */}
      <div className="fixed inset-0 -z-10">
        <NeuralBackground
          color={accent}
          scale={1}
          trailOpacity={0.1}
          speed={0.8}
          particleCount={700}
          fadeColor={hexToRgbTriplet(surface, "11, 14, 20")}
          className="bg-background"
        />
        <div className="from-background/30 via-background/70 to-background pointer-events-none absolute inset-0 bg-gradient-to-b" />
      </div>

      <div className="mx-auto flex max-w-5xl flex-col items-center px-6 pt-20 pb-24 text-center">
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

        {/* Primary CTA, with light travelling around the rim. */}
        <GlowBorder radius="0.5rem" duration={4} className="mt-10">
          <LiquidButton onClick={onEnter} className="text-foreground">
            Open the dashboard
            <ArrowRight className="size-4" />
          </LiquidButton>
        </GlowBorder>

        <Section eyebrow="Why this exists">
          <ProblemSolution />
        </Section>

        <Section eyebrow="How it works">
          <HowItWorks />
        </Section>

        <p className="text-muted-foreground/60 mt-16 font-mono text-xs">
          escrow 0xE21A…5982 · both settlement paths verified on-chain
        </p>
      </div>
    </div>
  );
}
