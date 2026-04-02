import {PrismaClient} from "@prisma/client";

import {
  BILLING_CHECKOUT_LINK_PROVIDER_CODE,
  BILLING_DODO_PROVIDER_CODE,
  BILLING_FASTSPRING_PROVIDER_CODE,
  BILLING_CREDIT_PACK_PRODUCT_TYPE,
  buildCreditPackScopeRef,
} from "../../packages/db/src/billing.js";
import {DEFAULT_MOTREND_CREDIT_PACKS} from "../../packages/db/src/motrend-billing.js";

interface CreditPackSeedInput {
  code: string;
  name: string;
  creditsAmount: number;
  amountMinor: number;
  providerCode?: string;
  checkoutUrl?: string;
  dodoProductId?: string;
  fastspringProductPath?: string;
  currencyCode?: string;
  marketCode?: string;
  languageCode?: string;
}

const prisma = new PrismaClient();

function readPackInputs(): CreditPackSeedInput[] {
  const raw = process.env.MOTREND_CREDIT_PACKS_JSON?.trim();
  if (!raw) {
    return DEFAULT_MOTREND_CREDIT_PACKS.map((pack) => ({
      ...pack,
      providerCode: pack.dodoProductId ? BILLING_DODO_PROVIDER_CODE : BILLING_FASTSPRING_PROVIDER_CODE,
      checkoutUrl: pack.dodoProductId ?? pack.fastspringProductPath,
      currencyCode: "USD",
      marketCode: "global",
      languageCode: "en",
    }));
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("MOTREND_CREDIT_PACKS_JSON must be a non-empty array.");
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Credit pack at index ${index} must be an object.`);
    }

    const code = typeof item.code === "string" ? item.code.trim() : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const creditsAmount = Number((item as {creditsAmount?: unknown}).creditsAmount);
    const amountMinor = Number((item as {amountMinor?: unknown}).amountMinor);
    const providerCode = typeof (item as {providerCode?: unknown}).providerCode === "string" ?
      (item as {providerCode?: string}).providerCode?.trim().toLowerCase() :
      "";
    const checkoutUrl = typeof (item as {checkoutUrl?: unknown}).checkoutUrl === "string" ?
      (item as {checkoutUrl?: string}).checkoutUrl?.trim() :
      "";
    const dodoProductId = typeof (item as {dodoProductId?: unknown}).dodoProductId === "string" ?
      (item as {dodoProductId?: string}).dodoProductId?.trim() :
      "";
    const fastspringProductPath = typeof (item as {fastspringProductPath?: unknown}).fastspringProductPath === "string" ?
      (item as {fastspringProductPath?: string}).fastspringProductPath?.trim() :
      "";
    const currencyCode = typeof (item as {currencyCode?: unknown}).currencyCode === "string" ?
      (item as {currencyCode?: string}).currencyCode?.trim().toUpperCase() :
      "USD";
    const marketCode = typeof (item as {marketCode?: unknown}).marketCode === "string" ?
      (item as {marketCode?: string}).marketCode?.trim().toLowerCase() :
      "global";
    const languageCode = typeof (item as {languageCode?: unknown}).languageCode === "string" ?
      (item as {languageCode?: string}).languageCode?.trim().toLowerCase() :
      "en";

    if (!code || !name || !Number.isInteger(creditsAmount) || creditsAmount <= 0 || !Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw new Error(`Credit pack at index ${index} is invalid.`);
    }

    return {
      code,
      name,
      creditsAmount,
      amountMinor,
      ...(providerCode ? {providerCode} : {}),
      ...((dodoProductId || fastspringProductPath || checkoutUrl) ? {checkoutUrl: dodoProductId || fastspringProductPath || checkoutUrl} : {}),
      ...(dodoProductId ? {dodoProductId} : {}),
      ...(fastspringProductPath ? {fastspringProductPath} : {}),
      currencyCode,
      marketCode,
      languageCode,
    };
  });
}

function resolveProviderCode(input: CreditPackSeedInput): string {
  if (typeof input.providerCode === "string" && input.providerCode.trim()) {
    return input.providerCode.trim().toLowerCase();
  }

  if (input.dodoProductId) {
    return BILLING_DODO_PROVIDER_CODE;
  }

  if (input.fastspringProductPath) {
    return BILLING_FASTSPRING_PROVIDER_CODE;
  }

  return BILLING_CHECKOUT_LINK_PROVIDER_CODE;
}

function providerNameFromCode(providerCode: string): string {
  if (providerCode === BILLING_DODO_PROVIDER_CODE) {
    return "Dodo Payments";
  }

  if (providerCode === BILLING_FASTSPRING_PROVIDER_CODE) {
    return "FastSpring";
  }

  if (providerCode === BILLING_CHECKOUT_LINK_PROVIDER_CODE) {
    return "Checkout Link";
  }

  return providerCode;
}

async function ensureProvider(providerCode: string) {
  return await prisma.billingProvider.upsert({
    where: {code: providerCode},
    update: {
      name: providerNameFromCode(providerCode),
      status: "active",
    },
    create: {
      code: providerCode,
      name: providerNameFromCode(providerCode),
      status: "active",
    },
  });
}

async function ensurePriceBook(input: Required<Pick<CreditPackSeedInput, "currencyCode" | "marketCode" | "languageCode">>) {
  const existing = await prisma.priceBook.findFirst({
    where: {
      marketCode: input.marketCode,
      currencyCode: input.currencyCode,
      languageCode: input.languageCode,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (existing) {
    return existing;
  }

  return await prisma.priceBook.create({
    data: {
      marketCode: input.marketCode,
      currencyCode: input.currencyCode,
      languageCode: input.languageCode,
      taxMode: "exclusive",
      isDefault: input.marketCode === "global" && input.currencyCode === "USD" && input.languageCode === "en",
    },
  });
}

async function main(): Promise<void> {
  const packs = readPackInputs();

  for (const pack of packs) {
    const provider = await ensureProvider(resolveProviderCode(pack));
    const priceBook = await ensurePriceBook({
      currencyCode: pack.currencyCode ?? "USD",
      marketCode: pack.marketCode ?? "global",
      languageCode: pack.languageCode ?? "en",
    });

    const billingProduct = await prisma.billingProduct.upsert({
      where: {code: pack.code},
      update: {
        name: pack.name,
        status: "active",
        productType: BILLING_CREDIT_PACK_PRODUCT_TYPE,
        scopeType: "product_credits",
        scopeRef: buildCreditPackScopeRef("motrend", pack.creditsAmount),
      },
      create: {
        code: pack.code,
        name: pack.name,
        status: "active",
        productType: BILLING_CREDIT_PACK_PRODUCT_TYPE,
        scopeType: "product_credits",
        scopeRef: buildCreditPackScopeRef("motrend", pack.creditsAmount),
      },
    });

    const existingPrice = await prisma.billingPrice.findFirst({
      where: {
        billingProductId: billingProduct.id,
        priceBookId: priceBook.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (existingPrice) {
      await prisma.billingPrice.update({
        where: {id: existingPrice.id},
        data: {
          providerId: provider.id,
          amountMinor: pack.amountMinor,
          isActive: true,
          ...("checkoutUrl" in pack ? {externalPriceId: pack.checkoutUrl ?? null} : {}),
        },
      });
      continue;
    }

    await prisma.billingPrice.create({
      data: {
        billingProductId: billingProduct.id,
        providerId: provider.id,
        priceBookId: priceBook.id,
        amountMinor: pack.amountMinor,
        isActive: true,
        ...("checkoutUrl" in pack ? {externalPriceId: pack.checkoutUrl ?? null} : {}),
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
