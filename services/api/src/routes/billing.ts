import {FastifyInstance} from "fastify";

import {
  BILLING_CREEM_PROVIDER_CODE,
  BILLING_FASTSPRING_PROVIDER_CODE,
  fulfillBillingOrderFromProvider,
  listBillingCreditPackOffers,
  listBillingOrders,
  PlatformError,
  Prisma,
} from "@moads/db";

import {createBillingCheckoutResponse, normalizeCheckoutAttribution} from "../lib/billing-checkout.js";
import {maskUnavailableCheckoutOffers} from "../lib/billing-offers.js";
import {
  extractCreemCheckoutCompletedSnapshot,
  extractCreemProductId,
  extractCreemWebhookEnvelope,
  isCreemConfigured,
  readCreemBillingOrderId,
  verifyCreemWebhookSignature,
} from "../lib/creem.js";
import {
  extractFastSpringProductPath,
  extractFastSpringWebhookOrderIds,
  isFastSpringConfigured,
  readFastSpringBillingOrderId,
  retrieveFastSpringOrder,
} from "../lib/fastspring.js";
import {requireAuth, resolveAccount} from "../middleware/auth.js";
import {resolveRequestProduct} from "../lib/product-context.js";

interface CheckoutBody {
  priceId?: unknown;
  attribution?: unknown;
}

function readHeaderValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (Array.isArray(value)) {
    const candidate = value.find((item) => typeof item === "string" && item.trim());
    return typeof candidate === "string" ? candidate.trim() : null;
  }

  return null;
}

function buildCheckoutSuccessUrl(request: {
  headers: {
    origin?: string | undefined;
  };
}, product: {
  entryDomain: string;
}): string {
  const origin = typeof request.headers.origin === "string" ? request.headers.origin.trim() : "";
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        parsed.pathname = "/";
        parsed.search = "";
        parsed.hash = "";
        parsed.searchParams.set("checkout", "complete");
        return parsed.toString();
      }
    } catch {
      // no-op
    }
  }

  return `https://${product.entryDomain}/?checkout=complete`;
}

async function upsertWebhookEvent(
  app: FastifyInstance,
  input: {
    providerCode: string;
    providerName: string;
    externalEventId: string;
    eventType: string;
    payloadJson: unknown;
  },
) {
  const provider = await app.prisma.billingProvider.upsert({
    where: {code: input.providerCode},
    update: {
      name: input.providerName,
      status: "active",
    },
    create: {
      code: input.providerCode,
      name: input.providerName,
      status: "active",
    },
  });

  const idempotencyKey = `${input.providerCode}:${input.eventType}:${input.externalEventId}`;
  const existing = await app.prisma.billingWebhookEvent.findUnique({
    where: {idempotencyKey},
  });

  if (existing) {
    if (existing.processedAt && existing.processingStatus === "processed") {
      return {
        record: existing,
        providerId: provider.id,
        alreadyProcessed: true,
      };
    }

    const updated = await app.prisma.billingWebhookEvent.update({
      where: {id: existing.id},
      data: {
        providerId: provider.id,
        payloadJson: input.payloadJson as Prisma.InputJsonValue,
        processingStatus: "pending",
      },
    });

    return {
      record: updated,
      providerId: provider.id,
      alreadyProcessed: false,
    };
  }

  const created = await app.prisma.billingWebhookEvent.create({
    data: {
      providerId: provider.id,
      externalEventId: input.externalEventId,
      eventType: input.eventType,
      payloadJson: input.payloadJson as Prisma.InputJsonValue,
      idempotencyKey,
      processingStatus: "pending",
    },
  });

  return {
    record: created,
    providerId: provider.id,
    alreadyProcessed: false,
  };
}

