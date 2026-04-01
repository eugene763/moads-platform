import {
  BillingCreditPackOffer,
  BILLING_CREEM_PROVIDER_CODE,
  BILLING_FASTSPRING_PROVIDER_CODE,
} from "@moads/db";

import {isCreemConfigured} from "./creem.js";
import {isFastSpringConfigured} from "./fastspring.js";
import {ApiConfig} from "../types.js";

type BillingCreditPackOfferWithProvider = BillingCreditPackOffer & {
  providerCode?: string | null;
};

export function maskUnavailableCheckoutOffers(
  config: Pick<ApiConfig,
    "fsApiUsername" |
    "fsApiPassword" |
    "fsStoreHost" |
    "creemApiKey" |
    "creemWebhookSecret" |
    "creemApiBaseUrl"
  >,
  offers: BillingCreditPackOfferWithProvider[],
): BillingCreditPackOfferWithProvider[] {
  const fastSpringReady = isFastSpringConfigured(config);
  const creemReady = isCreemConfigured(config);

  return offers.map((offer) => {
    return {
      ...offer,
      checkoutConfigured:
        offer.checkoutConfigured &&
        (offer.providerCode !== BILLING_FASTSPRING_PROVIDER_CODE || fastSpringReady) &&
        (offer.providerCode !== BILLING_CREEM_PROVIDER_CODE || creemReady),
    };
  });
}
