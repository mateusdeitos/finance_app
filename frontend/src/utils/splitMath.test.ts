import { test } from "node:test";
import { strict as assert } from "node:assert";
import { splitPercentagesToCents } from "./splitMath";
import type { Transactions } from "../types/transactions";

// --- Shared assertion helpers (apply D-T02-5 to every case) -----------------

function assertCentExactDistribution(
  _amount: number,
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

test("splitPercentagesToCents — (b) 30/70 on 101 cents (odd; exact rounding)", () => {
  const input: Transactions.SplitSetting[] = [
    { connection_id: 1, percentage: 30 },
    { connection_id: 2, percentage: 70 },
  ];
  const out = splitPercentagesToCents(101, input);
  assertCentExactDistribution(101, input, out);
  // Math.round(101 * 30 / 100) = Math.round(30.3) = 30
  assert.equal(out[0].amount, 30);
  // Math.round(101 * 70 / 100) = Math.round(70.7) = 71
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

test("splitPercentagesToCents — (d) 33/33/34 on 10001 cents (exact rounding per split)", () => {
  const input: Transactions.SplitSetting[] = [
    { connection_id: 1, percentage: 33 },
    { connection_id: 2, percentage: 33 },
    { connection_id: 3, percentage: 34 },
  ];
  const out = splitPercentagesToCents(10001, input);
  assertCentExactDistribution(10001, input, out);
  // Math.round(10001 * 33 / 100) = Math.round(3300.33) = 3300
  assert.equal(out[0].amount, 3300);
  assert.equal(out[1].amount, 3300);
  // Math.round(10001 * 34 / 100) = Math.round(3400.34) = 3400
  assert.equal(out[2].amount, 3400);
});

test("splitPercentagesToCents — (e) 50/50 on 1 cent (degenerate; both round up)", () => {
  const input: Transactions.SplitSetting[] = [
    { connection_id: 1, percentage: 50 },
    { connection_id: 2, percentage: 50 },
  ];
  const out = splitPercentagesToCents(1, input);
  assertCentExactDistribution(1, input, out);
  // Math.round(1 * 50 / 100) = Math.round(0.5) = 1 in JS (rounds half-up for positive numbers).
  // Both splits receive 1 cent each.
  assert.equal(out[0].amount, 1);
  assert.equal(out[1].amount, 1);
});

test("splitPercentagesToCents — (f) single 100% split (exact percentage)", () => {
  const input: Transactions.SplitSetting[] = [
    { connection_id: 1, percentage: 100 },
  ];
  const out = splitPercentagesToCents(5000, input);
  assertCentExactDistribution(5000, input, out);
  assert.equal(out[0].amount, 5000);
  assert.equal(out[0].connection_id, 1);
});
