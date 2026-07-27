import { api, type JobView, type AppConfig } from "../api.js";

interface Props {
  job: JobView;
  cfg: AppConfig | null;
  nowSec: number;
  onAction: () => void;
}

const STATUS_STYLE: Record<string, string> = {
  Open: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  Claimed: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Released: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Refunded: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

function short(addr: string) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "—";
}

function countdown(deadline: number, nowSec: number) {
  const left = deadline - nowSec;
  if (left <= 0) return `expired ${Math.floor(-left / 60)}m ago`;
  if (left < 60) return `${left}s left`;
  return `${Math.floor(left / 60)}m ${left % 60}s left`;
}

export function JobCard({ job, cfg, nowSec, onAction }: Props) {
  const deadline = Number(job.deadline);
  const settled = job.statusLabel === "Released" || job.statusLabel === "Refunded";
  const pct = Math.min(
    100,
    (Number(job.observedIncrease) / Math.max(Number(job.minIncrease), 1e-9)) * 100,
  );

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
    } finally {
      onAction();
    }
  }

  const btn =
    "text-xs font-medium rounded px-3 py-1.5 border transition disabled:opacity-30 " +
    "disabled:cursor-not-allowed";

  return (
    <div className="bg-[#131822] border border-[#232b3a] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Job #{job.jobId}</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full border ${
              STATUS_STYLE[job.statusLabel] ?? "bg-slate-700 text-slate-300 border-slate-600"
            }`}
          >
            {job.statusLabel}
          </span>
        </div>
        <span className={`text-xs ${job.deadlinePassed ? "text-rose-400" : "text-slate-400"}`}>
          {countdown(deadline, nowSec)}
        </span>
      </div>

      {/* The verification predicate, made legible. */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-slate-400">
            subject <span className="font-mono text-slate-300">{short(job.subject)}</span> balance
          </span>
          <span className={job.deltaMet ? "text-emerald-400" : "text-amber-400"}>
            +{job.observedIncrease} / +{job.minIncrease} USDC
          </span>
        </div>
        <div className="h-1.5 bg-[#0b0e14] rounded overflow-hidden">
          <div
            className={`h-full ${job.deltaMet ? "bg-emerald-500" : "bg-amber-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-400 mb-3">
        <span>
          pays <span className="text-slate-200">{job.paymentAmount} USDC</span>
        </span>
        <span>
          agent <span className="font-mono text-slate-300">{short(job.agent)}</span>
        </span>
      </div>

      {job.executionRef && (
        <div className="text-xs mb-3">
          <span className="text-slate-400">agent execution </span>
          <span className="font-mono text-slate-300">{job.executionRef}</span>
        </div>
      )}

      {/* What the resolver would do right now. */}
      <div className="text-xs bg-[#0b0e14] border border-[#232b3a] rounded px-3 py-2 mb-3">
        <span className="text-slate-400">resolver would </span>
        <span
          className={
            job.pendingDecision.action === "release"
              ? "text-emerald-400 font-semibold"
              : job.pendingDecision.action === "refund"
                ? "text-rose-400 font-semibold"
                : "text-slate-300 font-semibold"
          }
        >
          {job.pendingDecision.action.toUpperCase()}
        </span>
        <span className="text-slate-400"> — {job.pendingDecision.reason}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          disabled={job.statusLabel !== "Open"}
          onClick={() => run(() => api.work(job.jobId, "honest"))}
          className={`${btn} border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10`}
        >
          Run honest agent
        </button>
        <button
          disabled={job.statusLabel !== "Open"}
          onClick={() => run(() => api.work(job.jobId, "fail"))}
          className={`${btn} border-rose-500/40 text-rose-300 hover:bg-rose-500/10`}
          title="Delivers half the required amount — the transfer still succeeds on-chain"
        >
          Run failing agent
        </button>
        <button
          onClick={() => run(() => api.resolve(job.jobId, true))}
          className={`${btn} border-slate-600 text-slate-300 hover:bg-slate-700/40`}
        >
          Dry-run resolve
        </button>
        <button
          disabled={settled || job.pendingDecision.action === "wait"}
          onClick={() => run(() => api.resolve(job.jobId, false))}
          className={`${btn} border-sky-500/40 text-sky-300 hover:bg-sky-500/10`}
        >
          Settle
        </button>
      </div>

      {cfg && (
        <a
          className="inline-block mt-3 text-xs text-slate-500 hover:text-slate-300 underline"
          href={`${cfg.explorer}/address/${cfg.escrowAddress}`}
          target="_blank"
          rel="noreferrer"
        >
          view escrow on Basescan ↗
        </a>
      )}
    </div>
  );
}
