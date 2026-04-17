import {describe, expect, it} from "vitest";

import {
  DEFAULT_MOTREND_CREDIT_PACKS,
  DEFAULT_TEST_MOTREND_CREDIT_PACKS,
  getDefaultMotrendCreditPacks,
} from "./motrend-billing.js";
import {MOTREND_TEST_BOOTSTRAP_CREDITS, MOTREND_TEST_BOOTSTRAP_REASON} from "./wallet.js";

describe("motrend bootstrap grant constants", () => {
  it("keep the temporary test credit amount at 3", () => {
    expect(MOTREND_TEST_BOOTSTRAP_CREDITS).toBe(3);
    expect(MOTREND_TEST_BOOTSTRAP_REASON).toBe("motrend_test_bootstrap");
  });
});

describe("motrend credit pack defaults", () => {
  it("keeps live mode packs on the production ids", () => {
    expect(getDefaultMotrendCreditPacks("live_mode")).toEqual(DEFAULT_MOTREND_CREDIT_PACKS);
    expect(DEFAULT_MOTREND_CREDIT_PACKS.map((pack) => pack.dodoProductId)).toEqual([
      "pdt_0NbveLQCLSD2Mooo7VM4P",
      "pdt_0NbveJet1CbAWPjsr6eRw",
      "pdt_0NbveKvRWgGzOx2H7hrdc",
    ]);
  });

  it("switches test mode packs to the test product ids", () => {
    expect(getDefaultMotrendCreditPacks("test_mode")).toEqual(DEFAULT_TEST_MOTREND_CREDIT_PACKS);
    expect(DEFAULT_TEST_MOTREND_CREDIT_PACKS.map((pack) => pack.dodoProductId)).toEqual([
      "pdt_0Nbn3AengyfOHAGPiGibQ",
      "pdt_0Nbn3kZhICn5HGrxLBvSx",
      "pdt_0Nbn40LuSVJ47oKbWRsSd",
    ]);
  });
});
