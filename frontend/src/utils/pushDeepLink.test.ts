import { describe, expect, it } from "vitest";
import { deriveDeepLink } from "./pushDeepLink";

describe("deriveDeepLink", () => {
  it("maps type 'charge_received' to '/charges'", () => {
    expect(deriveDeepLink({ type: "charge_received" })).toBe("/charges");
  });

  it("maps type 'charge_accepted' to '/charges'", () => {
    expect(deriveDeepLink({ type: "charge_accepted" })).toBe("/charges");
  });

  it("maps type 'split_created' to '/transactions'", () => {
    expect(deriveDeepLink({ type: "split_created" })).toBe("/transactions");
  });

  it("maps type 'split_updated' to '/transactions'", () => {
    expect(deriveDeepLink({ type: "split_updated" })).toBe("/transactions");
  });

  it("falls back to entity_type 'charge' → '/charges' for unknown type", () => {
    expect(deriveDeepLink({ type: "unknown_event", entity_type: "charge" })).toBe("/charges");
  });

  it("falls back to entity_type 'transaction' → '/transactions' for unknown type", () => {
    expect(deriveDeepLink({ type: "unknown_event", entity_type: "transaction" })).toBe(
      "/transactions",
    );
  });

  it("returns '/' as safe default when both type and entity_type are unknown", () => {
    expect(deriveDeepLink({ type: "totally_unknown", entity_type: "other" })).toBe("/");
  });

  it("returns '/' as safe default when entity_type is absent and type is unknown", () => {
    expect(deriveDeepLink({ type: "totally_unknown" })).toBe("/");
  });
});
