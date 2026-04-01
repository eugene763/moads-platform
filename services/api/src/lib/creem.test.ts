import crypto from "node:crypto";

import {describe, expect, it} from "vitest";

import {
  extractCreemCheckoutCompletedSnapshot,
  extractCreemProductId,
  extractCreemWebhookEnvelope,
  isCreemConfigured,
  readCreemBillingOrderId,
  verifyCreemWebhookSignature,
} from "./creem.js";

describe("creem helpers", () => {
  it("extracts a product id from a raw value", () => {
    expect(extractCreemProductId("prod_01HV5Q5WXYZABC123")).toBe("prod_01HV5Q5WXYZABC123");
    expect(extractCreemProductId(" https://example.com/product ")).toBeNull();
    expect(extractCreemProductId("")).toBeNull();
  });

  it("detects when Creem runtime config is complete", () => {
    expect(isCreemConfigured({
      creemApiKey: "creem_live_123",
      creemWebhookSecret: "whsec_123",
      creemApiBaseUrl: "https://api.creem.io",
    })).toBe(true);

    expect(isCreemConfigured({
      creemApiKey: "creem_live_123",
      creemWebhookSecret: "",
      creemApiBaseUrl: "https://api.creem.io",
    })).toBe(false);
  });

  it("verifies webhook signatures against the raw request body", () => {
    const body = JSON.stringify({
      id: "evt_123",
      eventType: "checkout.completed",
    });
    const secret = "whsec_test_123";
    const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");

    expect(verifyCreemWebhookSignature(body, signature, secret)).toBe(true);
    expect(verifyCreemWebhookSignature(body, "deadbeef", secret)).toBe(false);
  });

  it("extracts the webhook envelope and checkout snapshot", () => {
    const payload = {
      id: "evt_123",
      eventType: "checkout.completed",
      object: {
        id: "chk_123",
        request_id: "order_local_123",
        status: "completed",
        mode: "test",
        metadata: {
          billingOrderId: "order_local_123",
        },
        product: {
          id: "prod_01HV5Q5WXYZABC123",
        },
        customer: {
          email: "buyer@example.com",
        },
        order: {
          id: "ord_987",
          status: "paid",
        },
      },
    };

    expect(extractCreemWebhookEnvelope(payload)).toEqual(expect.objectContaining({
      externalEventId: "evt_123",
      eventType: "checkout.completed",
    }));

    const snapshot = extractCreemCheckoutCompletedSnapshot(payload.object);
    expect(snapshot).toEqual(expect.objectContaining({
      checkoutId: "chk_123",
      requestId: "order_local_123",
      externalOrderId: "ord_987",
      externalProductId: "prod_01HV5Q5WXYZABC123",
      orderStatus: "paid",
      customerEmail: "buyer@example.com",
    }));

    expect(readCreemBillingOrderId(snapshot!)).toBe("order_local_123");
  });
});
