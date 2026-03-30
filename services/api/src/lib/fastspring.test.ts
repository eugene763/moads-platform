import {describe, expect, it} from "vitest";

import {
  buildFastSpringSessionUrl,
  extractFastSpringProductPath,
  extractFastSpringWebhookOrderIds,
  isFastSpringConfigured,
  readFastSpringBillingOrderId,
} from "./fastspring.js";

describe("fastspring helpers", () => {
  it("extracts a product path from a raw value or product page url", () => {
    expect(extractFastSpringProductPath("motrend-credits-30")).toBe("motrend-credits-30");
    expect(extractFastSpringProductPath("https://moads.onfastspring.com/motrend-credits-80")).toBe("motrend-credits-80");
    expect(extractFastSpringProductPath("https://moads.onfastspring.com/checkout?product=motrend-credits-200")).toBe("motrend-credits-200");
    expect(extractFastSpringProductPath("https://checkout.moads.agency/motrend/motrend_credits_starter")).toBeNull();
  });

  it("builds a session redirect url on the configured store host", () => {
    expect(buildFastSpringSessionUrl("moads.onfastspring.com", "abc123")).toBe(
      "https://moads.onfastspring.com/session/abc123",
    );
  });

  it("detects when FastSpring runtime config is complete", () => {
    expect(isFastSpringConfigured({
      fsApiUsername: "user",
      fsApiPassword: "pass",
      fsStoreHost: "moads.onfastspring.com",
    })).toBe(true);

    expect(isFastSpringConfigured({
      fsApiUsername: "user",
      fsApiPassword: "",
      fsStoreHost: "moads.onfastspring.com",
    })).toBe(false);
  });

  it("extracts order ids from direct and events payloads", () => {
    expect(extractFastSpringWebhookOrderIds({
      order: "ABC-123",
    })).toEqual(["ABC-123"]);

    expect(extractFastSpringWebhookOrderIds({
      events: [
        {data: {order: "ABC-123"}},
        {data: {id: "XYZ-456"}},
      ],
    })).toEqual(["ABC-123", "XYZ-456"]);
  });

  it("reads the local billing order id from webhook tags", () => {
    expect(readFastSpringBillingOrderId({
      billingOrderId: "order_local_123",
    })).toBe("order_local_123");
    expect(readFastSpringBillingOrderId({
      billing_order_id: "order_local_456",
    })).toBe("order_local_456");
    expect(readFastSpringBillingOrderId({})).toBeNull();
  });
});
