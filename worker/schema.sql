-- Event log for the Worker runtime.
--
-- Observability only: nothing in this table decides a settlement. The Node
-- backend keeps the same data in memory; here it must be durable because
-- isolates are ephemeral and would each hold a different history.

CREATE TABLE IF NOT EXISTS events (
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           TEXT    NOT NULL,
  level        TEXT    NOT NULL,
  job_id       TEXT,
  phase        TEXT,
  message      TEXT    NOT NULL,
  execution_id TEXT,
  tx_hash      TEXT
);

-- The UI tails with "seq > ?", so that ordering is the access pattern.
CREATE INDEX IF NOT EXISTS idx_events_seq ON events (seq);
