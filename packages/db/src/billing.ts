import {
  BillingOrderStatus,
  LedgerEntryType,
  Prisma,
} from "@prisma/client";

import {
  PlatformError,
  assertOrThrow,
} from "./errors.js";
import {
  appendLedgerEntry,
  ensureGlobalCreditsWallet,
  getWalletSnapshot,
} from "./wallet.js";

type DbClient = Prisma.TransactionClient | Prisma.DefaultPrismaClient;

export const BILLING_CREDIT_PACK_PRODUCT_TYPE = "credit_pack";
export const BILLING_CHECKOUT_LINK_PROVIDER_CODE = "checkout_link";
export const BILLING_DODO_PROVIDER_CODE = "dodo";
export const BILLING_FASTSPRING_PROVIDER_CODE = "fastspring";

export interface CreditPackScope {
  productCode: string;
  creditsAmount: number;
}

export interface BillingCreditPackOffer {
  billingProductId: string;
  billingProductCode: string;
  priceId: string;
  name: string;
  creditsAmount: number;
  amountMinor: number;
  currencyCode: string;
  marketCode: string | null;
  languageCode: string | null;
  checkoutConfigured: boolean;
  providerCode: string | null;
}

export interface BillingOrderSummary {
  orderId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  billingProductCode: string;
  billingProductName: string;
  creditsAmount: number;
  amountMinor: number;
  currencyCode: string;
}

export interface BillingCheckoutOrder {
  orderId: string;
  status: string;
  redirectUrl: string;
  billingProductCode: string;
  creditsAmount: number;
  amountMinor: number;
  currencyCode: string;
}

export interface BillingCheckoutOrderDraft {
  orderId: string;
  status: string;
  billingProductCode: string;
  creditsAmount: number;
  amountMinor: number;
  currencyCode: string;
  providerCode: string | null;
  externalPriceId: string | null;
}

export interface BillingManualFulfillmentResult {
  orderId: string;
  status: string;
  billingProductCode: string;
  creditsGranted: number;
  wallet: {
    walletId: string;
    currencyCode: string;
    balance: number;
  };
}

export interface BillingProviderFulfillmentResult {
  orderId: string;
  status: string;
  billingProductCode: string;
  creditsGranted: number;
  externalOrderId: string;
  wallet: {
    walletId: string;
    currencyCode: string;
    balance: number;
  };
}

export function parseCreditPackScopeRef(value: string | null | undefined): CreditPackScope | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const [productCodeRaw, creditsAmountRaw] = trimmed.split(":");
  const productCode = productCodeRaw?.trim().toLowerCase() ?? "";
  const creditsAmount = Number(creditsAmountRaw);

  if (!productCode || !Number.isInteger(creditsAmount) || creditsAmount <= 0) {
    return null;
  }

  return {
    productCode,
    creditsAmount,
  };
}

export function buildCreditPackScopeRef(productCode: string, creditsAmount: number): string {
  return `${productCode.trim().toLowerCase()}:${creditsAmount}`;
}

function normalizeCheckoutUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function asBillingOrderSummary(
  order: {
    id: string;
    status: BillingOrderStatus;
    createdAt: Date;
    updatedAt: Date;
    totalMinor: number;
    currencyCode: string;
    billingProduct: {
      code: string;
      name: string;
      scopeRef: string | null;
    };
  },
): BillingOrderSummary | null {
  const parsedScope = parseCreditPackScopeRef(order.billingProduct.scopeRef);
  if (!parsedScope) {
    return null;
  }

  return {
    orderId: order.id,
    status: order.status.toLowerCase(),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    billingProductCode: order.billingProduct.code,
    billingProductName: order.billingProduct.name,
    creditsAmount: parsedScope.creditsAmount,
    amountMinor: order.totalMinor,
    currencyCode: order.currencyCode,
  };
}

