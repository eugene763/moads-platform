import {describe, expect, it} from "vitest";

import {MOTREND_TEST_BOOTSTRAP_CREDITS, MOTREND_TEST_BOOTSTRAP_REASON} from "./wallet.js";

describe("motrend bootstrap grant constants", () => {
  it("keep the temporary test credit amount at 20", () => {
    expect(MOTREND_TEST_BOOTSTRAP_CREDITS).toBe(20);
    expect(MOTREND_TEST_BOOTSTRAP_REASON).toBe("motrend_test_bootstrap");
  });
});
