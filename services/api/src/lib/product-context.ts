import {FastifyRequest} from "fastify";

import {PlatformError, resolveProductByCode} from "@moads/db";

function normalizeHost(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const [host] = trimmed.split(",");
  if (!host) {
    return null;
  }

  return host.replace(/^https?:\/\//, "").split("/")[0]?.split(":")[0] ?? null;
}

function isLocalHost(host: string | null): boolean {
  return host === "localhost" || host === "127.0.0.1";
}

export async function resolveRequestProduct(
  request: FastifyRequest,
) {
  const originHost = normalizeHost(request.headers.origin);
  const forwardedHost = normalizeHost(request.headers["x-forwarded-host"] as string | undefined);
  const host = normalizeHost(request.headers.host);
  const candidateHost = originHost ?? forwardedHost ?? host;

  if (candidateHost && !isLocalHost(candidateHost)) {
    const product = await request.server.prisma.product.findFirst({
      where: {entryDomain: candidateHost},
      include: {realm: true},
    });

    if (product) {
      request.productContext = {
        productId: product.id,
        productCode: product.code,
        realmCode: product.realm.code,
        entryDomain: product.entryDomain,
      };
      return request.productContext;
    }
  }

  if (candidateHost && isLocalHost(candidateHost)) {
    const fallback = await resolveProductByCode(request.server.prisma, request.server.config.defaultDevProductCode);
    request.productContext = {
      productId: fallback.id,
      productCode: fallback.code,
      realmCode: fallback.realm.code,
      entryDomain: fallback.entryDomain,
    };
    return request.productContext;
  }

  throw new PlatformError(400, "product_resolution_failed", "Unable to resolve product from request origin/host.");
}

export function resolveCookieDomain(request: FastifyRequest): string | undefined {
  if (request.server.config.sessionCookieDomain) {
    return request.server.config.sessionCookieDomain;
  }

  const origin = normalizeHost(request.headers.origin);
  const host = normalizeHost(request.headers.host);
  const candidate = origin ?? host;

  if (candidate?.endsWith(".moads.agency")) {
    return ".moads.agency";
  }

  return undefined;
}

export function normalizeExternalHostForTest(value: string | undefined): string | null {
  return normalizeHost(value);
}
