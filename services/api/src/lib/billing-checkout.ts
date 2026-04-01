import {
  BILLING_CREEM_PROVIDER_CODE,
  BILLING_FASTSPRING_PROVIDER_CODE,
  BillingOrderStatus,
  PlatformError,
  Prisma,
  createBillingCheckoutOrderDraft,
} from "@moads/db";
import {FastifyInstance} from "fastify";

import {
  createCreemCheckoutSession,
  extractCreemProductId,
  isCreemConfigured,
} from "./creem.js";
import {
  createFastSpringCheckoutSession,
  extractFastSpringProductPath,
  isFastSpringConfigured,
} from "./fastspring.js";

const ATTRIBUTION_MAX_LENGTH = 512;

interface CheckoutAttributionInput {
  capturedAtMs?: unknown;
  landingUrl?: unknown;
  referrer?: unknown;
  utm?: unknown;
  ids?: unknown;
}

function normalizeString(value: unknown, maxLength = ATTRIBUTION_MAX_LENGTH): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function normalizeStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, rawValue]) => {
    const normalized = normalizeString(rawValue);
    if (normalized) {
      acc[key] = normalized;
    }
    return acc;
  }, {});
}

export function normalizeCheckoutAttribution(value: unknown): Prisma.InputJsonValue | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const input = value as CheckoutAttributionInput;
  const payload: Record<string, unknown> = {};
  const capturedAtMs = Number(input.capturedAtMs);
  if (Number.isFinite(capturedAtMs) && capturedAtMs > 0) {
    payload.capturedAtMs = Math.floor(capturedAtMs);
  }

  const landingUrl = normalizeString(input.landingUrl, 1500);
  if (landingUrl) {
    payload.landingUrl = landingUrl;
  }

  const referrer = normalizeString(input.referrer, 1500);
  if (referrer) {
    payload.referrer = referrer;
  }

  const utm = normalizeStringMap(input.utm);
  if (Object.keys(utm).length > 0) {
    payload.utm = utm;
  }

  const ids = normalizeStringMap(input.ids);
  if (Object.keys(ids).length > 0) {
    payload.ids = ids;
  }

  return Object.keys(payload).length > 0 ? payload as Prisma.InputJsonValue : undefined;
}

function buildCheckoutTrackingFields(input: {
  orderId: string;
  accountId: string;
  productCode: string;
  priceId: string;
  userId?: string | null;
  firebaseUid?: string | null;
  email?: string | null;
  attribution: Prisma.InputJsonValue | undefined;
}): Record<string, string> {
  const tags: Record<string, string> = {
    billingOrderId: input.orderId,
    accountId: input.accountId,
    productCode: input.productCode,
    priceId: input.priceId,
  };

  const userId = normalizeString(input.userId);
  if (userId) {
    tags.userId = userId;
  }

  const firebaseUid = normalizeString(input.firebaseUid);
  if (firebaseUid) {
    tags.firebaseUid = firebaseUid;
  }

  const email = normalizeString(input.email);
  if (email) {
    tags.email = email;
  }

  const attribution = input.attribution && typeof input.attribution === "object" && !Array.isArray(input.attribution) ?
    input.attribution as Record<string, unknown> :
    {};
  const utm = normalizeStringMap(attribution.utm);
  const ids = normalizeStringMap(attribution.ids);

  const landingUrl = normalizeString(attribution.landingUrl, 1500);
  if (landingUrl) {
    tags.landingUrl = landingUrl;
  }

  const referrer = normalizeString(attribution.referrer, 1500);
  if (referrer) {
    tags.referrer = referrer;
  }

  Object.entries(utm).forEach(([key, value]) => {
    tags[`utm_${key}`] = value;
  });
  Object.entries(ids).forEach(([key, value]) => {
    tags[key] = value;
  });

  return tags;
}

function normalizeDirectRedirectUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

