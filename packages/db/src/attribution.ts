import {Prisma} from "@prisma/client";

type DbClient = Prisma.TransactionClient | Prisma.DefaultPrismaClient;

const MAX_ATTRIBUTION_URL_LENGTH = 1500;
const MAX_ATTRIBUTION_TEXT_LENGTH = 500;
const MAX_ATTRIBUTION_MAP_VALUE_LENGTH = 500;

export interface AttributionPayloadInput {
  capturedAtMs?: unknown;
  landingUrl?: unknown;
  referrer?: unknown;
  utm?: unknown;
  ids?: unknown;
}

export interface AttributionUpsertResult {
  stored: boolean;
  firstTouchSet: boolean;
}

interface SanitizedAttributionPayload {
  capturedAtMs: number;
  landingUrl: string | null;
  referrer: string | null;
  utm: Record<string, string>;
  ids: Record<string, string>;
}

function sanitizeString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function sanitizeStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const source = value as Record<string, unknown>;
  const normalized: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(source)) {
    const normalizedValue = sanitizeString(rawValue, MAX_ATTRIBUTION_MAP_VALUE_LENGTH);
    if (!normalizedValue) {
      continue;
    }
    normalized[key] = normalizedValue;
  }

  return normalized;
}

function readJsonStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const source = value as Record<string, unknown>;
  const normalized: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(source)) {
    if (typeof rawValue !== "string") {
      continue;
    }
    const trimmed = rawValue.trim();
    if (!trimmed) {
      continue;
    }
    normalized[key] = trimmed;
  }

  return normalized;
}

export function sanitizeAttributionPayload(
  input: AttributionPayloadInput,
): SanitizedAttributionPayload | null {
  const capturedAtMsRaw = Number(input.capturedAtMs);
  const capturedAtMs = Number.isFinite(capturedAtMsRaw) && capturedAtMsRaw > 0 ?
    Math.floor(capturedAtMsRaw) :
    Date.now();

  const landingUrl = sanitizeString(input.landingUrl, MAX_ATTRIBUTION_URL_LENGTH);
  const referrer = sanitizeString(input.referrer, MAX_ATTRIBUTION_URL_LENGTH);
  const utm = sanitizeStringMap(input.utm);
  const ids = sanitizeStringMap(input.ids);

  const hasPayload = (
    !!landingUrl ||
    !!referrer ||
    Object.keys(utm).length > 0 ||
    Object.keys(ids).length > 0
  );

  if (!hasPayload) {
    return null;
  }

  return {
    capturedAtMs,
    landingUrl,
    referrer,
    utm,
    ids,
  };
}

function buildTouchJson(payload: SanitizedAttributionPayload): Prisma.InputJsonValue {
  const touch: Record<string, Prisma.InputJsonValue> = {
    capturedAtMs: payload.capturedAtMs,
  };

  if (payload.landingUrl) {
    touch.landingUrl = payload.landingUrl;
  }
  if (payload.referrer) {
    touch.referrer = payload.referrer;
  }
  if (Object.keys(payload.utm).length > 0) {
    touch.utm = payload.utm;
  }
  if (Object.keys(payload.ids).length > 0) {
    touch.ids = payload.ids;
  }

  return touch as Prisma.InputJsonObject;
}

export async function upsertAttributionProfile(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    accountId: string | null;
    userId: string;
    payload: AttributionPayloadInput;
  },
): Promise<AttributionUpsertResult> {
  const sanitized = sanitizeAttributionPayload(input.payload);
  if (!sanitized) {
    return {
      stored: false,
      firstTouchSet: false,
    };
  }

  const touchJson = buildTouchJson(sanitized);

  return await prisma.$transaction(async (tx) => {
    const existing = await tx.attributionProfile.findUnique({
      where: {userId: input.userId},
    });

    const mergedClickIds = {
      ...readJsonStringMap(existing?.normalizedClickIdsJson),
      ...sanitized.ids,
    };
    const normalizedClickIdsJson = Object.keys(mergedClickIds).length > 0 ?
      mergedClickIds :
      Prisma.JsonNull;

    const firstTouchSet = !existing?.firstTouchJson;

    await tx.attributionProfile.upsert({
      where: {userId: input.userId},
      update: {
        ...(existing?.accountId ? {} : {accountId: input.accountId}),
        lastTouchJson: touchJson,
        ...(existing?.firstTouchJson ? {} : {firstTouchJson: touchJson}),
        normalizedClickIdsJson,
      },
      create: {
        accountId: input.accountId,
        userId: input.userId,
        firstTouchJson: touchJson,
        lastTouchJson: touchJson,
        normalizedClickIdsJson,
      },
    });

    return {
      stored: true,
      firstTouchSet,
    };
  });
}
