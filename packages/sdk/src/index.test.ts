import {describe, expect, it} from "vitest";

import {shouldShowGiftNotice} from "./index.js";

describe("gift notice helper", () => {
  it("shows the notice only when the backend granted credits", () => {
    expect(shouldShowGiftNotice({grantedTestCredits: true})).toBe(true);
    expect(shouldShowGiftNotice({grantedTestCredits: false})).toBe(false);
  });
});
