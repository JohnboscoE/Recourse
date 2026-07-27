import { useState } from "react";
import { api } from "../api.js";

interface Props {
  defaultSubject: string;
  onPosted: () => void;
}

/**
 * Posts a job. A job is a signed statement of exactly one shape:
 * "address X's USDC balance increases by >= N by time T."
 */
export function PostJobForm({ defaultSubject, onPosted }: Props) {
  const [subject, setSubject] = useState(defaultSubject);
  const [minIncrease, setMinIncrease] = useState("0.1");
  const [payment, setPayment] = useState("0.05");
  const [deadlineMins, setDeadlineMins] = useState(30);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await api.postJob({ subject, minIncrease, payment, deadlineMins });
      onPosted();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full bg-[#0b0e14] border border-[#232b3a] rounded px-3 py-2 text-sm font-mono";
  const label = "block text-xs uppercase tracking-wide text-slate-400 mb-1";

  return (
    <form onSubmit={submit} className="bg-[#131822] border border-[#232b3a] rounded-lg p-4">
      <h2 className="font-semibold mb-1">Post a job</h2>
      <p className="text-xs text-slate-400 mb-4">
        Locks payment in escrow against a balance-delta promise.
      </p>

      <div className="space-y-3">
        <div>
          <label className={label}>Subject (address whose balance must rise)</label>
          <input
            className={field}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="0x…"
            spellCheck={false}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Required increase (USDC)</label>
            <input
              className={field}
              value={minIncrease}
              onChange={(e) => setMinIncrease(e.target.value)}
            />
          </div>
          <div>
            <label className={label}>Payment (USDC)</label>
            <input
              className={field}
              value={payment}
              onChange={(e) => setPayment(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className={label}>Deadline (minutes from now)</label>
          <input
            type="number"
            min={1}
            className={field}
            value={deadlineMins}
            onChange={(e) => setDeadlineMins(Number(e.target.value))}
          />
          <p className="text-xs text-slate-500 mt-1">
            Short deadlines make the refund path demoable — use ~3 min to watch a job expire.
          </p>
        </div>
      </div>

      {err && <p className="text-xs text-rose-400 mt-3 font-mono break-all">{err}</p>}

      <button
        type="submit"
        disabled={busy}
        className="mt-4 w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40
                   text-black font-semibold rounded px-4 py-2 text-sm"
      >
        {busy ? "Submitting…" : "Approve + create job via KeeperHub"}
      </button>
      <p className="text-xs text-slate-500 mt-2">
        Two KeeperHub executions. Progress appears in the log — this can take a minute.
      </p>
    </form>
  );
}
