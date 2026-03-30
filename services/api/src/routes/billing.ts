import {FastifyInstance} from "fastify";

import {
  createBillingCheckoutOrder,
  listBillingCreditPackOffers,
  listBillingOrders,
  PlatformError,
} from "@moads/db";

import {requireAuth, resolveAccount} from "../middleware/auth.js";
import {resolveRequestProduct} from "../lib/product-context.js";

export async function registerBillingRoutes(app: FastifyInstance): Promise<void> {
  const authGuards = [requireAuth, resolveAccount];

  app.get("/billing/credit-packs", {preHandler: authGuards}, async (request, reply) => {
    if (!request.accountContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const product = await resolveRequestProduct(request);
    const packs = await listBillingCreditPackOffers(app.prisma, {
      productCode: product.productCode,
    });

    reply.send({packs});
  });

  app.get("/billing/orders", {preHandler: authGuards}, async (request, reply) => {
    if (!request.accountContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const product = await resolveRequestProduct(request);
    const orders = await listBillingOrders(app.prisma, {
      accountId: request.accountContext.accountId,
      productCode: product.productCode,
      limit: 10,
    });

    reply.send({orders});
  });

  app.post("/billing/orders/checkout", {preHandler: authGuards}, async (request, reply) => {
    if (!request.accountContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const body = request.body as {priceId?: unknown} | undefined;
    if (typeof body?.priceId !== "string" || !body.priceId.trim()) {
      throw new PlatformError(400, "billing_price_required", "priceId is required.");
    }

    const product = await resolveRequestProduct(request);
    const order = await createBillingCheckoutOrder(app.prisma, {
      accountId: request.accountContext.accountId,
      productCode: product.productCode,
      priceId: body.priceId.trim(),
    });

    reply.send(order);
  });
}
