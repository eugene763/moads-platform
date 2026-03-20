import {FastifyInstance, FastifyRequest} from "fastify";

import {
  bootstrapSessionLogin,
  getSessionSnapshot,
  PlatformError,
} from "@moads/db";

import {requireAuth, resolveAccount} from "../middleware/auth.js";
import {resolveCookieDomain, resolveRequestProduct} from "../lib/product-context.js";

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const baseCookieOptions = (request: FastifyRequest) => {
    const domain = resolveCookieDomain(request);
    if (domain) {
      return {
        httpOnly: true as const,
        sameSite: "lax" as const,
        secure: app.config.nodeEnv !== "development",
        path: "/",
        domain,
      };
    }

    return {
      httpOnly: true as const,
      sameSite: "lax" as const,
      secure: app.config.nodeEnv !== "development",
      path: "/",
    };
  };

  app.post("/auth/session-login", async (request, reply) => {
    const body = request.body as {idToken?: unknown} | undefined;
    if (typeof body?.idToken !== "string" || !body.idToken.trim()) {
      throw new PlatformError(400, "invalid_id_token", "idToken is required.");
    }

    const product = await resolveRequestProduct(request);
    const decoded = await app.firebase.auth.verifyIdToken(body.idToken);
    const sessionCookie = await app.firebase.auth.createSessionCookie(body.idToken, {
      expiresIn: app.config.sessionCookieMaxAgeMs,
    });

    const bootstrap = await bootstrapSessionLogin(app.prisma, {
      firebaseUid: decoded.uid,
      productCode: product.productCode as "motrend" | "lab" | "aeo" | "ugc",
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified ?? false,
      displayName: decoded.name ?? null,
      photoUrl: decoded.picture ?? null,
      signInProvider: typeof decoded.firebase?.sign_in_provider === "string" ? decoded.firebase.sign_in_provider : null,
      legacySupportCode: null,
    });

    reply.setCookie(app.config.sessionCookieName, sessionCookie, {
      ...baseCookieOptions(request),
      maxAge: Math.floor(app.config.sessionCookieMaxAgeMs / 1000),
    });

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
