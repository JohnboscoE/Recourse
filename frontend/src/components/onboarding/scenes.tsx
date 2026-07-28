import { useEffect, useState } from "react";
import { Check, Lock, RotateCcw, ScanLine, Server, User, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Animated illustrations for the welcome screens.
 *
 * Each scene shows the *mechanism* the text is describing, because the whole
 * idea rests on a distinction ("succeeded" vs "actually happened") that is much
 * easier to see than to read. They loop on a single shared timeline so a scene
 * is coherent whenever it happens to be mounted.
 *
 * All motion is decorative and additive — every scene still reads correctly as
 * a static diagram, which is what someone with prefers-reduced-motion gets.
 */

const LOOP = "5s";

function Node({
  icon: Icon,
  label,
  sub,
  tone = "neutral",
}: {
  icon: typeof User;
  label: string;
  sub?: string;
  tone?: "neutral" | "success" | "danger";
}) {
  return (
    <div className="flex w-24 shrink-0 flex-col items-center gap-2 text-center">
      <span
        className={cn(
          "flex size-11 items-center justify-center rounded-xl",
          tone === "success" && "bg-success-muted text-success",
          tone === "danger" && "bg-danger-muted text-danger",
          tone === "neutral" && "bg-white/[0.06] text-muted-foreground",
        )}
      >
        <Icon className="size-5" />
      </span>
      <div>
        <div className="text-foreground/90 text-[11px] font-medium">{label}</div>
        {sub && (
          <div className="text-muted-foreground mt-0.5 font-mono text-[10px]">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

function Track({ children }: { children?: React.ReactNode }) {
  return (
    <div className="relative mx-1 h-11 flex-1">
      <div className="absolute top-1/2 right-0 left-0 h-px -translate-y-1/2 bg-white/10" />
      {children}
    </div>
  );
}

/**
 * Shell so every scene has identical footprint and framing.
 *
 * `relative` matters: scenes anchor captions absolutely, and without a
 * positioned ancestor here they would escape to the dialog panel.
 */
function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="well relative flex h-[9.5rem] items-center justify-center overflow-hidden rounded-xl px-5 motion-reduce:[&_*]:!animate-none">
      {children}
    </div>
  );
}

/** Caption pinned to the base of the stage. */
function Caption({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn(
        "absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap",
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}

/**
 * Scene 1 — an instruction to send 100 arrives as 10, and is still stamped
 * successful. The mismatch between the two numbers is the entire point.
 */
export function SceneWrongAmount() {
  return (
    <Stage>
      <div className="mb-6 flex w-full max-w-sm items-center">
        <Node icon={User} label="Agent" sub="send 100" />

        <Track>
          <div
            className="absolute top-1/2 left-0 -translate-y-1/2"
            style={{
              // @ts-expect-error -- CSS custom property
              "--travel": "6.5rem",
              animation: `packet-shrink ${LOOP} ease-in-out infinite`,
            }}
          >
            <span className="bg-warning/20 text-warning rounded-md px-2 py-1 font-mono text-[10px] whitespace-nowrap">
              100 → 10
            </span>
          </div>
        </Track>

        <div className="flex w-24 shrink-0 flex-col items-center gap-2 text-center">
          <span className="bg-white/[0.06] text-muted-foreground flex size-11 items-center justify-center rounded-xl">
            <Server className="size-5" />
          </span>
          <div>
            <div className="text-foreground/90 text-[11px] font-medium">
              Supplier
            </div>
            <div
              className="text-warning mt-0.5 font-mono text-[10px]"
              style={{ animation: `value-land ${LOOP} ease-in-out infinite` }}
            >
              +10 only
            </div>
          </div>
        </div>
      </div>

      <Caption style={{ animation: `stamp-in ${LOOP} ease-out infinite` }}>
        <span className="border-success/30 bg-success-muted text-success flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px]">
          <Check className="size-3" />
          success: true
        </span>
      </Caption>
    </Stage>
  );
}

/**
 * Scene 2 — payment goes out, a 200 comes back, and the result slot stays
 * empty. Drawn from the two x402 calls we actually paid for.
 */
export function ScenePaidNothing() {
  return (
    <Stage>
      <div className="mb-6 flex w-full max-w-sm items-center">
        <Node icon={User} label="You" sub="$0.01" />

        <Track>
          <div
            className="absolute top-1/2 left-0 -translate-y-1/2"
            style={{
              // @ts-expect-error -- CSS custom property
              "--travel": "6.5rem",
              animation: `packet-shrink ${LOOP} ease-in-out infinite`,
            }}
          >
            <span className="text-primary bg-primary/15 rounded-md px-2 py-1 font-mono text-[10px]">
              $0.01
            </span>
          </div>

          <div
            className="absolute top-1/2 left-0 -translate-y-1/2"
            style={{
              // @ts-expect-error -- CSS custom property
              "--travel": "6.5rem",
              animation: `packet-return ${LOOP} ease-in-out infinite`,
            }}
          >
            <span className="bg-success-muted text-success rounded-md px-2 py-1 font-mono text-[10px]">
              200 OK
            </span>
          </div>
        </Track>

        <div className="flex w-24 shrink-0 flex-col items-center gap-2 text-center">
          <span className="bg-white/[0.06] text-muted-foreground flex size-11 items-center justify-center rounded-xl">
            <Server className="size-5" />
          </span>
          <div>
            <div className="text-foreground/90 text-[11px] font-medium">
              Service
            </div>
            <div
              className="text-danger mt-0.5 font-mono text-[10px]"
              style={{ animation: `soft-pulse ${LOOP} ease-in-out infinite` }}
            >
              no result
            </div>
          </div>
        </div>
      </div>

      <Caption className="text-muted-foreground font-mono text-[10px]">
        paid · no refund · nothing checked
      </Caption>
    </Stage>
  );
}

/**
 * Scene 3 — the same job settling both ways. Alternates rather than showing one
 * outcome, because the point is that the *same* successful transaction can end
 * in either, and only the measured delta decides which.
 */
export function SceneVerified() {
  const [kept, setKept] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setKept((k) => !k), 4200);
    return () => clearInterval(id);
  }, []);

  return (
    <Stage>
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between">
          <Node icon={Lock} label="Escrow" sub="holds 0.05" />
          <Node icon={ScanLine} label="Resolver" sub="reads chain" />
          <Node
            icon={kept ? Check : RotateCcw}
            label={kept ? "Release" : "Refund"}
            sub={kept ? "agent paid" : "you repaid"}
            tone={kept ? "success" : "danger"}
          />
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between text-[10px]">
            <span className="text-muted-foreground">measured delta</span>
            <span
              className={cn(
                "font-mono",
                kept ? "text-success" : "text-warning",
              )}
            >
              {kept ? "+0.10 / +0.10" : "+0.05 / +0.10"}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <div
              key={String(kept)}
              className={cn(
                "h-full rounded-full",
                kept ? "bg-success" : "bg-warning",
              )}
              style={{
                // @ts-expect-error -- CSS custom property
                "--fill": kept ? "100%" : "50%",
                animation: "meter-fill 1.4s ease-out forwards",
              }}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px]">
          {kept ? (
            <>
              <Check className="text-success size-3" />
              <span className="text-success">promise kept — agent paid</span>
            </>
          ) : (
            <>
              <X className="text-danger size-3" />
              <span className="text-danger">
                transaction succeeded — promise did not
              </span>
            </>
          )}
        </div>
      </div>
    </Stage>
  );
}
