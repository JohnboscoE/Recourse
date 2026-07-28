import { ArrowRight, ShieldCheck } from "lucide-react";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { GlowBorder } from "@/components/ui/glow-border";
import { HowItWorks } from "@/components/HowItWorks";
import { ProblemSolution } from "@/components/ProblemSolution";

function Section({
  eyebrow,
  children,
}: {
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-16 w-full sm:mt-24">
      <p className="text-muted-foreground mb-6 text-center text-xs tracking-[0.2em] uppercase">
        {eyebrow}
      </p>
      {children}
    </section>
  );
}

export function Hero({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="relative w-full">
      {/* Backdrop is mounted by App via <AmbientBackground intensity="full" />,
          so both views share one definition instead of drifting apart. */}
      <div className="mx-auto flex max-w-5xl flex-col items-center px-4 pt-14 pb-20 text-center sm:px-6 sm:pt-20 sm:pb-24">
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
