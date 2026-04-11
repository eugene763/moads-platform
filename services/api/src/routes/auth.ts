import {createHash} from "node:crypto";

import {FastifyInstance, FastifyRequest} from "fastify";

import {
  bootstrapSessionLogin,
  getSessionSnapshot,
  PlatformError,
} from "@moads/db";

import {requireAuth, resolveAccount} from "../middleware/auth.js";
import {resolveCookieDomain, resolveRequestProduct} from "../lib/product-context.js";

const MOTREND_REGISTRATION_COOKIE_KEY = "motrend_registration_seen_v1";
const MOTREND_REGISTRATION_SERVER_COOKIE_KEY = "motrend_registration_seen_srv_v1";
const MOTREND_GIFT_COOKIE_KEY = "motrend_gift_claimed_v1";
const MOTREND_GIFT_SERVER_COOKIE_KEY = "motrend_gift_claimed_srv_v1";
const MOTREND_GIFT_FINGERPRINT_ACTION_CODE = "auth.motrend_gift_fingerprint_claimed";
const MOTREND_GIFT_FINGERPRINT_TARGET_TYPE = "motrend_gift_fingerprint";
const MOTREND_GIFT_FINGERPRINT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function hasTruthyCookie(request: FastifyRequest, name: string): boolean {
  const raw = request.cookies?.[name];
  return typeof raw === "string" && raw.trim() === "1";
}

function readHeaderString(request: FastifyRequest, name: string): string {
  const raw = request.headers[name];
  if (typeof raw === "string") {
    return raw.trim();
  }
  if (Array.isArray(raw) && typeof raw[0] === "string") {
    return raw[0].trim();
  }
  return "";
}

function resolveClientIp(request: FastifyRequest): string {
  const forwarded = readHeaderString(request, "x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || request.ip || "";
  }

  const realIp = readHeaderString(request, "x-real-ip");
  if (realIp) {
    return realIp;
  }

  return (request.ip || "").trim();
}

function normalizeUserAgentFingerprint(userAgent: string): string {
  const normalized = userAgent.trim().toLowerCase();
  if (!normalized) {
    return "unknown";
  }

  const device =
    /iphone|ipad|ipod/.test(normalized) ? "ios" :
      /android/.test(normalized) ? "android" :
        /macintosh|mac os x/.test(normalized) ? "mac" :
          /windows/.test(normalized) ? "windows" :
            /linux/.test(normalized) ? "linux" :
              "other";

  const browser =
    /edg\//.test(normalized) ? "edge" :
      /firefox\//.test(normalized) ? "firefox" :
        /crios\//.test(normalized) ? "chrome_ios" :
          /fxios\//.test(normalized) ? "firefox_ios" :
            /chrome\//.test(normalized) && !/edg\//.test(normalized) ? "chrome" :
              /safari\//.test(normalized) && !/chrome\//.test(normalized) ? "safari" :
                /telegram/.test(normalized) ? "telegram" :
                  "other";

  return `${device}:${browser}`;
}

function buildMotrendGiftFingerprintHash(request: FastifyRequest): string | null {
  const ip = resolveClientIp(request);
  const ua = normalizeUserAgentFingerprint(readHeaderString(request, "user-agent"));
  if (!ip || !ua) {
    return null;
  }

  return createHash("sha256")
    .update(`motrend:${ip}|${ua}`)
    .digest("hex");
}

