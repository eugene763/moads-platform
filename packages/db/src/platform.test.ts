import {describe, expect, it} from "vitest";

import {AEO_KEY_PAGE_SITE_SCAN_CREDIT_COST} from "./aeo.js";
import {MOTREND_TEST_BOOTSTRAP_CREDITS, MOTREND_TEST_BOOTSTRAP_REASON} from "./wallet.js";

describe("motrend bootstrap grant constants", () => {
  it("keep the temporary test credit amount at 3", () => {
    expect(MOTREND_TEST_BOOTSTRAP_CREDITS).toBe(3);
    expect(MOTREND_TEST_BOOTSTRAP_REASON).toBe("motrend_test_bootstrap");
  });
});

describe("aeo key-page site scan cost", () => {
  it("keeps the MVP cost at 1 credit", () => {
    expect(AEO_KEY_PAGE_SITE_SCAN_CREDIT_COST).toBe(1);
  });
});
