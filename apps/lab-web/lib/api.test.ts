import {describe, expect, it} from "vitest";

import {API_BASE_URL} from "./api";

describe("lab api config", () => {
  it("provides an api base url", () => {
    expect(API_BASE_URL.length).toBeGreaterThan(0);
  });
});
