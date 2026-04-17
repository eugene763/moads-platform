import {FastifyReply, FastifyRequest} from "fastify";

import {PlatformError} from "@moads/db";

function readBearerToken(request: FastifyRequest): string | null {
  const rawHeader = request.headers.authorization;
  if (typeof rawHeader !== "string") {
    return null;
  }

  const trimmed = rawHeader.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = trimmed.slice("bearer ".length).trim();
  return token || null;
}

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const sessionCookie = request.cookies[request.server.config.sessionCookieName];
  const bearerToken = request.server.config.runtimeProfile !== "prod" ? readBearerToken(request) : null;

  let decoded;
  if (sessionCookie) {
    try {
      decoded = await request.server.firebase.auth.verifySessionCookie(sessionCookie, true);
    } catch (error) {
      if (!bearerToken) {
        throw error;
      }
    }
  }

  if (!decoded && bearerToken) {
    decoded = await request.server.firebase.auth.verifyIdToken(bearerToken);
  }

  if (!decoded) {
    throw new PlatformError(401, "unauthenticated", "Sign in first.");
  }

  const user = await request.server.prisma.identityUser.findUnique({
    where: {firebaseUid: decoded.uid},
  });

  if (!user) {
    throw new PlatformError(401, "identity_not_bootstrapped", "User exists in Firebase Auth but not in platform identity.");
  }

  request.authContext = {
    userId: user.id,
    firebaseUid: user.firebaseUid,
    email: user.primaryEmail ?? null,
    claims: decoded,
  };
}

export async function resolveAccount(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.authContext) {
    throw new PlatformError(500, "auth_context_missing", "Auth context is missing.");
  }

  const requestedAccountId = typeof request.headers["x-account-id"] === "string" ?
    request.headers["x-account-id"] :
    undefined;

  const membership = await request.server.prisma.accountMember.findFirst({
    where: {
      userId: request.authContext.userId,
      status: "active",
      ...(requestedAccountId ? {accountId: requestedAccountId} : {}),
    },
    include: {
      account: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!membership) {
    throw new PlatformError(403, "account_resolution_failed", "No active account found for this user.");
  }

  request.accountContext = {
    accountId: membership.account.id,
    realmDefault: membership.account.realmDefault,
  };
}
