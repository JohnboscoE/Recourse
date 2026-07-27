import { useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../api.js";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/liquid-glass-button";

interface Props {
  defaultSubject: string;
  onPosted: () => void;
}

/**
 * Posts a job. A job is a statement of exactly one shape:
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

  return (
    <Card>
      <CardContent>
        <form onSubmit={submit}>
          <h2 className="text-sm font-semibold">Post a job</h2>
          <p className="text-muted-foreground mt-1 mb-4 text-xs">
            Locks payment in escrow against a balance-delta promise.
          </p>

          <div className="space-y-3">
            <div>
              <Label htmlFor="subject">
                Subject — address whose balance must rise
              </Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="min">Required increase</Label>
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
            </div>

            <div>
              <Label htmlFor="deadline">Deadline (minutes from now)</Label>
              <Input
                id="deadline"
                type="number"
                min={1}
                value={deadlineMins}
                onChange={(e) => setDeadlineMins(Number(e.target.value))}
              />
              <p className="text-muted-foreground/70 mt-1.5 text-xs">
                Short deadlines make the refund path demoable — try ~3 min to
                watch a job expire.
              </p>
            </div>
          </div>

          {err && (
            <p className="text-danger mt-3 font-mono text-xs break-all">{err}</p>
          )}

          <Button type="submit" disabled={busy} className="mt-4 w-full">
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? "Submitting…" : "Approve + create job via KeeperHub"}
          </Button>
          <p className="text-muted-foreground/70 mt-2 text-xs">
            Two KeeperHub executions. Progress appears in the log — this can take
            a minute.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