export async function registerBillingRoutes(app: FastifyInstance): Promise<void> {
  const authGuards = [requireAuth, resolveAccount];

  app.get("/billing/credit-packs", {preHandler: authGuards}, async (request, reply) => {
    if (!request.accountContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const product = await resolveRequestProduct(request);
    const packs = maskUnavailableCheckoutOffers(app.config, await listBillingCreditPackOffers(app.prisma, {
      productCode: product.productCode,
    })).map(({providerCode: _providerCode, ...pack}) => pack);

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

    const body = request.body as CheckoutBody | undefined;
    if (typeof body?.priceId !== "string" || !body.priceId.trim()) {
      throw new PlatformError(400, "billing_price_required", "priceId is required.");
    }

    const product = await resolveRequestProduct(request);
    const order = await createBillingCheckoutResponse(app, {
      accountId: request.accountContext.accountId,
      productCode: product.productCode,
      priceId: body.priceId.trim(),
      userId: request.authContext?.userId ?? null,
      firebaseUid: request.authContext?.firebaseUid ?? null,
      email: request.authContext?.email ?? null,
      successUrl: buildCheckoutSuccessUrl(request, product),
      attribution: normalizeCheckoutAttribution(body?.attribution),
    });

    reply.send(order);
  });

  app.post("/billing/webhooks/fastspring", async (request, reply) => {
    if (!isFastSpringConfigured(app.config)) {
      throw new PlatformError(503, "billing_provider_unavailable", "FastSpring webhook processing is not configured.");
    }

    const payload = request.body as unknown;
    const orderIds = extractFastSpringWebhookOrderIds(payload);
    if (orderIds.length === 0) {
      throw new PlatformError(400, "billing_webhook_invalid", "FastSpring webhook did not include an order id.");
    }

    const results = [];

    for (const externalOrderId of orderIds) {
      const externalOrder = await retrieveFastSpringOrder(app.config, externalOrderId);
      const eventType = "order.completed";
      const eventEnvelope = {
        webhook: payload,
        order: externalOrder.raw,
      };
      const receipt = await upsertWebhookEvent(app, {
        providerCode: BILLING_FASTSPRING_PROVIDER_CODE,
        providerName: "FastSpring",
        externalEventId: externalOrder.externalOrderId,
        eventType,
        payloadJson: eventEnvelope as Prisma.InputJsonValue,
      });

      if (receipt.alreadyProcessed) {
        results.push({
          externalOrderId: externalOrder.externalOrderId,
          status: "duplicate",
        });
        continue;
      }

      if (!externalOrder.completed) {
        await app.prisma.billingWebhookEvent.update({
          where: {id: receipt.record.id},
          data: {
            processingStatus: "ignored",
          },
        });
        results.push({
          externalOrderId: externalOrder.externalOrderId,
          status: "ignored",
        });
        continue;
      }

      const localOrderId = readFastSpringBillingOrderId(externalOrder.tags);
      if (!localOrderId) {
        await app.prisma.billingWebhookEvent.update({
          where: {id: receipt.record.id},
          data: {
            processingStatus: "failed",
          },
        });
        request.log.error({
          externalOrderId: externalOrder.externalOrderId,
          tags: externalOrder.tags,
        }, "fastspring webhook missing local billing order tag");
        results.push({
          externalOrderId: externalOrder.externalOrderId,
          status: "missing_local_order",
        });
        continue;
      }

      const localOrder = await app.prisma.billingOrder.findUnique({
        where: {id: localOrderId},
        include: {
          price: true,
        },
      });
      if (!localOrder) {
        await app.prisma.billingWebhookEvent.update({
          where: {id: receipt.record.id},
          data: {
            processingStatus: "failed",
          },
        });
        throw new PlatformError(404, "billing_order_not_found", "Billing order was not found.");
      }

      const expectedProductPath = extractFastSpringProductPath(localOrder.price?.externalPriceId ?? null);
      if (
        expectedProductPath &&
        !externalOrder.productPaths.includes(expectedProductPath)
      ) {
        await app.prisma.billingWebhookEvent.update({
          where: {id: receipt.record.id},
          data: {
            processingStatus: "failed",
          },
        });
        throw new PlatformError(
          409,
          "billing_order_product_mismatch",
          "Webhook order does not match the local billing product.",
        );
      }

      try {
        const fulfilled = await fulfillBillingOrderFromProvider(app.prisma, {
          orderId: localOrderId,
          externalOrderId: externalOrder.externalOrderId,
          providerCode: BILLING_FASTSPRING_PROVIDER_CODE,
          providerName: "FastSpring",
          fulfilledAt: new Date(),
          eventType,
          metadata: {
            reference: externalOrder.reference,
            currencyCode: externalOrder.currencyCode,
            customerEmail: externalOrder.customerEmail,
            productPaths: externalOrder.productPaths,
            tags: externalOrder.tags,
          },
        });

        await app.prisma.billingWebhookEvent.update({
          where: {id: receipt.record.id},
          data: {
            processedAt: new Date(),
            processingStatus: "processed",
          },
        });

        results.push({
          externalOrderId: externalOrder.externalOrderId,
          orderId: fulfilled.orderId,
          status: "processed",
        });
      } catch (error) {
        await app.prisma.billingWebhookEvent.update({
          where: {id: receipt.record.id},
          data: {
            processingStatus: "failed",
          },
        });
        throw error;
      }
    }

    reply.send({
      received: true,
      processed: results,
    });
  });

  app.post("/billing/webhooks/creem", async (request, reply) => {
    if (!isCreemConfigured(app.config)) {
      throw new PlatformError(503, "billing_provider_unavailable", "Creem webhook processing is not configured.");
    }

    const signatureHeader =
      readHeaderValue(request.headers["creem-signature"] as string | string[] | undefined) ||
      readHeaderValue(request.headers["x-creem-signature"] as string | string[] | undefined);

    if (!verifyCreemWebhookSignature(request.rawBody ?? "", signatureHeader, app.config.creemWebhookSecret ?? null)) {
      throw new PlatformError(401, "billing_webhook_invalid", "Creem webhook signature is invalid.");
    }

    const payload = request.body as unknown;
    const envelope = extractCreemWebhookEnvelope(payload);
    if (!envelope) {
      throw new PlatformError(400, "billing_webhook_invalid", "Creem webhook payload is invalid.");
    }

    const receipt = await upsertWebhookEvent(app, {
      providerCode: BILLING_CREEM_PROVIDER_CODE,
      providerName: "Creem",
      externalEventId: envelope.externalEventId,
      eventType: envelope.eventType,
      payloadJson: payload as Prisma.InputJsonValue,
    });

    if (receipt.alreadyProcessed) {
      reply.send({
        received: true,
        processed: [
          {
            externalEventId: envelope.externalEventId,
            status: "duplicate",
          },
        ],
      });
      return;
    }

    if (envelope.eventType !== "checkout.completed") {
      await app.prisma.billingWebhookEvent.update({
        where: {id: receipt.record.id},
        data: {
          processingStatus: "ignored",
        },
      });

      reply.send({
        received: true,
        processed: [
          {
            externalEventId: envelope.externalEventId,
            status: "ignored",
          },
        ],
      });
      return;
    }

    const checkout = extractCreemCheckoutCompletedSnapshot(envelope.object);
    if (!checkout) {
      await app.prisma.billingWebhookEvent.update({
        where: {id: receipt.record.id},
        data: {
          processingStatus: "failed",
        },
      });
      throw new PlatformError(400, "billing_webhook_invalid", "Creem webhook checkout payload is invalid.");
    }

    if (checkout.checkoutStatus !== "completed" || checkout.orderStatus !== "paid") {
      await app.prisma.billingWebhookEvent.update({
        where: {id: receipt.record.id},
        data: {
          processingStatus: "ignored",
        },
      });

      reply.send({
        received: true,
        processed: [
          {
            externalEventId: envelope.externalEventId,
            checkoutId: checkout.checkoutId,
            status: "ignored",
          },
        ],
      });
      return;
    }

    const localOrderId = readCreemBillingOrderId(checkout);
    if (!localOrderId) {
      await app.prisma.billingWebhookEvent.update({
        where: {id: receipt.record.id},
        data: {
          processingStatus: "failed",
        },
      });
      request.log.error({
        externalEventId: envelope.externalEventId,
        checkoutId: checkout.checkoutId,
        requestId: checkout.requestId,
        metadata: checkout.metadata,
      }, "creem webhook missing local billing order reference");
      reply.send({
        received: true,
        processed: [
          {
            externalEventId: envelope.externalEventId,
            checkoutId: checkout.checkoutId,
            status: "missing_local_order",
          },
        ],
      });
      return;
    }

    const localOrder = await app.prisma.billingOrder.findUnique({
      where: {id: localOrderId},
      include: {
        price: true,
      },
    });
    if (!localOrder) {
      await app.prisma.billingWebhookEvent.update({
        where: {id: receipt.record.id},
        data: {
          processingStatus: "failed",
        },
      });
      throw new PlatformError(404, "billing_order_not_found", "Billing order was not found.");
    }

    const expectedProductId = extractCreemProductId(localOrder.price?.externalPriceId ?? null);
    if (
      expectedProductId &&
      checkout.externalProductId &&
      expectedProductId !== checkout.externalProductId
    ) {
      await app.prisma.billingWebhookEvent.update({
        where: {id: receipt.record.id},
        data: {
          processingStatus: "failed",
        },
      });
      throw new PlatformError(
        409,
        "billing_order_product_mismatch",
        "Webhook order does not match the local billing product.",
      );
    }

    if (!checkout.externalOrderId) {
      await app.prisma.billingWebhookEvent.update({
        where: {id: receipt.record.id},
        data: {
          processingStatus: "failed",
        },
      });
      throw new PlatformError(400, "billing_webhook_invalid", "Creem webhook did not include an order id.");
    }

    try {
      const fulfilled = await fulfillBillingOrderFromProvider(app.prisma, {
        orderId: localOrderId,
        externalOrderId: checkout.externalOrderId,
        providerCode: BILLING_CREEM_PROVIDER_CODE,
        providerName: "Creem",
        fulfilledAt: new Date(),
        eventType: envelope.eventType,
        metadata: {
          checkoutId: checkout.checkoutId,
          requestId: checkout.requestId,
          mode: checkout.mode,
          orderStatus: checkout.orderStatus,
          customerEmail: checkout.customerEmail,
          productId: checkout.externalProductId,
          metadata: checkout.metadata,
        },
      });

      await app.prisma.billingWebhookEvent.update({
        where: {id: receipt.record.id},
        data: {
          processedAt: new Date(),
          processingStatus: "processed",
        },
      });

      reply.send({
        received: true,
        processed: [
          {
            externalEventId: envelope.externalEventId,
            checkoutId: checkout.checkoutId,
            orderId: fulfilled.orderId,
            status: "processed",
          },
        ],
      });
    } catch (error) {
      await app.prisma.billingWebhookEvent.update({
        where: {id: receipt.record.id},
        data: {
          processingStatus: "failed",
        },
      });
      throw error;
    }
  });
}
