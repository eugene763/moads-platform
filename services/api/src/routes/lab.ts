import {FastifyInstance} from "fastify";

import {
  fulfillBillingOrderManually,
  getOrCreateAeoStarterOfferState,
  getWalletSnapshot,
  listBillingCreditPackOffers,
  listBillingOrders,
  PlatformError,
} from "@moads/db";

import {createBillingCheckoutResponse, normalizeCheckoutAttribution} from "../lib/billing-checkout.js";
import {maskUnavailableCheckoutOffers} from "../lib/billing-offers.js";
import {requireProductMembership} from "../middleware/access.js";
import {requireAdminClaim} from "../middleware/admin.js";
import {requireAuth, resolveAccount} from "../middleware/auth.js";

export async function registerLabRoutes(app: FastifyInstance): Promise<void> {
  const guards = [requireAuth, resolveAccount, requireProductMembership("lab")];

  app.get("/lab/center", {preHandler: guards}, async (request, reply) => {
    if (!request.accountContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const [wallet, offer, products, orders, packs] = await Promise.all([
      app.prisma.$transaction(async (tx) => {
        return await getWalletSnapshot(tx, request.accountContext!.accountId);
      }),
      getOrCreateAeoStarterOfferState(app.prisma, {
        accountId: request.accountContext.accountId,
      }),
      app.prisma.productMembership.findMany({
        where: {
          accountId: request.accountContext.accountId,
        },
        include: {
          product: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      }),
      listBillingOrders(app.prisma, {
        accountId: request.accountContext.accountId,
        productCode: "aeo",
        limit: 20,
      }),
      listBillingCreditPackOffers(app.prisma, {
        productCode: "aeo",
      }),
    ]);

    reply.send({
      accountId: request.accountContext.accountId,
      wallet,
      starterOffer: offer,
      products: products.map((membership) => ({
        productCode: membership.product.code,
        productName: membership.product.name,
        status: membership.status.toLowerCase(),
      })),
      orders,
      creditPacks: maskUnavailableCheckoutOffers(app.config, packs).map(({providerCode: _providerCode, ...pack}) => pack),
      crossSell: {
        aeoDashboardUrl: "https://aeo.moads.agency/dashboard",
      },
    });
  });

  app.get("/lab/orders", {preHandler: guards}, async (request, reply) => {
    if (!request.accountContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const orders = await listBillingOrders(app.prisma, {
      accountId: request.accountContext.accountId,
      productCode: "aeo",
      limit: 50,
    });

    reply.send({orders});
  });

  app.post("/lab/starter/checkout", {preHandler: guards}, async (request, reply) => {
    if (!request.accountContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const body = request.body as {
      priceId?: unknown;
      attribution?: unknown;
    } | undefined;

    if (typeof body?.priceId !== "string" || !body.priceId.trim()) {
      throw new PlatformError(400, "billing_price_required", "priceId is required.");
    }

    const order = await createBillingCheckoutResponse(app, {
      accountId: request.accountContext.accountId,
      productCode: "aeo",
      priceId: body.priceId.trim(),
      userId: request.authContext?.userId ?? null,
      firebaseUid: request.authContext?.firebaseUid ?? null,
      email: request.authContext?.email ?? null,
      attribution: normalizeCheckoutAttribution(body?.attribution),
    });

    reply.status(201).send(order);
  });

  app.post("/lab/admin/orders/:orderId/manual-fulfill", {
    preHandler: [requireAuth, requireAdminClaim],
  }, async (request, reply) => {
    if (!request.authContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const params = request.params as {orderId?: unknown};
    if (typeof params.orderId !== "string" || !params.orderId.trim()) {
      throw new PlatformError(400, "order_id_required", "orderId is required.");
    }

    const body = request.body as {
      note?: unknown;
    } | undefined;

    const fulfilled = await fulfillBillingOrderManually(app.prisma, {
      orderId: params.orderId.trim(),
      fulfilledByUserId: request.authContext.userId,
      note: typeof body?.note === "string" ? body.note.trim() || null : null,
    });

    reply.send(fulfilled);
  });
}
