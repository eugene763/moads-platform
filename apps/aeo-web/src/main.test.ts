import {describe, expect, it} from "vitest";

import {aeoAppDescription} from "./main.js";

describe("aeo-web placeholder", () => {
  it("declares the aeo product code", () => {
    expect(aeoAppDescription.productCode).toBe("aeo");
  });
});
