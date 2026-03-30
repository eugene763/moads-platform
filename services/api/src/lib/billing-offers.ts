import {BillingCreditPackOffer, BILLING_FASTSPRING_PROVIDER_CODE} from "@moads/db";

import {isFastSpringConfigured} from "./fastspring.js";
import {ApiConfig} from "../types.js";

type BillingCreditPackOfferWithProvider = BillingCreditPackOffer & {
  providerCode?: string | null;
};

export function maskUnavailableCheckoutOffers(
  config: Pick<ApiConfig, "fsApiUsername" | "fsApiPassword" | "fsStoreHost">,
  offers: BillingCreditPackOfferWithProvider[],
): BillingCreditPackOfferWithProvider[] {
  const fastSpringReady = isFastSpringConfigured(config);

  return offers.map((offer) => {
    return {
      ...offer,
      checkoutConfigured:
        offer.checkoutConfigured &&
        (offer.providerCode !== BILLING_FASTSPRING_PROVIDER_CODE || fastSpringReady),
    };
  });
}