export async function listBillingCreditPackOffers(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    productCode: string;
  },
): Promise<BillingCreditPackOffer[]> {
  const activePrices = await prisma.billingPrice.findMany({
    where: {
      isActive: true,
      billingProduct: {
        productType: BILLING_CREDIT_PACK_PRODUCT_TYPE,
        status: "active",
      },
    },
    include: {
      billingProduct: true,
      priceBook: true,
      provider: true,
    },
    orderBy: [
      {amountMinor: "asc"},
      {createdAt: "asc"},
    ],
  });

  const requestedProductCode = input.productCode.trim().toLowerCase();

  return activePrices
    .map((price) => {
      const parsedScope = parseCreditPackScopeRef(price.billingProduct.scopeRef);
      if (!parsedScope || parsedScope.productCode !== requestedProductCode) {
        return null;
      }

      if (price.priceBook && !price.priceBook.isDefault) {
        return null;
      }

      return {
        billingProductId: price.billingProduct.id,
        billingProductCode: price.billingProduct.code,
        priceId: price.id,
        name: price.billingProduct.name,
        creditsAmount: parsedScope.creditsAmount,
        amountMinor: price.amountMinor,
        currencyCode: price.priceBook?.currencyCode ?? "USD",
        marketCode: price.priceBook?.marketCode ?? null,
        languageCode: price.priceBook?.languageCode ?? null,
        checkoutConfigured: typeof price.externalPriceId === "string" && price.externalPriceId.trim().length > 0,
        providerCode: price.provider?.code ?? null,
      } satisfies BillingCreditPackOffer;
    })
    .filter((offer): offer is BillingCreditPackOffer => offer != null);
}

export async function listBillingOrders(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    accountId: string;
    productCode: string;
    limit?: number;
  },
): Promise<BillingOrderSummary[]> {
  const requestedProductCode = input.productCode.trim().toLowerCase();
  const limit = Number.isInteger(input.limit) && input.limit != null ? Math.max(1, input.limit) : 10;

  const orders = await prisma.billingOrder.findMany({
    where: {
      accountId: input.accountId,
      billingProduct: {
        productType: BILLING_CREDIT_PACK_PRODUCT_TYPE,
      },
    },
    include: {
      billingProduct: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
  });

  return orders
    .map((order) => {
      const summary = asBillingOrderSummary(order);
      if (!summary) {
        return null;
      }

      const parsedScope = parseCreditPackScopeRef(order.billingProduct.scopeRef);
      if (!parsedScope || parsedScope.productCode !== requestedProductCode) {
        return null;
      }

      return summary;
    })
    .filter((order): order is BillingOrderSummary => order != null);
}

export async function createBillingCheckoutOrderDraft(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    accountId: string;
    productCode: string;
    priceId: string;
    attribution?: Prisma.InputJsonValue;
  },
): Promise<BillingCheckoutOrderDraft> {
  return await prisma.$transaction(async (tx) => {
    const price = await tx.billingPrice.findUnique({
      where: {id: input.priceId},
      include: {
        billingProduct: true,
        priceBook: true,
        provider: true,
      },
    });

    assertOrThrow(price, 404, "billing_price_not_found", "Billing price was not found.");
    assertOrThrow(price.isActive, 409, "billing_price_inactive", "Billing price is inactive.");
    assertOrThrow(price.billingProduct.status === "active", 409, "billing_product_inactive", "Billing product is inactive.");
    assertOrThrow(
      price.billingProduct.productType === BILLING_CREDIT_PACK_PRODUCT_TYPE,
      409,
      "billing_product_invalid",
      "Billing price is not a credit pack.",
    );

    const parsedScope = parseCreditPackScopeRef(price.billingProduct.scopeRef);
    assertOrThrow(parsedScope, 409, "billing_scope_invalid", "Billing product scope is invalid.");
    assertOrThrow(
      parsedScope.productCode === input.productCode.trim().toLowerCase(),
      404,
      "billing_price_not_found",
      "Billing price does not belong to this product.",
    );
    assertOrThrow(
      typeof price.externalPriceId === "string" && price.externalPriceId.trim().length > 0,
      409,
      "billing_checkout_unavailable",
      "Checkout is not configured for this credit pack yet.",
    );

    const currencyCode = price.priceBook?.currencyCode?.trim() || "USD";

    const order = await tx.billingOrder.create({
      data: {
        accountId: input.accountId,
        providerId: price.providerId ?? null,
        billingProductId: price.billingProductId,
        priceId: price.id,
        status: BillingOrderStatus.PENDING,
        currencyCode,
        totalMinor: price.amountMinor,
      },
    });

    await tx.auditLog.create({
      data: {
        accountId: input.accountId,
        actionCode: "billing.checkout_order_created",
        targetType: "billing_order",
        targetId: order.id,
        payloadJson: {
          billingProductCode: price.billingProduct.code,
          priceId: price.id,
          providerCode: price.provider?.code ?? null,
          creditsAmount: parsedScope.creditsAmount,
          amountMinor: price.amountMinor,
          currencyCode,
          attribution: input.attribution ?? null,
        },
      },
    });

    return {
      orderId: order.id,
      status: order.status.toLowerCase(),
      billingProductCode: price.billingProduct.code,
      creditsAmount: parsedScope.creditsAmount,
      amountMinor: price.amountMinor,
      currencyCode,
      providerCode: price.provider?.code ?? null,
      externalPriceId: price.externalPriceId ?? null,
    };
  }).catch((error) => {
    if (error instanceof PlatformError) {
      throw error;
    }

    throw error;
  });
}

