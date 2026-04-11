import DodoPayments from "dodopayments";

import {PlatformError} from "@moads/db";

import {ApiConfig} from "../types.js";

interface JsonObject {
  [key: string]: unknown;
}

interface DodoSdkErrorLike {
  status?: unknown;
  response?: {
    status?: unknown;
    data?: unknown;
  };
  message?: unknown;
}

interface DodoPaymentRecord {
  payment_id?: unknown;
  currency?: unknown;
  total_amount?: unknown;
  status?: unknown;
  checkout_session_id?: unknown;
  payment_link?: unknown;
  metadata?: unknown;
  customer?: unknown;
  product_cart?: unknown;
}

export interface DodoCheckoutSessionInput {
  productId: string;
  customerEmail?: string | null;
  returnUrl?: string | null;
  metadata?: Record<string, string>;
}

export interface DodoCheckoutSession {
  sessionId: string;
  redirectUrl: string;
  raw: unknown;
}

export interface DodoPaymentSucceededSnapshot {
  eventId: string;
  eventType: "payment.succeeded";
  timestamp: string | null;
  businessId: string | null;
  externalOrderId: string;
  currencyCode: string | null;
  totalAmountMinor: number | null;
  status: string | null;
  checkoutSessionId: string | null;
  customerEmail: string | null;
  metadata: Record<string, string>;
  productIds: string[];
  raw: unknown;
}

function readJsonObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as JsonObject;
}

function readJsonString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function readStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value as JsonObject).reduce<Record<string, string>>((acc, [key, raw]) => {
    const normalized = readJsonString(raw);
    if (normalized) {
      acc[key] = normalized;
    }
    return acc;
  }, {});
}

function readErrorStatus(value: unknown): number | null {
  const status = Number(value);
  return Number.isFinite(status) && status > 0 ? Math.floor(status) : null;
}

function readDodoErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const sdkError = error as DodoSdkErrorLike;
  const responseData = readJsonObject(sdkError.response?.data);
  const candidate = readJsonString(responseData.message) ||
    readJsonString(responseData.error) ||
    readJsonString(sdkError.message);

  return candidate || null;
}

function normalizeDodoProductId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function readWebhookHeader(headers: Record<string, unknown>, key: string): string | null {
  const rawValue = headers[key];

  if (typeof rawValue === "string") {
    return readJsonString(rawValue);
  }

  if (Array.isArray(rawValue) && typeof rawValue[0] === "string") {
    return readJsonString(rawValue[0]);
  }

  return null;
}

function buildDodoClient(config: Pick<ApiConfig, "dodoApiKey" | "dodoEnvironment" | "dodoBaseUrl">): DodoPayments {
  const bearerToken = readJsonString(config.dodoApiKey);
  if (!bearerToken) {
    throw new PlatformError(409, "billing_checkout_unavailable", "Dodo checkout is not configured.");
  }

  if (config.dodoBaseUrl) {
    return new DodoPayments({
      bearerToken,
      baseURL: config.dodoBaseUrl,
    });
  }

  return new DodoPayments({
    bearerToken,
    environment: config.dodoEnvironment,
  });
}

export function isDodoCheckoutConfigured(config: Pick<ApiConfig, "dodoApiKey">): boolean {
  return Boolean(readJsonString(config.dodoApiKey));
}

export function isDodoWebhookConfigured(config: Pick<ApiConfig, "dodoApiKey" | "dodoWebhookKey">): boolean {
  return Boolean(readJsonString(config.dodoApiKey) && readJsonString(config.dodoWebhookKey));
}

export function extractDodoProductId(value: string | null | undefined): string | null {
  return normalizeDodoProductId(value);
}

