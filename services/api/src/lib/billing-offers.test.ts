import {describe, expect, it} from "vitest";

import {maskUnavailableCheckoutOffers} from "./billing-offers.js";

describe("maskUnavailableCheckoutOffers", () => {
  it("keeps direct checkout-link packs available", () => {
    const masked = maskUnavailableCheckoutOffers({
      dodoApiKey: undefined,
    }, [
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
        billingProductCode: "legacy_pack",
        checkoutConfigured: true,
      }),
    ]);
  });

  it("disables Dodo packs when runtime config is incomplete", () => {
    const masked = maskUnavailableCheckoutOffers({
      dodoApiKey: undefined,
    }, [
      {
        billingProductId: "prod_3",
        billingProductCode: "aeo_pack_s",
        priceId: "price_3",
        name: "Pack S",
        creditsAmount: 30,
        amountMinor: 499,
        currencyCode: "USD",
        marketCode: "global",
        languageCode: "en",
        checkoutConfigured: true,
        providerCode: "dodo",
      },
    ]);

    expect(masked[0]).toEqual(expect.objectContaining({
      billingProductCode: "aeo_pack_s",
      checkoutConfigured: false,
    }));
  });

  it("keeps Dodo packs available when runtime config is complete", () => {
    const masked = maskUnavailableCheckoutOffers({
      dodoApiKey: "dodo_live_key",
    }, [
      {
        billingProductId: "prod_4",
        billingProductCode: "aeo_pack_m",
        priceId: "price_4",
        name: "Pack M",
        creditsAmount: 80,
        amountMinor: 999,
        currencyCode: "USD",
        marketCode: "global",
        languageCode: "en",
        checkoutConfigured: true,
        providerCode: "dodo",
      },
    ]);

    expect(masked[0]).toEqual(expect.objectContaining({
      billingProductCode: "aeo_pack_m",
      checkoutConfigured: true,
    }));
  });
});
