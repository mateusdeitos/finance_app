/** Mirrors the private MAX_CENTS in CurrencyInput.tsx — R$ 99.999.999,99. */
export const MAX_CENTS = 9_999_999_999;

export type Operator = "add" | "sub" | "mul" | "div";

/** Clamps a cent amount to the representable range, keeping the sign. */
export function clampCents(n: number): number {
  return Math.max(-MAX_CENTS, Math.min(MAX_CENTS, n));
}

/**
 * Applies an operator to two cent amounts. Both operands are money values
 * (2-decimal cents), so multiplication and division divide/multiply by 100 to
 * keep the result in cents. Division by zero returns `a` unchanged (no NaN).
 */
export function applyOperator(a: number, op: Operator, b: number): number {
  switch (op) {
    case "add":
      return clampCents(a + b);
    case "sub":
      return clampCents(a - b);
    case "mul":
      return clampCents(Math.round((a * b) / 100));
    case "div":
      return b === 0 ? a : clampCents(Math.round((a * 100) / b));
  }
}

/**
 * Appends a digit to an unsigned cent amount (right-to-left entry, like
 * CurrencyInput). Returns the value unchanged when the result would overflow.
 */
export function pushDigit(abs: number, digit: number): number {
  const next = abs * 10 + digit;
  return next <= MAX_CENTS ? next : abs;
}

/** Drops the rightmost digit of an unsigned cent amount. */
export function popDigit(abs: number): number {
  return Math.floor(abs / 10);
}
