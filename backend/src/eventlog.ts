/**
 * In-memory event log. Every step the backend takes on behalf of the UI is
 * appended here, and the frontend tails it via GET /events?since=<seq>.
 *
 * Deliberately not persisted: it is an observability surface for the demo, not
 * a source of truth. Chain state is the source of truth — that distinction is
 * the whole product, so nothing here is ever used to decide a settlement.
 */

export type EventLevel = "info" | "success" | "warn" | "error";

export interface LogEvent {
  seq: number;
  ts: string;
  level: EventLevel;
  /** Which job this concerns, if any. */
  jobId?: string;
  /** Short phase label, e.g. "post", "work", "resolve". */
  phase?: string;
  message: string;
  /** KeeperHub execution this step produced, if any. */
  executionId?: string;
  txHash?: string;
}

const MAX_EVENTS = 500;
const events: LogEvent[] = [];
let seq = 0;

export function log(e: Omit<LogEvent, "seq" | "ts">): LogEvent {
  const event: LogEvent = { ...e, seq: ++seq, ts: new Date().toISOString() };
  events.push(event);
  if (events.length > MAX_EVENTS) events.shift();
  // Mirror to stdout so the terminal and the UI tell the same story.
  const tag = event.jobId ? `job#${event.jobId}` : "-";
  console.log(`[${event.level}] ${tag} ${event.phase ?? ""} ${event.message}`);
  return event;
}

/** Events with seq > since, oldest first. */
export function since(seqNo: number): LogEvent[] {
  return events.filter((e) => e.seq > seqNo);
}

export function latestSeq(): number {
  return seq;
}
