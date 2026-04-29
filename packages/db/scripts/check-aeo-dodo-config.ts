import {PrismaClient} from "@prisma/client";

import {BILLING_DODO_PROVIDER_CODE, parseCreditPackScopeRef} from "../src/billing.js";

const prisma = new PrismaClient();

function readArg(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() || null : null;
}

function hasValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function maskId(value: string | null): string {
  if (!value) {
    return "<empty>";
  }

  if (value.length <= 10) {
    return "<set>";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function assertExpected(name: string, actual: string | undefined, expected: string | null): void {
  if (!expected) {
    return;
  }

  if ((actual ?? "").trim() !== expected) {
    throw new Error(`${name} expected ${expected}, got ${actual ?? "<unset>"}.`);
  }
}

async function main(): Promise<void> {
  const expectedMoadsEnv = readArg("expect-moads-env");
  const expectedDodoEnvironment = readArg("expect-dodo-environment");

  assertExpected("MOADS_ENV", process.env.MOADS_ENV, expectedMoadsEnv);
  assertExpected("DODO_ENVIRONMENT", process.env.DODO_ENVIRONMENT, expectedDodoEnvironment);

  const prices = await prisma.billingPrice.findMany({
    where: {
      isActive: true,
      billingProduct: {
        productType: "credit_pack",
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

  const aeoPrices = prices
    .map((price) => {
      const scope = parseCreditPackScopeRef(price.billingProduct.scopeRef);
      if (scope?.productCode !== "aeo") {
        return null;
      }

      return {
        code: price.billingProduct.code,
        name: price.billingProduct.name,
        creditsAmount: scope.creditsAmount,
        amountMinor: price.amountMinor,
        currencyCode: price.priceBook?.currencyCode ?? "USD",
        providerCode: price.provider?.code ?? null,
        externalPriceId: price.externalPriceId ?? null,
      };
    })
    .filter((price): price is NonNullable<typeof price> => price != null);

  console.log("AEO Dodo dev preflight");
  console.log(`MOADS_ENV=${process.env.MOADS_ENV ?? "<unset>"}`);
  console.log(`API_BASE_URL=${process.env.API_BASE_URL ?? "<unset>"}`);
  console.log(`DODO_ENVIRONMENT=${process.env.DODO_ENVIRONMENT ?? "<unset>"}`);
  console.log(`DODO_API_KEY=${hasValue(process.env.DODO_API_KEY) || hasValue(process.env.DODO_PAYMENTS_API_KEY) ? "<set>" : "<unset>"}`);
  console.log(`DODO_WEBHOOK_KEY=${hasValue(process.env.DODO_WEBHOOK_KEY) || hasValue(process.env.DODO_WEBHOOK_SECRET) || hasValue(process.env.DODO_PAYMENTS_WEBHOOK_KEY) || hasValue(process.env.DODO_PAYMENTS_WEBHOOK_SECRET) ? "<set>" : "<unset>"}`);
  console.log(`AEO packs=${aeoPrices.length}`);

  for (const price of aeoPrices) {
    console.log([
      `- ${price.code}`,
      `${price.creditsAmount} credits`,
      `${(price.amountMinor / 100).toFixed(2)} ${price.currencyCode}`,
      `provider=${price.providerCode ?? "<unset>"}`,
      `externalPriceId=${maskId(price.externalPriceId)}`,
    ].join(" | "));
  }

  const nonDodo = aeoPrices.filter((price) => price.providerCode !== BILLING_DODO_PROVIDER_CODE);
  if (nonDodo.length > 0) {
    throw new Error(`AEO packs must use Dodo provider. Non-Dodo packs: ${nonDodo.map((price) => price.code).join(", ")}.`);
  }

  const missingExternalIds = aeoPrices.filter((price) => !price.externalPriceId?.trim());
  if (missingExternalIds.length > 0) {
    throw new Error(`AEO packs are missing Dodo product ids: ${missingExternalIds.map((price) => price.code).join(", ")}.`);
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
