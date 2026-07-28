import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { api } from "../api.js";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/liquid-glass-button";
import { InfoTip, GLOSSARY } from "@/components/ui/info-tip";

interface Props {
  defaultSubject: string;
  onPosted: () => void;
  onClose: () => void;
}

/**
 * Posts a job. A job is a statement of exactly one shape:
 * "address X's USDC balance increases by >= N by time T."
 */
export function PostJobForm({ defaultSubject, onPosted, onClose }: Props) {
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
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-7 pt-7">
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

      <form onSubmit={submit} className="p-7">
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
              placeholder="0x…"
              spellCheck={false}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
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

        <div className="mt-7 flex items-center justify-between gap-4">
          <p className="text-muted-foreground/70 text-xs">
            Two KeeperHub executions — this can take a minute.
          </p>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? "Submitting…" : "Approve + create"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
