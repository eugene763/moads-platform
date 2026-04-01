import {describe, expect, it} from "vitest";

import {maskUnavailableCheckoutOffers} from "./billing-offers.js";

describe("maskUnavailableCheckoutOffers", () => {
  it("disables FastSpring packs when runtime config is incomplete", () => {
    const masked = maskUnavailableCheckoutOffers({
      fsApiUsername: undefined,
      fsApiPassword: undefined,
      fsStoreHost: undefined,
      creemApiKey: undefined,
      creemWebhookSecret: undefined,
      creemApiBaseUrl: "https://test-api.creem.io",
    }, [
      {
        billingProductId: "prod_1",
        billingProductCode: "motrend_credits_starter",
        priceId: "price_1",
        name: "Starter",
        creditsAmount: 30,
        amountMinor: 499,
        currencyCode: "USD",
        marketCode: "global",
        languageCode: "en",
        checkoutConfigured: true,
        providerCode: "fastspring",
      },
      {
        billingProductId: "prod_2",
        billingProductCode: "legacy_pack",
        priceId: "price_2",
        name: "Legacy",
        creditsAmount: 10,
        amountMinor: 199,
        currencyCode: "USD",
        marketCode: "global",
        languageCode: "en",
        checkoutConfigured: true,
        providerCode: "checkout_link",
      },
    ]);

    expect(masked).toEqual([
      expect.objectContaining({
        billingProductCode: "motrend_credits_starter",
        checkoutConfigured: false,
      }),
      expect.objectContaining({
        billingProductCode: "legacy_pack",
        checkoutConfigured: true,
      }),
    ]);
  });

  it("keeps FastSpring packs available when runtime config is complete", () => {
    const masked = maskUnavailableCheckoutOffers({
      fsApiUsername: "user",
      fsApiPassword: "pass",
      fsStoreHost: "moads.onfastspring.com",
      creemApiKey: undefined,
      creemWebhookSecret: undefined,
      creemApiBaseUrl: "https://test-api.creem.io",
    }, [
      {
        billingProductId: "prod_1",
        billingProductCode: "motrend_credits_pro",
        priceId: "price_1",
        name: "Pro",
        creditsAmount: 200,
        amountMinor: 1999,
        currencyCode: "USD",
        marketCode: "global",
        languageCode: "en",
        checkoutConfigured: true,
        providerCode: "fastspring",
      },
    ]);

    expect(masked[0]).toEqual(expect.objectContaining({
      billingProductCode: "motrend_credits_pro",
      checkoutConfigured: true,
    }));
  });

  it("disables Creem packs when runtime config is incomplete", () => {
    const masked = maskUnavailableCheckoutOffers({
      fsApiUsername: undefined,
      fsApiPassword: undefined,
      fsStoreHost: undefined,
      creemApiKey: "creem_test_key",
      creemWebhookSecret: undefined,
      creemApiBaseUrl: "https://test-api.creem.io",
    }, [
      {
        billingProductId: "prod_1",
        billingProductCode: "motrend_credits_creator",
        priceId: "price_1",
        name: "Creator",
        creditsAmount: 80,
        amountMinor: 999,
        currencyCode: "USD",
        marketCode: "global",
        languageCode: "en",
        checkoutConfigured: true,
        providerCode: "creem",
      },
    ]);

    expect(masked[0]).toEqual(expect.objectContaining({
      billingProductCode: "motrend_credits_creator",
      checkoutConfigured: false,
    }));
  });

  it("keeps Creem packs available when runtime config is complete", () => {
    const masked = maskUnavailableCheckoutOffers({
      fsApiUsername: undefined,
      fsApiPassword: undefined,
      fsStoreHost: undefined,
      creemApiKey: "creem_live_key",
      creemWebhookSecret: "whsec_test",
      creemApiBaseUrl: "https://api.creem.io",
    }, [
      {
        billingProductId: "prod_1",
        billingProductCode: "motrend_credits_starter",
        priceId: "price_1",
        name: "Starter",
        creditsAmount: 30,
        amountMinor: 499,
        currencyCode: "USD",
        marketCode: "global",
        languageCode: "en",
        checkoutConfigured: true,
        providerCode: "creem",
      },
    ]);

    expect(masked[0]).toEqual(expect.objectContaining({
      billingProductCode: "motrend_credits_starter",
      checkoutConfigured: true,
    }));
  });
});
