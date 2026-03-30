import {describe, expect, it} from "vitest";

import {
  buildCreditPackScopeRef,
  parseCreditPackScopeRef,
} from "./billing.js";

describe("billing credit-pack scope helpers", () => {
  it("parses a valid product+credits scope ref", () => {
    expect(parseCreditPackScopeRef("motrend:120")).toEqual({
      productCode: "motrend",
      creditsAmount: 120,
    });
  });

  it("rejects malformed scope refs", () => {
    expect(parseCreditPackScopeRef("")).toBeNull();
    expect(parseCreditPackScopeRef("motrend")).toBeNull();
    expect(parseCreditPackScopeRef("motrend:nope")).toBeNull();
    expect(parseCreditPackScopeRef("motrend:-1")).toBeNull();
  });

  it("builds a normalized scope ref", () => {
    expect(buildCreditPackScopeRef("MoTrend", 50)).toBe("motrend:50");
  });
});