export async function createBillingCheckoutOrder(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    accountId: string;
    productCode: string;
    priceId: string;
    attribution?: Prisma.InputJsonValue;
  },
): Promise<BillingCheckoutOrder> {
  const draft = await createBillingCheckoutOrderDraft(prisma, input);
  const redirectUrl = normalizeCheckoutUrl(draft.externalPriceId);
  assertOrThrow(
    redirectUrl,
    409,
    "billing_checkout_unavailable",
    "Checkout is not configured for this credit pack yet.",
  );

  return {
    orderId: draft.orderId,
    status: draft.status,
    redirectUrl,
    billingProductCode: draft.billingProductCode,
    creditsAmount: draft.creditsAmount,
    amountMinor: draft.amountMinor,
    currencyCode: draft.currencyCode,
  };
}

export async function fulfillBillingOrderManually(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    orderId: string;
    fulfilledByUserId: string;
    note?: string | null;
  },
): Promise<BillingManualFulfillmentResult> {
  return await prisma.$transaction(async (tx) => {
    const order = await tx.billingOrder.findUnique({
      where: {id: input.orderId},
      include: {
        billingProduct: true,
      },
    });

    assertOrThrow(order, 404, "billing_order_not_found", "Billing order was not found.");
    assertOrThrow(
      order.billingProduct.productType === BILLING_CREDIT_PACK_PRODUCT_TYPE,
      409,
      "billing_order_invalid",
      "Only credit-pack orders can be manually fulfilled.",
    );

    const parsedScope = parseCreditPackScopeRef(order.billingProduct.scopeRef);
    assertOrThrow(parsedScope, 409, "billing_scope_invalid", "Billing product scope is invalid.");

    const scopedProduct = await tx.product.findUnique({
      where: {code: parsedScope.productCode},
    });
    assertOrThrow(scopedProduct, 409, "billing_scope_product_missing", "Credit-pack product is not mapped to catalog.");

    const wallet = await ensureGlobalCreditsWallet(tx, order.accountId);
    const operationKey = `billing_order_paid:${order.id}`;

    const existingLedger = await tx.ledgerEntry.findUnique({
      where: {operationKey},
    });

    if (!existingLedger) {
      await appendLedgerEntry(tx, {
        walletId: wallet.id,
        accountId: order.accountId,
        productId: scopedProduct.id,
        entryType: LedgerEntryType.PURCHASE,
        amountDelta: parsedScope.creditsAmount,
        reasonCode: "billing_order_paid_manual",
        refType: "billing_order",
        refId: order.id,
        operationKey,
        metadataJson: {
          billingProductCode: order.billingProduct.code,
          fulfilledByUserId: input.fulfilledByUserId,
          note: input.note ?? null,
        },
      });
    }

    if (order.status !== BillingOrderStatus.PAID) {
      await tx.billingOrder.update({
        where: {id: order.id},
        data: {
          status: BillingOrderStatus.PAID,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        accountId: order.accountId,
        userId: input.fulfilledByUserId,
        actionCode: "billing.order_manual_fulfilled",
        targetType: "billing_order",
        targetId: order.id,
        payloadJson: {
          billingProductCode: order.billingProduct.code,
          creditsGranted: parsedScope.creditsAmount,
          note: input.note ?? null,
        },
      },
    });

    const walletSnapshot = await getWalletSnapshot(tx, order.accountId);

    return {
      orderId: order.id,
      status: BillingOrderStatus.PAID.toLowerCase(),
      billingProductCode: order.billingProduct.code,
      creditsGranted: parsedScope.creditsAmount,
      wallet: walletSnapshot,
    };
  });
}

export async function fulfillBillingOrderFromProvider(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    orderId: string;
    externalOrderId: string;
    providerCode: string;
    providerName?: string | null;
    fulfilledAt?: Date | null;
    eventType?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
): Promise<BillingProviderFulfillmentResult> {
  return await prisma.$transaction(async (tx) => {
    const order = await tx.billingOrder.findUnique({
      where: {id: input.orderId},
      include: {
        billingProduct: true,
      },
    });

    assertOrThrow(order, 404, "billing_order_not_found", "Billing order was not found.");
    assertOrThrow(
      order.billingProduct.productType === BILLING_CREDIT_PACK_PRODUCT_TYPE,
      409,
      "billing_order_invalid",
      "Only credit-pack orders can be fulfilled by provider.",
    );

    if (order.externalOrderId && order.externalOrderId !== input.externalOrderId) {
      throw new PlatformError(
        409,
        "billing_order_external_mismatch",
        "Billing order was already linked to another external order.",
      );
    }

    const parsedScope = parseCreditPackScopeRef(order.billingProduct.scopeRef);
    assertOrThrow(parsedScope, 409, "billing_scope_invalid", "Billing product scope is invalid.");

    const scopedProduct = await tx.product.findUnique({
      where: {code: parsedScope.productCode},
    });
    assertOrThrow(scopedProduct, 409, "billing_scope_product_missing", "Credit-pack product is not mapped to catalog.");

    const provider = await tx.billingProvider.upsert({
      where: {code: input.providerCode},
      update: {
        name: input.providerName?.trim() || "FastSpring",
        status: "active",
      },
      create: {
        code: input.providerCode,
        name: input.providerName?.trim() || "FastSpring",
        status: "active",
      },
    });

    const wallet = await ensureGlobalCreditsWallet(tx, order.accountId);
    const operationKey = `billing_order_paid:${order.id}`;

    const existingLedger = await tx.ledgerEntry.findUnique({
      where: {operationKey},
    });

    if (!existingLedger) {
      await appendLedgerEntry(tx, {
        walletId: wallet.id,
        accountId: order.accountId,
        productId: scopedProduct.id,
        entryType: LedgerEntryType.PURCHASE,
        amountDelta: parsedScope.creditsAmount,
        reasonCode: `${input.providerCode}_order_paid`,
        refType: "billing_order",
        refId: order.id,
        operationKey,
        metadataJson: {
          externalOrderId: input.externalOrderId,
          providerCode: input.providerCode,
          eventType: input.eventType ?? null,
          providerMetadata: input.metadata ?? null,
        },
      });
    }

    if (
      order.status !== BillingOrderStatus.PAID ||
      order.externalOrderId !== input.externalOrderId ||
      order.providerId !== provider.id
    ) {
      await tx.billingOrder.update({
        where: {id: order.id},
        data: {
          status: BillingOrderStatus.PAID,
          externalOrderId: input.externalOrderId,
          providerId: provider.id,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        accountId: order.accountId,
        actionCode: "billing.order_provider_fulfilled",
        targetType: "billing_order",
        targetId: order.id,
        payloadJson: {
          billingProductCode: order.billingProduct.code,
          creditsGranted: parsedScope.creditsAmount,
          externalOrderId: input.externalOrderId,
          providerCode: input.providerCode,
          eventType: input.eventType ?? null,
          fulfilledAt: input.fulfilledAt ? input.fulfilledAt.toISOString() : null,
          providerMetadata: input.metadata ?? null,
        },
      },
    });

    const walletSnapshot = await getWalletSnapshot(tx, order.accountId);

    return {
      orderId: order.id,
      status: BillingOrderStatus.PAID.toLowerCase(),
      billingProductCode: order.billingProduct.code,
      creditsGranted: parsedScope.creditsAmount,
      externalOrderId: input.externalOrderId,
      wallet: walletSnapshot,
    };
  });
}
