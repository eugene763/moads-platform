import {OAuth2Client, TokenPayload} from "google-auth-library";
import {PlatformError} from "@moads/db";
import {FastifyReply, FastifyRequest} from "fastify";

let googleOidcClientSingleton: OAuth2Client | undefined;

function getGoogleOidcClient(): OAuth2Client {
  if (!googleOidcClientSingleton) {
    googleOidcClientSingleton = new OAuth2Client();
  }

  return googleOidcClientSingleton;
}

export function resetGoogleOidcClientForTest() {
  googleOidcClientSingleton = undefined;
}

function readInternalApiKey(request: FastifyRequest): string | null {
  const headerValue = request.headers["x-moads-internal-key"];
  if (typeof headerValue === "string" && headerValue.trim()) {
    return headerValue.trim();
  }

  const authorization = request.headers.authorization;
  if (typeof authorization !== "string") {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function readBearerToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string") {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function assertValidGoogleIssuer(payload: TokenPayload | undefined): void {
  const issuer = payload?.iss?.trim();
  if (issuer === "accounts.google.com" || issuer === "https://accounts.google.com") {
    return;
  }

  throw new PlatformError(
    403,
    "internal_oidc_forbidden",
    "Internal Google OIDC token issuer is invalid.",
  );
}

function assertExpectedServiceAccount(
  payload: TokenPayload | undefined,
  expectedServiceAccountEmail: string,
): void {
  const actualEmail = payload?.email?.trim().toLowerCase();
  if (actualEmail && actualEmail === expectedServiceAccountEmail.trim().toLowerCase()) {
    return;
  }

  throw new PlatformError(
    403,
    "internal_oidc_forbidden",
    "Internal Google OIDC token principal is invalid.",
  );
}

async function verifyGoogleInternalOidcToken(
  idToken: string,
  audience: string,
  expectedServiceAccountEmail: string,
): Promise<void> {
  const ticket = await getGoogleOidcClient().verifyIdToken({
    idToken,
    audience,
  });
  const payload = ticket.getPayload();
  assertValidGoogleIssuer(payload);
  assertExpectedServiceAccount(payload, expectedServiceAccountEmail);
}

export async function requireInternalAccess(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const expectedKey = request.server.config.internalApiKey;
  const providedKey = readInternalApiKey(request);
  if (expectedKey && providedKey === expectedKey) {
    return;
  }

  const bearerToken = readBearerToken(request);
  const apiBaseUrl = request.server.config.apiBaseUrl;
  const expectedServiceAccountEmail = request.server.config.cloudTasksInvokerServiceAccountEmail;
  if (bearerToken && apiBaseUrl) {
    if (!expectedServiceAccountEmail) {
      throw new PlatformError(
        503,
        "internal_oidc_unconfigured",
        "Internal Google OIDC principal is not configured.",
      );
    }

    try {
      await verifyGoogleInternalOidcToken(bearerToken, apiBaseUrl, expectedServiceAccountEmail);
      return;
    } catch (error) {
      if (error instanceof PlatformError) {
        throw error;
      }

      throw new PlatformError(
        403,
        "internal_oidc_forbidden",
        "Internal Google OIDC token is invalid.",
      );
    }
  }

  if (!expectedKey && !apiBaseUrl) {
    throw new PlatformError(
      503,
      "internal_api_unconfigured",
      "Internal route auth is not configured.",
    );
  }

  throw new PlatformError(403, "internal_api_forbidden", "Internal route access is invalid.");
}
