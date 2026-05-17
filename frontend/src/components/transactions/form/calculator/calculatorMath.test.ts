import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  applyOperator,
  clampCents,
  MAX_CENTS,
  popDigit,
  pushDigit,
} from "./calculatorMath";

test("applyOperator — addition in cents", () => {
  assert.equal(applyOperator(100, "add", 23), 123);
});

test("applyOperator — subtraction allows negative results", () => {
  assert.equal(applyOperator(500, "sub", 1000), -500);
});

test("applyOperator — multiplication treats operands as money (10.00 x 3.00 = 30.00)", () => {
  assert.equal(applyOperator(1000, "mul", 300), 3000);
});

test("applyOperator — multiplication with cents (1.23 x 2.00 = 2.46)", () => {
  assert.equal(applyOperator(123, "mul", 200), 246);
});

test("applyOperator — division treats operands as money (6.00 / 3.00 = 2.00)", () => {
  assert.equal(applyOperator(600, "div", 300), 200);
});

test("applyOperator — division rounds to nearest cent (10.00 / 3.00)", () => {
  // round(1000 * 100 / 300) = round(333.33) = 333
  assert.equal(applyOperator(1000, "div", 300), 333);
});

test("applyOperator — division by zero returns the accumulator unchanged", () => {
  assert.equal(applyOperator(1234, "div", 0), 1234);
});

test("applyOperator — results are clamped to MAX_CENTS", () => {
  assert.equal(applyOperator(MAX_CENTS, "add", MAX_CENTS), MAX_CENTS);
  assert.equal(applyOperator(-MAX_CENTS, "sub", MAX_CENTS), -MAX_CENTS);
});

test("clampCents — limits to the representable range", () => {
  assert.equal(clampCents(MAX_CENTS + 1), MAX_CENTS);
  assert.equal(clampCents(-MAX_CENTS - 1), -MAX_CENTS);
  assert.equal(clampCents(500), 500);
});

test("pushDigit — appends a digit right-to-left", () => {
  assert.equal(pushDigit(0, 1), 1);
  assert.equal(pushDigit(1, 2), 12);
  assert.equal(pushDigit(12, 3), 123);
});

test("pushDigit — keeps the value unchanged on overflow", () => {
  assert.equal(pushDigit(MAX_CENTS, 9), MAX_CENTS);
});

test("popDigit — drops the rightmost digit down to zero", () => {
  assert.equal(popDigit(123), 12);
  assert.equal(popDigit(12), 1);
  assert.equal(popDigit(1), 0);
  assert.equal(popDigit(0), 0);
});
