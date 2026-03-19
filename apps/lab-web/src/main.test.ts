import {describe, expect, it} from "vitest";

import {labAppDescription} from "./main.js";

describe("lab-web placeholder", () => {
  it("declares lab as a pro storefront", () => {
    expect(labAppDescription.productCode).toBe("lab");
    expect(labAppDescription.role).toContain("account center");
  });
});
