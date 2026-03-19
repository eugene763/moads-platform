import {describe, expect, it} from "vitest";

import {PRODUCT_REALM_DEFAULTS} from "./index.js";

describe("product realm defaults", () => {
  it("keeps motrend in the consumer realm", () => {
    expect(PRODUCT_REALM_DEFAULTS.motrend).toBe("consumer");
  });
});
