import { useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { api } from "../api.js";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/liquid-glass-button";
import { InfoTip, GLOSSARY } from "@/components/ui/info-tip";

interface Props {
  /** The wallet the agent pays FROM — never a valid subject. */
  agentWallet: string;
  onPosted: () => void;
  onClose: () => void;
}

/**
 * Posts a job. A job is a statement of exactly one shape:
 * "address X's USDC balance increases by >= N by time T."
 */
export function PostJobForm({ agentWallet, onPosted, onClose }: Props) {
  // Deliberately empty. It previously defaulted to the execution wallet, which
  // is the address the agent pays FROM — so the transfer was a self-transfer,
  // the delta stayed at 0, and every such job could only refund.
  const [subject, setSubject] = useState("");
  const [minIncrease, setMinIncrease] = useState("0.1");
  const [payment, setPayment] = useState("0.05");
  const [deadlineMins, setDeadlineMins] = useState(30);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const looksLikeAddress = /^0x[a-fA-F0-9]{40}$/.test(subject.trim());
  const isAgentWallet =
    looksLikeAddress &&
    agentWallet &&
    subject.trim().toLowerCase() === agentWallet.toLowerCase();
  const canSubmit = looksLikeAddress && !isAgentWallet && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await api.postJob({ subject, minIncrease, payment, deadlineMins });
      onPosted();
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-7 sm:pt-7">
        <div>
          <h2 className="text-sm font-semibold">New job</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Locks payment in escrow against a balance-delta promise.
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 rounded-md p-1.5 transition-colors hover:bg-white/[0.06]"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      <form onSubmit={submit} className="p-5 sm:p-7">
        <div className="space-y-5">
          <div>
            <Label htmlFor="subject" className="flex items-center">
              Subject — whose balance must rise
              <InfoTip term="Subject">{GLOSSARY.subject}</InfoTip>
            </Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="0x… beneficiary address"
              spellCheck={false}
              aria-invalid={subject.length > 0 && (!looksLikeAddress || !!isAgentWallet)}
            />

            {isAgentWallet ? (
              <p className="text-danger mt-2 flex gap-1.5 text-xs leading-relaxed">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  That&rsquo;s the wallet the agent pays <em>from</em>. Sending to
                  it nets to zero, so the balance would never rise and the job
                  could only ever refund. Use a different address.
                </span>
              </p>
            ) : (
              <p className="text-muted-foreground/70 mt-2 text-xs leading-relaxed">
                Any address <em>other than</em> the agent&rsquo;s own wallet
                {agentWallet ? ` (${agentWallet.slice(0, 6)}…${agentWallet.slice(-4)})` : ""}
                . Its USDC balance is what gets measured.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="min" className="flex items-center">
                Required
                <InfoTip term="Required increase">{GLOSSARY.predicate}</InfoTip>
              </Label>
              <Input
                id="min"
                value={minIncrease}
                onChange={(e) => setMinIncrease(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="pay">Payment</Label>
              <Input
                id="pay"
                value={payment}
                onChange={(e) => setPayment(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="deadline">Deadline (min)</Label>
              <Input
                id="deadline"
                type="number"
                min={1}
                value={deadlineMins}
                onChange={(e) => setDeadlineMins(Number(e.target.value))}
              />
            </div>
          </div>

          <p className="text-muted-foreground/70 text-xs">
            Short deadlines make the refund path demoable — try ~3 min to watch a
            job expire.
          </p>
        </div>

        {err && (
          <p className="text-danger mt-4 font-mono text-xs break-all">{err}</p>
        )}

        <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p className="text-muted-foreground/70 text-xs">
            Two KeeperHub executions — this can take a minute.
          </p>
          <Button type="submit" disabled={!canSubmit}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? "Submitting…" : "Approve + create"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
