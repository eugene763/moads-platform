import {PlatformError} from "@moads/db";

import {ApiConfig} from "../types.js";

const FASTSPRING_ALLOWED_HOST_SUFFIXES = [
  "fastspring.com",
  "onfastspring.com",
];

interface JsonObject {
  [key: string]: unknown;
}

export interface FastSpringCheckoutSessionInput {
  priceReference: string;
  customerEmail?: string | null;
  countryCode?: string | null;
  languageCode?: string | null;
  tags?: Record<string, string>;
}

export interface FastSpringCheckoutSession {
  sessionId: string;
  redirectUrl: string;
  expiresAtMs: number | null;
  raw: unknown;
}

export interface FastSpringOrderSnapshot {
  externalOrderId: string;
  reference: string | null;
  completed: boolean;
  currencyCode: string | null;
  customerEmail: string | null;
  productPaths: string[];
  tags: Record<string, string>;
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

function normalizeFastSpringHost(host: string): string | null {
  const trimmed = host.trim();
  if (!trimmed) {
    return null;
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    const normalizedHost = url.hostname.trim().toLowerCase();
    const isAllowed = FASTSPRING_ALLOWED_HOST_SUFFIXES.some((suffix) => {
      return normalizedHost === suffix || normalizedHost.endsWith(`.${suffix}`);
    });
    return isAllowed ? normalizedHost : null;
  } catch {
    return null;
  }
}

function normalizeFastSpringProductPath(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (!normalized) {
    return null;
  }

  return /^[a-z0-9][a-z0-9._-]*$/i.test(normalized) ? normalized : null;
}

export function isFastSpringConfigured(config: Pick<ApiConfig, "fsApiUsername" | "fsApiPassword" | "fsStoreHost">): boolean {
  return Boolean(
    config.fsApiUsername &&
    config.fsApiPassword &&
    normalizeFastSpringHost(config.fsStoreHost ?? ""),
  );
}

export function extractFastSpringProductPath(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (!normalizeFastSpringHost(url.hostname)) {
      return null;
    }
    const productFromQuery =
      normalizeFastSpringProductPath(url.searchParams.get("product")) ||
      normalizeFastSpringProductPath(url.searchParams.get("path"));
    if (productFromQuery) {
      return productFromQuery;
    }

    const segments = url.pathname.split("/").map((segment) => segment.trim()).filter(Boolean);
    return normalizeFastSpringProductPath(segments.at(-1) ?? null);
  } catch {
    return normalizeFastSpringProductPath(trimmed);
  }
}

export function buildFastSpringSessionUrl(storeHost: string, sessionId: string): string {
  const normalizedHost = normalizeFastSpringHost(storeHost);
  if (!normalizedHost) {
    throw new PlatformError(500, "billing_provider_invalid_store", "FastSpring store host is invalid.");
  }

  const cleanSessionId = readJsonString(sessionId);
  if (!cleanSessionId) {
    throw new PlatformError(500, "billing_provider_invalid_session", "FastSpring session id is invalid.");
  }

  return `https://${normalizedHost}/session/${encodeURIComponent(cleanSessionId)}`;
}

function buildFastSpringAuthHeader(config: Pick<ApiConfig, "fsApiUsername" | "fsApiPassword">): string {
  const username = config.fsApiUsername?.trim();
  const password = config.fsApiPassword?.trim();
  if (!username || !password) {
    throw new PlatformError(409, "billing_checkout_unavailable", "FastSpring checkout is not configured.");
  }

  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function fastSpringApiRequest(
  config: Pick<ApiConfig, "fsApiUsername" | "fsApiPassword" | "fsStoreHost">,
  input: {
    method: "GET" | "POST";
    path: string;
    body?: unknown;
  },
): Promise<unknown> {
  if (!isFastSpringConfigured(config)) {
    throw new PlatformError(409, "billing_checkout_unavailable", "FastSpring checkout is not configured.");
  }

  const requestInit: RequestInit = {
    method: input.method,
    headers: {
      Accept: "application/json",
      Authorization: buildFastSpringAuthHeader(config),
      ...(input.body !== undefined ? {"Content-Type": "application/json"} : {}),
    },
    ...(input.body !== undefined ? {body: JSON.stringify(input.body)} : {}),
  };

  const response = await fetch(`https://api.fastspring.com${input.path}`, requestInit);

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
      `FastSpring API request failed (${response.status}).`;

    throw new PlatformError(
      response.status >= 500 ? 502 : 409,
      "billing_provider_request_failed",
      message,
      {
        provider: "fastspring",
        status: response.status,
        path: input.path,
      },
    );
  }

  return payload;
}

