import { describe, expect, test } from "vitest";
import { canDeleteTransaction } from "./transactionEligibility";

const ME = 1;
const PARTNER = 2;

describe("canDeleteTransaction", () => {
  test("author (original_user_id === me) is deletable", () => {
    expect(canDeleteTransaction({ user_id: ME, original_user_id: ME }, ME)).toBe(true);
  });

  test("ponta (original_user_id === partner, user_id === me) is deletable", () => {
    expect(canDeleteTransaction({ user_id: ME, original_user_id: PARTNER }, ME)).toBe(true);
  });

  test("original_user_id null/undefined is deletable", () => {
    expect(canDeleteTransaction({ user_id: ME }, ME)).toBe(true);
  });

  test("synthetic settlement row is not deletable", () => {
    expect(
      canDeleteTransaction({ user_id: ME, original_user_id: PARTNER, origin_settlement_id: 99 }, ME),
    ).toBe(false);
  });

  test("undefined transaction is not deletable", () => {
    expect(canDeleteTransaction(undefined, ME)).toBe(false);
  });

  test("truly unrelated row (neither owner nor author) is not deletable", () => {
    expect(canDeleteTransaction({ user_id: PARTNER, original_user_id: PARTNER }, ME)).toBe(false);
  });
});
