import {PrismaClient} from "@prisma/client";

import {
  BILLING_CHECKOUT_LINK_PROVIDER_CODE,
  BILLING_FASTSPRING_PROVIDER_CODE,
  BILLING_CREEM_PROVIDER_CODE,
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
  creemProductId?: string;
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
      ...(pack.creemProductId ? {
        providerCode: BILLING_CREEM_PROVIDER_CODE,
        creemProductId: pack.creemProductId,
      } : {}),
      ...(pack.fastspringProductPath ? {
        providerCode: BILLING_FASTSPRING_PROVIDER_CODE,
        fastspringProductPath: pack.fastspringProductPath,
      } : {}),
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
    const creemProductId = typeof (item as {creemProductId?: unknown}).creemProductId === "string" ?
      (item as {creemProductId?: string}).creemProductId?.trim() :
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
      ...((fastspringProductPath || checkoutUrl) ? {checkoutUrl: fastspringProductPath || checkoutUrl} : {}),
      ...(creemProductId ? {creemProductId} : {}),
      ...(fastspringProductPath ? {fastspringProductPath} : {}),
      currencyCode,
      marketCode,
      languageCode,
    };
  });
}

async function ensureProvider(providerCode: string) {
  const definition = {
    [BILLING_CHECKOUT_LINK_PROVIDER_CODE]: {
      name: "Checkout Link",
    },
    [BILLING_FASTSPRING_PROVIDER_CODE]: {
      name: "FastSpring",
    },
    [BILLING_CREEM_PROVIDER_CODE]: {
      name: "Creem",
    },
  } as const;

  const provider = definition[providerCode as keyof typeof definition];
  if (!provider) {
    throw new Error(`Unsupported billing provider: ${providerCode}`);
  }

  return await prisma.billingProvider.upsert({
    where: {code: providerCode},
    update: {
      name: provider.name,
      status: "active",
    },
    create: {
      code: providerCode,
      name: provider.name,
      status: "active",
    },
  });
}

function resolveProviderConfig(pack: CreditPackSeedInput, index: number): {
  providerCode: string;
  externalPriceId: string;
} {
  const explicitProviderCode = typeof pack.providerCode === "string" ? pack.providerCode.trim().toLowerCase() : "";

  const providerCode = explicitProviderCode ||
    (pack.creemProductId ? BILLING_CREEM_PROVIDER_CODE : "") ||
    (pack.fastspringProductPath ? BILLING_FASTSPRING_PROVIDER_CODE : "") ||
    (pack.checkoutUrl ? BILLING_CHECKOUT_LINK_PROVIDER_CODE : "");

  if (!providerCode) {
    throw new Error(
      `Credit pack at index ${index} is missing providerCode/checkout configuration. ` +
      "Set providerCode plus creemProductId, fastspringProductPath, or checkoutUrl.",
    );
  }

  if (providerCode === BILLING_CREEM_PROVIDER_CODE) {
    const externalPriceId = pack.creemProductId?.trim() || pack.checkoutUrl?.trim() || "";
    if (!externalPriceId) {
      throw new Error(`Creem credit pack at index ${index} requires creemProductId.`);
    }
    return {providerCode, externalPriceId};
  }

  if (providerCode === BILLING_FASTSPRING_PROVIDER_CODE) {
    const externalPriceId = pack.fastspringProductPath?.trim() || pack.checkoutUrl?.trim() || "";
    if (!externalPriceId) {
      throw new Error(`FastSpring credit pack at index ${index} requires fastspringProductPath.`);
    }
    return {providerCode, externalPriceId};
  }

  if (providerCode === BILLING_CHECKOUT_LINK_PROVIDER_CODE) {
    const externalPriceId = pack.checkoutUrl?.trim() || "";
    if (!externalPriceId) {
      throw new Error(`Checkout-link credit pack at index ${index} requires checkoutUrl.`);
    }
    return {providerCode, externalPriceId};
  }

  throw new Error(`Unsupported providerCode at index ${index}: ${providerCode}`);
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
  const providerIds = new Map<string, string>();

  for (const [index, pack] of packs.entries()) {
    const providerConfig = resolveProviderConfig(pack, index);
    const providerId = providerIds.get(providerConfig.providerCode) ??
      (await ensureProvider(providerConfig.providerCode)).id;
    providerIds.set(providerConfig.providerCode, providerId);

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
          providerId,
          amountMinor: pack.amountMinor,
          isActive: true,
          externalPriceId: providerConfig.externalPriceId,
        },
      });
      continue;
    }

    await prisma.billingPrice.create({
      data: {
        billingProductId: billingProduct.id,
        providerId,
        priceBookId: priceBook.id,
        amountMinor: pack.amountMinor,
        isActive: true,
        externalPriceId: providerConfig.externalPriceId,
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
