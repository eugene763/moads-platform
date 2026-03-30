import {FastifyInstance} from "fastify";

import {
  getSessionSnapshot,
  getWalletSnapshot,
  PlatformError,
} from "@moads/db";

import {requireAuth, resolveAccount} from "../middleware/auth.js";

export async function registerMeRoutes(app: FastifyInstance): Promise<void> {
  const guards = [requireAuth, resolveAccount];

  app.get("/me", {preHandler: guards}, async (request, reply) => {
    if (!request.authContext || !request.accountContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const snapshot = await getSessionSnapshot(
      app.prisma,
      request.authContext.userId,
      request.accountContext.accountId,
    );

    reply.send(snapshot);
  });

  app.get("/me/products", {preHandler: guards}, async (request, reply) => {
    if (!request.accountContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const memberships = await app.prisma.productMembership.findMany({
      where: {
        accountId: request.accountContext.accountId,
      },
      include: {
        product: {
          include: {
            realm: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    reply.send({
      products: memberships.map((membership) => ({
        productCode: membership.product.code,
        productName: membership.product.name,
        entryDomain: membership.product.entryDomain,
        realmCode: membership.product.realm.code,
        status: membership.status.toLowerCase(),
        membershipType: membership.membershipType.toLowerCase(),
      })),
    });
  });

  app.get("/wallet/summary", {preHandler: guards}, async (request, reply) => {
    if (!request.accountContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const wallet = await app.prisma.$transaction(async (tx) => {
      return await getWalletSnapshot(tx, request.accountContext!.accountId);
    });

    reply.send({wallet});
  });
}
