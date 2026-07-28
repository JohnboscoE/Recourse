import type { Env } from "./env.js";

/**
 * Event log, backed by D1.
 *
 * The Node backend keeps this in a module-level array. That cannot work here:
 * isolates are ephemeral and requests may land on different ones, so an
 * in-memory log would return different history depending on which isolate
 * answered — worse than no log at all.
 *
 * D1 rather than KV (which rate-limits writes to ~1/s per key and is only
 * eventually consistent — both wrong for an append-heavy, read-your-writes
 * log) and rather than Durable Objects (correct, but requires the paid plan;
 * D1 has a free tier, which was the point of moving off Railway).
 *
 * Still observability only. Nothing here decides a settlement.
 */

export type EventLevel = "info" | "success" | "warn" | "error";

export interface LogEvent {
  seq: number;
  ts: string;
  level: EventLevel;
  jobId?: string;
  phase?: string;
  message: string;
  executionId?: string;
  txHash?: string;
}

const MAX_ROWS = 500;

export async function log(
  env: Env,
  e: Omit<LogEvent, "seq" | "ts">,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO events (ts, level, job_id, phase, message, execution_id, tx_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      new Date().toISOString(),
      e.level,
      e.jobId ?? null,
      e.phase ?? null,
      e.message,
      e.executionId ?? null,
      e.txHash ?? null,
    )
    .run();
}

/** Append and trim in one batch, so the table can't grow without bound. */
export async function logAndTrim(
  env: Env,
  e: Omit<LogEvent, "seq" | "ts">,
): Promise<void> {
  await log(env, e);
  await env.DB.prepare(
    `DELETE FROM events WHERE seq <= (
       SELECT MAX(seq) FROM events
     ) - ?`,
  )
    .bind(MAX_ROWS)
    .run();
}

export async function since(env: Env, seqNo: number): Promise<LogEvent[]> {
  const { results } = await env.DB.prepare(
    `SELECT seq, ts, level, job_id, phase, message, execution_id, tx_hash
       FROM events WHERE seq > ? ORDER BY seq ASC LIMIT 200`,
  )
    .bind(seqNo)
    .all<Record<string, unknown>>();

  return (results ?? []).map((r) => ({
    seq: Number(r.seq),
    ts: String(r.ts),
    level: r.level as EventLevel,
    jobId: (r.job_id as string) ?? undefined,
    phase: (r.phase as string) ?? undefined,
    message: String(r.message),
    executionId: (r.execution_id as string) ?? undefined,
    txHash: (r.tx_hash as string) ?? undefined,
  }));
}

export async function latestSeq(env: Env): Promise<number> {
  const row = await env.DB.prepare(`SELECT MAX(seq) AS s FROM events`).first<{
    s: number | null;
  }>();
  return row?.s ?? 0;
}
