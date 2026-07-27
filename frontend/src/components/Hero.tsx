import { ArrowRight, ShieldCheck } from "lucide-react";
import NeuralBackground from "@/components/ui/flow-field-background";
import { LiquidButton } from "@/components/ui/liquid-glass-button";

/**
 * Landing screen — the opening shot for the demo video.
 *
 * The flow field sits behind everything as texture; the copy states the thesis
 * in one line, and the CTA drops straight into the live job board.
 */
export function Hero({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Background layer. fadeColor matches the app surface so trails fade
          into the page instead of leaving a black haze over it. */}
      <div className="absolute inset-0">
        <NeuralBackground
          color="#10b981"
          scale={1}
          trailOpacity={0.1}
          speed={0.8}
          particleCount={700}
          fadeColor="11, 14, 20"
          className="bg-[#0b0e14]"
        />
      </div>

      {/* Vignette keeps the copy legible wherever the particles happen to clump. */}
      <div className="pointer-events-none absolute inset-0 bg-radial-[at_50%_50%] from-transparent to-[#0b0e14]/90" />

      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
          <ShieldCheck className="size-3.5" />
          Live on Base · executed via KeeperHub
        </div>

        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-50 sm:text-6xl">
          Agents get paid for <span className="text-emerald-400">results</span>,
          not receipts.
        </h1>

        <p className="mt-5 max-w-xl text-sm text-slate-400 sm:text-base">
          A transaction can succeed and still do the wrong thing. Recourse holds
          payment in escrow until chain state proves the promise was kept.
        </p>

        <LiquidButton onClick={onEnter} className="mt-10 text-slate-100">
          Open the job board
          <ArrowRight className="size-4" />
        </LiquidButton>

        <p className="mt-6 font-mono text-xs text-slate-600">
          escrow 0xE21A…5982 · both release and refund paths verified on-chain
        </p>
      </div>
    </div>
  );
}
