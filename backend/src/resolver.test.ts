import { test } from "node:test";
import assert from "node:assert/strict";
import { JobStatus } from "@recourse/shared";
import { decide } from "./resolver.js";

const MIN = 100_000_000n; // 100 USDC (6 decimals)
const DEADLINE = 2_000n; // arbitrary unix-ish seconds for tests

test("release: claimed, delta met, within deadline", () => {
  const d = decide({
    status: JobStatus.Claimed,
    minIncrease: MIN,
    deadline: DEADLINE,
    observedIncrease: MIN,
    nowSec: 1_000n,
  });
  assert.equal(d.action, "release");
});

test("wait: claimed, delta not yet met, within deadline", () => {
  const d = decide({
    status: JobStatus.Claimed,
    minIncrease: MIN,
    deadline: DEADLINE,
    observedIncrease: MIN - 1n,
    nowSec: 1_000n,
  });
  assert.equal(d.action, "wait");
});

test("refund: claimed, delta not met, past deadline", () => {
  const d = decide({
    status: JobStatus.Claimed,
    minIncrease: MIN,
    deadline: DEADLINE,
    observedIncrease: 0n,
    nowSec: DEADLINE + 1n,
  });
  assert.equal(d.action, "refund");
});

test("refund: delta met but deadline passed before release", () => {
  const d = decide({
    status: JobStatus.Claimed,
    minIncrease: MIN,
    deadline: DEADLINE,
    observedIncrease: MIN,
    nowSec: DEADLINE + 1n,
  });
  assert.equal(d.action, "refund");
  assert.match(d.reason, /deadline passed/);
});

test("refund: open (never claimed) but past deadline", () => {
  const d = decide({
    status: JobStatus.Open,
    minIncrease: MIN,
    deadline: DEADLINE,
    observedIncrease: 0n,
    nowSec: DEADLINE + 1n,
  });
  assert.equal(d.action, "refund");
});

test("wait: open, within deadline", () => {
  const d = decide({
    status: JobStatus.Open,
    minIncrease: MIN,
    deadline: DEADLINE,
    observedIncrease: 0n,
    nowSec: 1_000n,
  });
  assert.equal(d.action, "wait");
});

test("wait: already released", () => {
  const d = decide({
    status: JobStatus.Released,
    minIncrease: MIN,
    deadline: DEADLINE,
    observedIncrease: MIN,
    nowSec: 1_000n,
  });
  assert.equal(d.action, "wait");
  assert.match(d.reason, /settled/);
});

test("wait: already refunded even if past deadline", () => {
  const d = decide({
    status: JobStatus.Refunded,
    minIncrease: MIN,
    deadline: DEADLINE,
    observedIncrease: 0n,
    nowSec: DEADLINE + 1n,
  });
  assert.equal(d.action, "wait");
});

test("boundary: exactly at deadline still allows release", () => {
  const d = decide({
    status: JobStatus.Claimed,
    minIncrease: MIN,
    deadline: DEADLINE,
    observedIncrease: MIN,
    nowSec: DEADLINE, // == deadline, contract uses <=
  });
  assert.equal(d.action, "release");
});

/**
 * An Open job whose delta is satisfied still cannot pay out: release() reverts
 * unless the job is Claimed, because the payment goes to an agent and an
 * unclaimed job has none. This reads as a bug from the outside, so pin the
 * behaviour and the wording that explains it.
 */
test("delta met but never claimed: waits, then refunds naming the cause", () => {
  const met = {
    status: JobStatus.Open,
    minIncrease: MIN,
    deadline: DEADLINE,
    observedIncrease: MIN,
  };

  const before = decide({ ...met, nowSec: DEADLINE - 1n });
  assert.equal(before.action, "wait");
  assert.match(before.reason, /unclaimed/);

  const after = decide({ ...met, nowSec: DEADLINE + 1n });
  assert.equal(after.action, "refund");
  assert.match(after.reason, /no agent ever claimed/);
});

test("claimed but settled late refunds for a different, stated reason", () => {
  const late = decide({
    status: JobStatus.Claimed,
    minIncrease: MIN,
    deadline: DEADLINE,
    observedIncrease: MIN,
    nowSec: DEADLINE + 1n,
  });
  assert.equal(late.action, "refund");
  assert.match(late.reason, /deadline passed before release/);
});
