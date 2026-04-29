import {
  BillingCreditPackOffer,
  BILLING_DODO_PROVIDER_CODE,
} from "@moads/db";

import {isDodoCheckoutConfigured} from "./dodo.js";
import {ApiConfig} from "../types.js";

type BillingCreditPackOfferWithProvider = BillingCreditPackOffer & {
  providerCode?: string | null;
};

export function maskUnavailableCheckoutOffers(
  config: Pick<ApiConfig, "dodoApiKey">,
  offers: BillingCreditPackOfferWithProvider[],
): BillingCreditPackOfferWithProvider[] {
  const dodoReady = isDodoCheckoutConfigured(config);

  return offers.map((offer) => {
    return {
      ...offer,
      checkoutConfigured:
        offer.checkoutConfigured &&
        (offer.providerCode !== BILLING_DODO_PROVIDER_CODE || dodoReady),
    };
  });
}
