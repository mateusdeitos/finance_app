import { test } from "node:test";
import { strict as assert } from "node:assert";
import { splitPercentagesToCents } from "./splitMath";
import type { Transactions } from "../types/transactions";

// --- Shared assertion helpers (apply D-T02-5 to every case) -----------------

function assertCentExactDistribution(
  amount: number,
  input: Transactions.SplitSetting[],
  out: Transactions.SplitSetting[],
) {
  // (1) output length matches input
  assert.equal(out.length, input.length, "output length must match input length");

  // (2) each row has exactly keys ['amount', 'connection_id'] — PAY-02 guard
  for (const row of out) {
    assert.deepEqual(
      Object.keys(row).sort(),
      ["amount", "connection_id"],
      `row keys must be exactly ['amount', 'connection_id'], got ${JSON.stringify(Object.keys(row).sort())}`,
    );
  }

  // (3) Σ output.amount === input amount — PAY-01 guard
  const sum = out.reduce((s, r) => s + (r.amount ?? 0), 0);
  assert.equal(sum, amount, `Σ out.amount must equal input amount (${amount}); got ${sum}`);

  // (4) last split absorbs remainder deterministically (amount - Σ previous)
  const expectedLast = amount - out.slice(0, -1).reduce((s, r) => s + (r.amount ?? 0), 0);
  assert.equal(
    out[out.length - 1].amount,
    expectedLast,
    "last split must absorb the rounding remainder",
  );
}

// --- Cases from CONTEXT.md §specifics (a)–(f) --------------------------------

test("splitPercentagesToCents — (a) 50/50 on 100 cents (even baseline)", () => {
  const input: Transactions.SplitSetting[] = [
    { connection_id: 1, percentage: 50 },
    { connection_id: 2, percentage: 50 },
  ];
  const out = splitPercentagesToCents(100, input);
  assertCentExactDistribution(100, input, out);
  assert.equal(out[0].amount, 50);
  assert.equal(out[1].amount, 50);
});

test("splitPercentagesToCents — (b) 30/70 on 101 cents (odd; last absorbs remainder)", () => {
  const input: Transactions.SplitSetting[] = [
    { connection_id: 1, percentage: 30 },
    { connection_id: 2, percentage: 70 },
  ];
  const out = splitPercentagesToCents(101, input);
  assertCentExactDistribution(101, input, out);
  // First split uses Math.round(101 * 30 / 100) = Math.round(30.3) = 30
  assert.equal(out[0].amount, 30);
  // Last split = 101 - 30 = 71 (NOT Math.round(101 * 70 / 100) = 71; happens to match
  // but the algorithm computes via remainder absorption, not naive rounding —
  // see case (d) where these diverge)
  assert.equal(out[1].amount, 71);
});

test("splitPercentagesToCents — (c) 33/33/34 on 100 cents (sum already matches)", () => {
  const input: Transactions.SplitSetting[] = [
    { connection_id: 1, percentage: 33 },
    { connection_id: 2, percentage: 33 },
    { connection_id: 3, percentage: 34 },
  ];
  const out = splitPercentagesToCents(100, input);
  assertCentExactDistribution(100, input, out);
  assert.equal(out[0].amount, 33);
  assert.equal(out[1].amount, 33);
  assert.equal(out[2].amount, 34);
});

test("splitPercentagesToCents — (d) 33/33/34 on 10001 cents (remainder=2 absorbed by last)", () => {
  const input: Transactions.SplitSetting[] = [
    { connection_id: 1, percentage: 33 },
    { connection_id: 2, percentage: 33 },
    { connection_id: 3, percentage: 34 },
  ];
  const out = splitPercentagesToCents(10001, input);
  assertCentExactDistribution(10001, input, out);
  // First two splits: Math.round(10001 * 33 / 100) = Math.round(3300.33) = 3300
  assert.equal(out[0].amount, 3300);
  assert.equal(out[1].amount, 3300);
  // Last split absorbs the remainder: 10001 - 3300 - 3300 = 3401
  // (naive Math.round(10001 * 34 / 100) = Math.round(3400.34) = 3400 — would drift by 1)
  assert.equal(out[2].amount, 3401);
});

test("splitPercentagesToCents — (e) 50/50 on 1 cent (degenerate; last absorbs)", () => {
  const input: Transactions.SplitSetting[] = [
    { connection_id: 1, percentage: 50 },
    { connection_id: 2, percentage: 50 },
  ];
  const out = splitPercentagesToCents(1, input);
  assertCentExactDistribution(1, input, out);
  // Math.round(1 * 50 / 100) = Math.round(0.5) = 1 in JS (ties-round-to-even is NOT
  // the default; JS rounds half-up away from zero for positive numbers via Math.round).
  // First = 1, Last = 1 - 1 = 0. Σ = 1.
  assert.equal(out[0].amount, 1);
  assert.equal(out[1].amount, 0);
});

test("splitPercentagesToCents — (f) single 100% split (no-op loop; last gets full amount)", () => {
  const input: Transactions.SplitSetting[] = [
    { connection_id: 1, percentage: 100 },
  ];
  const out = splitPercentagesToCents(5000, input);
  assertCentExactDistribution(5000, input, out);
  assert.equal(out[0].amount, 5000);
  assert.equal(out[0].connection_id, 1);
});
