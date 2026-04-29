import {describe, expect, it} from "vitest";

import {AEO_KEY_PAGE_SITE_SCAN_CREDIT_COST} from "./aeo.js";
import {AEO_WELCOME_CREDITS, AEO_WELCOME_REASON, MOTREND_TEST_BOOTSTRAP_CREDITS, MOTREND_TEST_BOOTSTRAP_REASON} from "./wallet.js";

describe("motrend bootstrap grant constants", () => {
  it("keep the temporary test credit amount at 3", () => {
    expect(MOTREND_TEST_BOOTSTRAP_CREDITS).toBe(3);
    expect(MOTREND_TEST_BOOTSTRAP_REASON).toBe("motrend_test_bootstrap");
  });
});

describe("aeo deep site scan cost", () => {
  it("keeps the MVP cost at 1 credit", () => {
    expect(AEO_KEY_PAGE_SITE_SCAN_CREDIT_COST).toBe(1);
  });
});

describe("aeo welcome grant constants", () => {
  it("keeps first activation at 1 credit", () => {
    expect(AEO_WELCOME_CREDITS).toBe(1);
    expect(AEO_WELCOME_REASON).toBe("aeo_welcome_grant");
  });
});
