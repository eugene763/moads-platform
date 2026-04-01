import crypto from "node:crypto";

import {PlatformError} from "@moads/db";

import {ApiConfig} from "../types.js";

const CREEM_ALLOWED_CHECKOUT_HOST_SUFFIXES = [
  "creem.io",
];

interface JsonObject {
  [key: string]: unknown;
}

export interface CreemCheckoutSessionInput {
  productReference: string;
  requestId: string;
  customerEmail?: string | null;
  successUrl?: string | null;
  metadata?: Record<string, string>;
}

export interface CreemCheckoutSession {
  checkoutId: string;
  redirectUrl: string;
  raw: unknown;
}

export interface CreemCheckoutCompletedSnapshot {
  checkoutId: string;
  requestId: string | null;
  checkoutStatus: string | null;
  mode: string | null;
  externalOrderId: string | null;
  externalProductId: string | null;
  orderStatus: string | null;
  customerEmail: string | null;
  metadata: Record<string, string>;
  raw: unknown;
}

export interface CreemWebhookEnvelope {
  externalEventId: string;
  eventType: string;
  object: unknown;
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

function normalizeCreemApiBaseUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") {
      return null;
    }

    if (parsed.hostname !== "api.creem.io" && parsed.hostname !== "test-api.creem.io") {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

function normalizeCreemProductId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return /^prod_[a-z0-9]+$/i.test(trimmed) ? trimmed : null;
}

function normalizeAnyHttpUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeCheckoutUrl(value: string | null | undefined): string | null {
  const normalized = normalizeAnyHttpUrl(value);
  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    const hostname = parsed.hostname.trim().toLowerCase();
    const isAllowed = CREEM_ALLOWED_CHECKOUT_HOST_SUFFIXES.some((suffix) => {
      return hostname === suffix || hostname.endsWith(`.${suffix}`);
    });

    return isAllowed ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function buildCreemHeaders(config: Pick<ApiConfig, "creemApiKey">): Record<string, string> {
  const apiKey = config.creemApiKey?.trim();
  if (!apiKey) {
    throw new PlatformError(409, "billing_checkout_unavailable", "Creem checkout is not configured.");
  }

  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-api-key": apiKey,
  };
}

async function creemApiRequest(
  config: Pick<ApiConfig, "creemApiKey" | "creemApiBaseUrl">,
  input: {
    method: "POST";
    path: string;
    body: unknown;
  },
): Promise<unknown> {
  const baseUrl = normalizeCreemApiBaseUrl(config.creemApiBaseUrl);
  if (!baseUrl) {
    throw new PlatformError(409, "billing_checkout_unavailable", "Creem checkout is not configured.");
  }

  const response = await fetch(`${baseUrl}${input.path}`, {
    method: input.method,
    headers: buildCreemHeaders(config),
    body: JSON.stringify(input.body),
  });

  const rawText = await response.text();
  let payload: unknown = null;
  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = rawText;
    }
  }

  if (!response.ok) {
    const payloadObject = readJsonObject(payload);
    const message =
      readJsonString(payloadObject.message) ||
      readJsonString(payloadObject.error) ||
      `Creem API request failed (${response.status}).`;

    throw new PlatformError(
      response.status >= 500 ? 502 : 409,
      "billing_provider_request_failed",
      message,
      {
        provider: "creem",
        status: response.status,
        path: input.path,
      },
    );
  }

  return payload;
}

function normalizeWebhookSignature(value: string | null | undefined): string | null {
  const normalized = readJsonString(value)?.replace(/\s+/g, "").toLowerCase() ?? null;
  if (!normalized || !/^[a-f0-9]+$/i.test(normalized) || normalized.length % 2 !== 0) {
    return null;
  }

  return normalized;
}

export function isCreemConfigured(
  config: Pick<ApiConfig, "creemApiKey" | "creemWebhookSecret" | "creemApiBaseUrl">,
): boolean {
  return Boolean(
    config.creemApiKey?.trim() &&
    config.creemWebhookSecret?.trim() &&
    normalizeCreemApiBaseUrl(config.creemApiBaseUrl),
  );
}