async function markCheckoutCreationFailed(
  app: FastifyInstance,
  input: {
    orderId: string;
    accountId: string;
    error: unknown;
  },
): Promise<void> {
  try {
    await app.prisma.$transaction(async (tx) => {
      await tx.billingOrder.update({
        where: {id: input.orderId},
        data: {
          status: BillingOrderStatus.FAILED,
        },
      });

      await tx.auditLog.create({
        data: {
          accountId: input.accountId,
          actionCode: "billing.checkout_order_failed",
          targetType: "billing_order",
          targetId: input.orderId,
          payloadJson: {
            message: input.error instanceof Error ? input.error.message : String(input.error),
          },
        },
      });
    });
  } catch {
    // no-op
  }
}

export async function createBillingCheckoutResponse(
  app: FastifyInstance,
  input: {
    accountId: string;
    productCode: string;
    priceId: string;
    userId?: string | null;
    firebaseUid?: string | null;
    email?: string | null;
    countryCode?: string | null;
    languageCode?: string | null;
    successUrl?: string | null;
    attribution: Prisma.InputJsonValue | undefined;
  },
) {
  const draft = await createBillingCheckoutOrderDraft(app.prisma, {
    accountId: input.accountId,
    productCode: input.productCode,
    priceId: input.priceId,
    ...(input.attribution !== undefined ? {attribution: input.attribution} : {}),
  });

  try {
    const providerCode = draft.providerCode?.trim().toLowerCase() ?? "";
    const checkoutTrackingFields = buildCheckoutTrackingFields({
      orderId: draft.orderId,
      accountId: input.accountId,
      productCode: input.productCode,
      priceId: input.priceId,
      userId: input.userId ?? null,
      firebaseUid: input.firebaseUid ?? null,
      email: input.email ?? null,
      attribution: input.attribution,
    });

    const hasCreemProduct = extractCreemProductId(draft.externalPriceId) != null;
    if (
      (providerCode === BILLING_CREEM_PROVIDER_CODE || (!providerCode && hasCreemProduct)) &&
      isCreemConfigured(app.config)
    ) {
      const session = await createCreemCheckoutSession(app.config, {
        productReference: draft.externalPriceId ?? "",
        requestId: draft.orderId,
        customerEmail: input.email ?? null,
        successUrl: input.successUrl ?? null,
        metadata: checkoutTrackingFields,
      });

      return {
        orderId: draft.orderId,
        status: draft.status,
        redirectUrl: session.redirectUrl,
        billingProductCode: draft.billingProductCode,
        creditsAmount: draft.creditsAmount,
        amountMinor: draft.amountMinor,
        currencyCode: draft.currencyCode,
      };
    }

    const hasFastSpringProduct = extractFastSpringProductPath(draft.externalPriceId) != null;
    if (
      (providerCode === BILLING_FASTSPRING_PROVIDER_CODE || (!providerCode && hasFastSpringProduct)) &&
      isFastSpringConfigured(app.config)
    ) {
      const session = await createFastSpringCheckoutSession(app.config, {
        priceReference: draft.externalPriceId ?? "",
        customerEmail: input.email ?? null,
        countryCode: input.countryCode ?? null,
        languageCode: input.languageCode ?? null,
        tags: checkoutTrackingFields,
      });

      return {
        orderId: draft.orderId,
        status: draft.status,
        redirectUrl: session.redirectUrl,
        billingProductCode: draft.billingProductCode,
        creditsAmount: draft.creditsAmount,
        amountMinor: draft.amountMinor,
        currencyCode: draft.currencyCode,
      };
    }

    const redirectUrl = normalizeDirectRedirectUrl(draft.externalPriceId);
    if (!redirectUrl) {
      throw new PlatformError(
        409,
        "billing_checkout_unavailable",
        "Checkout is not configured for this credit pack yet.",
      );
    }

    return {
      orderId: draft.orderId,
      status: draft.status,
      redirectUrl,
      billingProductCode: draft.billingProductCode,
      creditsAmount: draft.creditsAmount,
      amountMinor: draft.amountMinor,
      currencyCode: draft.currencyCode,
    };
  } catch (error) {
    await markCheckoutCreationFailed(app, {
      orderId: draft.orderId,
      accountId: input.accountId,
      error,
    });
    throw error;
  }
}