async function hasRecentMotrendGiftFingerprint(
  app: FastifyInstance,
  fingerprintHash: string | null,
): Promise<boolean> {
  if (!fingerprintHash) {
    return false;
  }

  const recent = await app.prisma.auditLog.findFirst({
    where: {
      actionCode: MOTREND_GIFT_FINGERPRINT_ACTION_CODE,
      targetType: MOTREND_GIFT_FINGERPRINT_TARGET_TYPE,
      targetId: fingerprintHash,
      createdAt: {
        gte: new Date(Date.now() - MOTREND_GIFT_FINGERPRINT_WINDOW_MS),
      },
    },
    select: {
      id: true,
    },
  });

  return Boolean(recent);
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const baseCookieOptions = (request: FastifyRequest, httpOnly = true) => {
    const domain = resolveCookieDomain(request);
    if (domain) {
      return {
        httpOnly,
        sameSite: "lax" as const,
        secure: app.config.nodeEnv !== "development",
        path: "/",
        domain,
      };
    }

    return {
      httpOnly,
      sameSite: "lax" as const,
      secure: app.config.nodeEnv !== "development",
      path: "/",
    };
  };

  app.post("/auth/session-login", async (request, reply) => {
    const body = request.body as {idToken?: unknown; productCode?: unknown} | undefined;
    if (typeof body?.idToken !== "string" || !body.idToken.trim()) {
      throw new PlatformError(400, "invalid_id_token", "idToken is required.");
    }

    const requestedProductCode = typeof body.productCode === "string" ? body.productCode.trim().toLowerCase() : "";
    const supportedProductCodes = new Set(["motrend", "aeo", "lab", "ugc"]);
    if (requestedProductCode && !supportedProductCodes.has(requestedProductCode)) {
      throw new PlatformError(400, "invalid_product_code", "productCode must be one of: motrend, aeo, lab, ugc.");
    }

    const product = requestedProductCode ?
      {
        productCode: requestedProductCode,
      } :
      await resolveRequestProduct(request).catch(() => ({
        productCode: "aeo",
      }));
    const decoded = await app.firebase.auth.verifyIdToken(body.idToken);
    const hasBrowserGiftEvidence = product.productCode === "motrend" && (
      hasTruthyCookie(request, MOTREND_REGISTRATION_SERVER_COOKIE_KEY) ||
      hasTruthyCookie(request, MOTREND_REGISTRATION_COOKIE_KEY) ||
      hasTruthyCookie(request, MOTREND_GIFT_SERVER_COOKIE_KEY) ||
      hasTruthyCookie(request, MOTREND_GIFT_COOKIE_KEY)
    );
    const fingerprintHash = product.productCode === "motrend" ?
      buildMotrendGiftFingerprintHash(request) :
      null;
    const hasRecentGiftFingerprint = product.productCode === "motrend" ?
      await hasRecentMotrendGiftFingerprint(app, fingerprintHash) :
      false;
    const suppressMotrendGift = product.productCode === "motrend" && (
      hasBrowserGiftEvidence || hasRecentGiftFingerprint
    );

    const bootstrap = await bootstrapSessionLogin(app.prisma, {
      firebaseUid: decoded.uid,
      productCode: product.productCode as "motrend" | "lab" | "aeo" | "ugc",
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified ?? false,
      displayName: decoded.name ?? null,
      photoUrl: decoded.picture ?? null,
      signInProvider: typeof decoded.firebase?.sign_in_provider === "string" ? decoded.firebase.sign_in_provider : null,
      legacySupportCode: null,
      suppressMotrendGift,
    });

    const sessionCookie = await app.firebase.auth.createSessionCookie(body.idToken, {
      expiresIn: app.config.sessionCookieMaxAgeMs,
    });

    reply.setCookie(app.config.sessionCookieName, sessionCookie, {
      ...baseCookieOptions(request),
      maxAge: Math.floor(app.config.sessionCookieMaxAgeMs / 1000),
    });

    if (product.productCode === "motrend") {
      const sharedMaxAge = Math.floor(app.config.sessionCookieMaxAgeMs / 1000);
      reply.setCookie(MOTREND_REGISTRATION_SERVER_COOKIE_KEY, "1", {
        ...baseCookieOptions(request, true),
        maxAge: sharedMaxAge,
      });
      reply.setCookie(MOTREND_REGISTRATION_COOKIE_KEY, "1", {
        ...baseCookieOptions(request, false),
        maxAge: sharedMaxAge,
      });

      if (bootstrap.grantedTestCredits) {
        reply.setCookie(MOTREND_GIFT_SERVER_COOKIE_KEY, "1", {
          ...baseCookieOptions(request, true),
          maxAge: sharedMaxAge,
        });
        reply.setCookie(MOTREND_GIFT_COOKIE_KEY, "1", {
          ...baseCookieOptions(request, false),
          maxAge: sharedMaxAge,
        });

        if (fingerprintHash) {
          await app.prisma.auditLog.create({
            data: {
              accountId: bootstrap.account.id,
              userId: bootstrap.user.id,
              actionCode: MOTREND_GIFT_FINGERPRINT_ACTION_CODE,
              targetType: MOTREND_GIFT_FINGERPRINT_TARGET_TYPE,
              targetId: fingerprintHash,
              payloadJson: {
                productCode: "motrend",
                scope: "signup_gift",
              },
            },
          });
        }
      }
    }

    reply.send(bootstrap);
  });

  app.post("/auth/session-logout", {preHandler: [requireAuth]}, async (request, reply) => {
    if (request.authContext) {
      await app.firebase.auth.revokeRefreshTokens(request.authContext.firebaseUid).catch(() => {
        request.log.warn("refresh token revocation skipped");
      });
    }

    reply.clearCookie(app.config.sessionCookieName, {
      ...baseCookieOptions(request),
    });

    reply.status(204).send();
  });

  app.get("/auth/me", {preHandler: [requireAuth, resolveAccount]}, async (request, reply) => {
    if (!request.authContext || !request.accountContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const product = await resolveRequestProduct(request).catch(() => null);
    const snapshot = await getSessionSnapshot(
      app.prisma,
      request.authContext.userId,
      request.accountContext.accountId,
    );

    reply.send({
      ...snapshot,
      currentProduct: product,
    });
  });
}
