import {describe, expect, it} from "vitest";

import {isAllowedOrigin} from "./app.js";

describe("isAllowedOrigin", () => {
  it("allows only explicit origins from the active profile", () => {
    const config = {
      allowedOrigins: ["https://trend.moads.agency"],
    };

    expect(isAllowedOrigin("https://trend.moads.agency", config)).toBe(true);
    expect(isAllowedOrigin("http://localhost:3000", config)).toBe(false);
  });

  it("allows requests without an origin header", () => {
    expect(isAllowedOrigin(undefined, {allowedOrigins: []})).toBe(true);
  });
});
