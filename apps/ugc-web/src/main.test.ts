import {describe, expect, it} from "vitest";

import {ugcAppDescription} from "./main.js";

describe("ugc-web placeholder", () => {
  it("keeps ugc discoverable as a separate product", () => {
    expect(ugcAppDescription.productCode).toBe("ugc");
  });
});