export function extractCreemProductId(value: string | null | undefined): string | null {
  return normalizeCreemProductId(value);
}

export async function createCreemCheckoutSession(
  config: Pick<ApiConfig, "creemApiKey" | "creemWebhookSecret" | "creemApiBaseUrl">,
  input: CreemCheckoutSessionInput,
): Promise<CreemCheckoutSession> {
  if (!isCreemConfigured(config)) {
    throw new PlatformError(409, "billing_checkout_unavailable", "Creem checkout is not configured.");
  }

  const productId = extractCreemProductId(input.productReference);
  if (!productId) {
    throw new PlatformError(409, "billing_checkout_unavailable", "Checkout is not configured for this credit pack yet.");
  }

  const payload: JsonObject = {
    product_id: productId,
    request_id: input.requestId,
    units: 1,
  };

  const customerEmail = readJsonString(input.customerEmail);
  if (customerEmail) {
    payload.customer = {
      email: customerEmail,
    };
  }

  const successUrl = normalizeAnyHttpUrl(input.successUrl);
  if (successUrl) {
    payload.success_url = successUrl;
  }

  const metadata = readStringMap(input.metadata);
  if (Object.keys(metadata).length > 0) {
    payload.metadata = metadata;
  }

  const response = readJsonObject(await creemApiRequest(config, {
    method: "POST",
    path: "/v1/checkouts",
    body: payload,
  }));

  const checkoutId = readJsonString(response.id);
  const redirectUrl = normalizeCheckoutUrl(readJsonString(response.checkout_url));
  if (!checkoutId || !redirectUrl) {
    throw new PlatformError(502, "billing_provider_invalid_response", "Creem checkout response is invalid.");
  }

  return {
    checkoutId,
    redirectUrl,
    raw: response,
  };
}

export function verifyCreemWebhookSignature(
  rawBody: string | null | undefined,
  signature: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  const normalizedBody = typeof rawBody === "string" ? rawBody : "";
  const normalizedSignature = normalizeWebhookSignature(signature);
  const normalizedSecret = readJsonString(secret);
  if (!normalizedBody || !normalizedSignature || !normalizedSecret) {
    return false;
  }

  const computed = crypto
    .createHmac("sha256", normalizedSecret)
    .update(normalizedBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, "hex"),
      Buffer.from(normalizedSignature, "hex"),
    );
  } catch {
    return false;
  }
}

export function extractCreemWebhookEnvelope(payload: unknown): CreemWebhookEnvelope | null {
  const root = readJsonObject(payload);
  const externalEventId = readJsonString(root.id);
  const eventType = readJsonString(root.eventType);

  if (!externalEventId || !eventType) {
    return null;
  }

  return {
    externalEventId,
    eventType,
    object: root.object,
    raw: payload,
  };
}

export function extractCreemCheckoutCompletedSnapshot(payload: unknown): CreemCheckoutCompletedSnapshot | null {
  const root = readJsonObject(payload);
  const checkoutId = readJsonString(root.id);
  if (!checkoutId) {
    return null;
  }

  const order = readJsonObject(root.order);
  const customer = readJsonObject(root.customer);
  const product = readJsonObject(root.product);

  return {
    checkoutId,
    requestId: readJsonString(root.request_id),
    checkoutStatus: readJsonString(root.status),
    mode: readJsonString(root.mode),
    externalOrderId: readJsonString(order.id),
    externalProductId:
      readJsonString(product.id) ||
      readJsonString(order.product),
    orderStatus: readJsonString(order.status),
    customerEmail: readJsonString(customer.email),
    metadata: readStringMap(root.metadata),
    raw: payload,
  };
}

export function readCreemBillingOrderId(snapshot: Pick<CreemCheckoutCompletedSnapshot, "requestId" | "metadata">): string | null {
  return (
    readJsonString(snapshot.requestId) ||
    readJsonString(snapshot.metadata.billingOrderId) ||
    readJsonString(snapshot.metadata.billing_order_id) ||
    readJsonString(snapshot.metadata.moadsBillingOrderId) ||
    readJsonString(snapshot.metadata.moads_billing_order_id)
  );
}
