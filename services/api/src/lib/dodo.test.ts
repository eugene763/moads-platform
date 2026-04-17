import {describe, expect, it} from "vitest";

import {
  extractDodoProductId,
  isDodoCheckoutConfigured,
  isDodoWebhookConfigured,
  readDodoBillingOrderId,
  readDodoPaymentSucceededSnapshot,
} from "./dodo.js";

describe("dodo helpers", () => {
  it("recognizes checkout configuration when api key is present", () => {
    expect(isDodoCheckoutConfigured({dodoApiKey: undefined})).toBe(false);
    expect(isDodoCheckoutConfigured({dodoApiKey: "dodo_live_key"})).toBe(true);
  });

  it("recognizes webhook configuration when api key and webhook secret are present", () => {
    expect(isDodoWebhookConfigured({
      dodoApiKey: "dodo_live_key",
      dodoWebhookKey: undefined,
    })).toBe(false);
    expect(isDodoWebhookConfigured({
      dodoApiKey: "dodo_live_key",
      dodoWebhookKey: "whsec_live_key",
    })).toBe(true);
  });

  it("normalizes Dodo product ids", () => {
    expect(extractDodoProductId(" pdt_123 ")).toBe("pdt_123");
    expect(extractDodoProductId("")).toBe(null);
    expect(extractDodoProductId(undefined)).toBe(null);
  });

  it("extracts payment.succeeded snapshot details", () => {
    const snapshot = readDodoPaymentSucceededSnapshot({
      type: "payment.succeeded",
      timestamp: "2026-04-02T10:00:00.000Z",
      business_id: "biz_123",
      data: {
        payment_id: "pay_123",
        currency: "USD",
        total_amount: 499,
        status: "succeeded",
        checkout_session_id: "chk_123",
        customer: {
          email: "buyer@example.com",
        },
        metadata: {
          billingOrderId: "order_123",
        },
        product_cart: [
          {product_id: "pdt_starter", quantity: 1},
        ],
      },
    }, {
      "webhook-id": "evt_123",
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot).toEqual(expect.objectContaining({
      eventId: "evt_123",
      eventType: "payment.succeeded",
      externalOrderId: "pay_123",
      businessId: "biz_123",
      currencyCode: "USD",
      totalAmountMinor: 499,
      status: "succeeded",
      checkoutSessionId: "chk_123",
      customerEmail: "buyer@example.com",
      productIds: ["pdt_starter"],
      metadata: {
        billingOrderId: "order_123",
      },
    }));
  });

  it("returns null for non-payment-succeeded events", () => {
    expect(readDodoPaymentSucceededSnapshot({
      type: "payment.failed",
    }, {})).toBeNull();
  });

  it("reads local billing order id from common metadata keys", () => {
    expect(readDodoBillingOrderId({
      billingOrderId: "ord_123",
    })).toBe("ord_123");
    expect(readDodoBillingOrderId({
      moads_billing_order_id: "ord_456",
    })).toBe("ord_456");
    expect(readDodoBillingOrderId({})).toBeNull();
  });
});
