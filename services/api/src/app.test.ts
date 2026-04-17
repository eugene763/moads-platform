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

  it("accepts wildcard preview-host origins when they are explicitly allowed", () => {
    const config = {
      allowedOrigins: ["https://*.web.app", "https://*.firebaseapp.com"],
    };

    expect(isAllowedOrigin("https://gen-lang-client-0651837818.web.app", config)).toBe(true);
    expect(isAllowedOrigin("https://qa-motrend--gen-lang-client-0651837818.web.app", config)).toBe(true);
    expect(isAllowedOrigin("https://gen-lang-client-0651837818.firebaseapp.com", config)).toBe(true);
    expect(isAllowedOrigin("https://trend.moads.agency", config)).toBe(false);
  });
});
