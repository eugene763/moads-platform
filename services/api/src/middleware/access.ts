import {FastifyReply, FastifyRequest} from "fastify";

import {
  PlatformError,
  requireEntitlement as dbRequireEntitlement,
  requireProductMembership as dbRequireProductMembership,
} from "@moads/db";

export function requireProductMembership(productCode: string) {
  return async function productMembershipGuard(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    if (!request.accountContext) {
      throw new PlatformError(500, "account_context_missing", "Account context is missing.");
    }

    await dbRequireProductMembership(request.server.prisma, {
      accountId: request.accountContext.accountId,
      productCode,
    });
  };
}

export function requireEntitlement(featureCode: string, productCode = "motrend") {
  return async function entitlementGuard(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    if (!request.accountContext) {
      throw new PlatformError(500, "account_context_missing", "Account context is missing.");
    }

    await dbRequireEntitlement(request.server.prisma, {
      accountId: request.accountContext.accountId,
      productCode,
      featureCode,
    });
  };
}