export async function createFastSpringCheckoutSession(
  config: Pick<ApiConfig, "fsApiUsername" | "fsApiPassword" | "fsStoreHost">,
  input: FastSpringCheckoutSessionInput,
): Promise<FastSpringCheckoutSession> {
  const productPath = extractFastSpringProductPath(input.priceReference);
  if (!productPath) {
    throw new PlatformError(409, "billing_checkout_unavailable", "Checkout is not configured for this credit pack yet.");
  }

  const payload: JsonObject = {
    items: [
      {
        product: productPath,
        quantity: 1,
      },
    ],
  };

  const tags = readStringMap(input.tags);
  if (Object.keys(tags).length > 0) {
    payload.tags = tags;
  }

  const contactEmail = readJsonString(input.customerEmail);
  if (contactEmail) {
    payload.contact = {email: contactEmail};
    payload.paymentContact = {email: contactEmail};
  }

  const countryCode = readJsonString(input.countryCode)?.toUpperCase() ?? null;
  if (countryCode) {
    payload.country = countryCode;
  }

  const languageCode = readJsonString(input.languageCode)?.toLowerCase() ?? null;
  if (languageCode) {
    payload.language = languageCode;
  }

  const response = readJsonObject(await fastSpringApiRequest(config, {
    method: "POST",
    path: "/sessions",
    body: payload,
  }));

  const sessionId = readJsonString(response.id);
  if (!sessionId) {
    throw new PlatformError(502, "billing_provider_invalid_response", "FastSpring session response is invalid.");
  }

  const expiresAtMs = Number(response.expires);
  return {
    sessionId,
    redirectUrl: buildFastSpringSessionUrl(config.fsStoreHost ?? "", sessionId),
    expiresAtMs: Number.isFinite(expiresAtMs) ? Math.floor(expiresAtMs) : null,
    raw: response,
  };
}

export async function retrieveFastSpringOrder(
  config: Pick<ApiConfig, "fsApiUsername" | "fsApiPassword" | "fsStoreHost">,
  externalOrderId: string,
): Promise<FastSpringOrderSnapshot> {
  const normalizedOrderId = readJsonString(externalOrderId);
  if (!normalizedOrderId) {
    throw new PlatformError(400, "billing_provider_order_required", "FastSpring order id is required.");
  }

  const response = readJsonObject(await fastSpringApiRequest(config, {
    method: "GET",
    path: `/orders/${encodeURIComponent(normalizedOrderId)}`,
  }));

  const orderId = readJsonString(response.id) || readJsonString(response.order);
  if (!orderId) {
    throw new PlatformError(502, "billing_provider_invalid_response", "FastSpring order response is invalid.");
  }

  const items = Array.isArray(response.items) ? response.items : [];
  const productPaths = items
    .map((item) => {
      const object = readJsonObject(item);
      return (
        extractFastSpringProductPath(readJsonString(object.product)) ||
        extractFastSpringProductPath(readJsonString(object.path))
      );
    })
    .filter((value): value is string => Boolean(value));

  const customer = readJsonObject(response.customer);
  const contact = readJsonObject(response.contact);
  const account = readJsonObject(response.account);
  const accountContact = readJsonObject(account.contact);

  return {
    externalOrderId: orderId,
    reference: readJsonString(response.reference),
    completed: response.completed === true,
    currencyCode: readJsonString(response.currency),
    customerEmail:
      readJsonString(customer.email) ||
      readJsonString(contact.email) ||
      readJsonString(accountContact.email),
    productPaths,
    tags: {
      ...readStringMap(response.attributes),
      ...readStringMap(response.tags),
    },
    raw: response,
  };
}

export function extractFastSpringWebhookOrderIds(payload: unknown): string[] {
  const ids = new Set<string>();

  const visitCandidate = (candidate: unknown) => {
    const object = readJsonObject(candidate);
    if (!Object.keys(object).length) {
      return;
    }

    const data = readJsonObject(object.data);
    const orderObject = readJsonObject(object.order);

    const candidates = [
      readJsonString(data.order),
      readJsonString(data.id),
      readJsonString(orderObject.order),
      readJsonString(orderObject.id),
      readJsonString(object.order),
    ];

    if (!Object.keys(data).length && !Object.keys(orderObject).length) {
      candidates.push(readJsonString(object.id));
    }

    for (const candidateId of candidates) {
      const normalized = readJsonString(candidateId);
      if (normalized) {
        ids.add(normalized);
      }
    }
  };

  if (Array.isArray(payload)) {
    payload.forEach(visitCandidate);
  } else {
    const root = readJsonObject(payload);
    const events = Array.isArray(root.events) ? root.events : [];
    if (events.length > 0) {
      events.forEach(visitCandidate);
    } else {
      visitCandidate(payload);
    }
  }

  return [...ids];
}

export function readFastSpringBillingOrderId(tags: Record<string, string>): string | null {
  const candidates = [
    tags.billingOrderId,
    tags.billing_order_id,
    tags.moadsBillingOrderId,
    tags.moads_billing_order_id,
  ];

  for (const value of candidates) {
    const normalized = readJsonString(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}
