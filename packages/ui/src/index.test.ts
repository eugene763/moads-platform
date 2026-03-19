import {describe, expect, it} from "vitest";

import {platformCopy} from "./index.js";

describe("ui copy", () => {
  it("reinforces separate product UX", () => {
    expect(platformCopy.productsStaySeparate).toContain("separate");
  });
});
