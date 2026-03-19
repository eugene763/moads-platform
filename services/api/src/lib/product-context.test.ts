import {describe, expect, it} from "vitest";

import {normalizeExternalHostForTest} from "./product-context.js";

describe("normalizeExternalHostForTest", () => {
  it("normalizes host-like values from origin headers", () => {
    expect(normalizeExternalHostForTest("https://trend.moads.agency")).toBe("trend.moads.agency");
    expect(normalizeExternalHostForTest("localhost:5173")).toBe("localhost");
  });
});
