import {
  BillingCreditPackOffer,
  BILLING_DODO_PROVIDER_CODE,
  BILLING_FASTSPRING_PROVIDER_CODE,
} from "@moads/db";

import {isDodoCheckoutConfigured} from "./dodo.js";
import {isFastSpringConfigured} from "./fastspring.js";
import {ApiConfig} from "../types.js";

type BillingCreditPackOfferWithProvider = BillingCreditPackOffer & {
  providerCode?: string | null;
};

export function maskUnavailableCheckoutOffers(
  config: Pick<ApiConfig, "fsApiUsername" | "fsApiPassword" | "fsStoreHost" | "dodoApiKey">,
  offers: BillingCreditPackOfferWithProvider[],
): BillingCreditPackOfferWithProvider[] {
  const fastSpringReady = isFastSpringConfigured(config);
  const dodoReady = isDodoCheckoutConfigured(config);

  return offers.map((offer) => {
    return {
      ...offer,
      checkoutConfigured:
        offer.checkoutConfigured &&
        (
          (offer.providerCode !== BILLING_FASTSPRING_PROVIDER_CODE || fastSpringReady) &&
          (offer.providerCode !== BILLING_DODO_PROVIDER_CODE || dodoReady)
        ),
    };
  });
}