export async function createDodoCheckoutSession(
  config: Pick<ApiConfig, "dodoApiKey" | "dodoEnvironment" | "dodoBaseUrl">,
  input: DodoCheckoutSessionInput,
): Promise<DodoCheckoutSession> {
  const productId = normalizeDodoProductId(input.productId);
  if (!productId) {
    throw new PlatformError(409, "billing_checkout_unavailable", "Checkout is not configured for this credit pack yet.");
  }

  const client = buildDodoClient(config);
  const metadata = readStringMap(input.metadata);
  const customerEmail = readJsonString(input.customerEmail);
  const returnUrl = readJsonString(input.returnUrl);

  let response;
  try {
    response = await client.checkoutSessions.create({
      product_cart: [
        {
          product_id: productId,
          quantity: 1,
        },
      ],
      minimal_address: true,
      ...(customerEmail ? {customer: {email: customerEmail}} : {}),
      ...(Object.keys(metadata).length > 0 ? {metadata} : {}),
      ...(returnUrl ? {return_url: returnUrl, cancel_url: returnUrl} : {}),
    });
  } catch (error) {
    const sdkError = error as DodoSdkErrorLike;
    const status = readErrorStatus(sdkError.response?.status) ?? readErrorStatus(sdkError.status);
    const message = readDodoErrorMessage(error) || "Dodo checkout session creation failed.";

    if (status === 400 || status === 422) {
      throw new PlatformError(409, "billing_checkout_unavailable", message);
    }

    if (status === 401 || status === 403) {
      throw new PlatformError(503, "billing_provider_unavailable", message);
    }

    throw new PlatformError(502, "billing_provider_invalid_response", message);
  }

  const sessionId = readJsonString((response as {session_id?: unknown}).session_id);
  const checkoutUrl = readJsonString((response as {checkout_url?: unknown}).checkout_url);
  if (!sessionId || !checkoutUrl) {
    throw new PlatformError(502, "billing_provider_invalid_response", "Dodo checkout response is invalid.");
  }

  return {
    sessionId,
    redirectUrl: checkoutUrl,
    raw: response,
  };
}

function readWebhookHeaders(headers: Record<string, unknown>): Record<string, string> {
  const allowedHeaders = ["webhook-id", "webhook-signature", "webhook-timestamp"];

  return allowedHeaders.reduce<Record<string, string>>((acc, key) => {
    const value = readWebhookHeader(headers, key);
    if (value) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

export function unwrapDodoWebhook(
  config: Pick<ApiConfig, "dodoApiKey" | "dodoWebhookKey" | "dodoEnvironment" | "dodoBaseUrl">,
  input: {
    rawBody: string;
    headers: Record<string, unknown>;
  },
): unknown {
  const webhookKey = readJsonString(config.dodoWebhookKey);
  if (!isDodoWebhookConfigured(config) || !webhookKey) {
    throw new PlatformError(503, "billing_provider_unavailable", "Dodo webhook processing is not configured.");
  }

  const rawBody = readJsonString(input.rawBody);
  if (!rawBody) {
    throw new PlatformError(400, "billing_webhook_invalid", "Dodo webhook body is empty.");
  }

  const client = buildDodoClient(config);

  try {
    return client.webhooks.unwrap(rawBody, {
      headers: readWebhookHeaders(input.headers),
      key: webhookKey,
    });
  } catch (error) {
    throw new PlatformError(
      400,
      "billing_webhook_invalid",
      error instanceof Error ? error.message : "Dodo webhook signature verification failed.",
    );
  }
}

function readCustomerEmail(value: unknown): string | null {
  return readJsonString(readJsonObject(value).email);
}

function readProductIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => readJsonString(readJsonObject(item).product_id))
    .filter((productId): productId is string => Boolean(productId));
}

export function readDodoPaymentSucceededSnapshot(
  payload: unknown,
  headers: Record<string, unknown>,
): DodoPaymentSucceededSnapshot | null {
  const envelope = readJsonObject(payload);
  if (readJsonString(envelope.type) !== "payment.succeeded") {
    return null;
  }

  const data = readJsonObject(envelope.data) as DodoPaymentRecord;
  const externalOrderId = readJsonString(data.payment_id);
  if (!externalOrderId) {
    throw new PlatformError(400, "billing_webhook_invalid", "Dodo payment.succeeded payload did not include a payment id.");
  }

  const eventId = readWebhookHeader(headers, "webhook-id") || externalOrderId;
  const totalAmountMinor = Number(data.total_amount);

  return {
    eventId,
    eventType: "payment.succeeded",
    timestamp: readJsonString(envelope.timestamp),
    businessId: readJsonString(envelope.business_id),
    externalOrderId,
    currencyCode: readJsonString(data.currency),
    totalAmountMinor: Number.isFinite(totalAmountMinor) ? Math.floor(totalAmountMinor) : null,
    status: readJsonString(data.status),
    checkoutSessionId: readJsonString(data.checkout_session_id),
    customerEmail: readCustomerEmail(data.customer),
    metadata: readStringMap(data.metadata),
    productIds: readProductIds(data.product_cart),
    raw: payload,
  };
}

export function readDodoBillingOrderId(metadata: Record<string, string>): string | null {
  const candidates = [
    metadata.billingOrderId,
    metadata.billing_order_id,
    metadata.moadsBillingOrderId,
    metadata.moads_billing_order_id,
  ];

  for (const value of candidates) {
    const normalized = readJsonString(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}
