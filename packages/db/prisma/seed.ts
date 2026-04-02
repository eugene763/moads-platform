import {PrismaClient} from "@prisma/client";

import {
  BILLING_CREDIT_PACK_PRODUCT_TYPE,
  BILLING_DODO_PROVIDER_CODE,
  buildCreditPackScopeRef,
} from "../src/billing.js";
import {DEFAULT_MOTREND_CREDIT_PACKS} from "../src/motrend-billing.js";
import {DEFAULT_AEO_CREDIT_PACKS} from "../src/aeo-billing.js";

const prisma = new PrismaClient();
const localReferenceVideoUrl = "http://127.0.0.1:5000/reference/dev-template-001-reference.mp4";
const isLocalSeed = process.env.MOADS_ENV === "local";

async function main(): Promise<void> {
  const consumerRealm = await prisma.realm.upsert({
    where: {code: "consumer"},
    update: {name: "Consumer"},
    create: {
      code: "consumer",
      name: "Consumer",
    },
  });

  const proRealm = await prisma.realm.upsert({
    where: {code: "pro"},
    update: {name: "Pro"},
    create: {
      code: "pro",
      name: "Pro",
    },
  });

  const checkoutLinkProvider = await prisma.billingProvider.upsert({
    where: {code: "checkout_link"},
    update: {
      name: "Checkout Link",
      status: "active",
    },
    create: {
      code: "checkout_link",
      name: "Checkout Link",
      status: "active",
    },
  });

  const fastSpringProvider = await prisma.billingProvider.upsert({
    where: {code: "fastspring"},
    update: {
      name: "FastSpring",
      status: "active",
    },
    create: {
      code: "fastspring",
      name: "FastSpring",
      status: "active",
    },
  });

  const dodoProvider = await prisma.billingProvider.upsert({
    where: {code: BILLING_DODO_PROVIDER_CODE},
    update: {
      name: "Dodo Payments",
      status: "active",
    },
    create: {
      code: BILLING_DODO_PROVIDER_CODE,
      name: "Dodo Payments",
      status: "active",
    },
  });

  const existingDefaultPriceBook = await prisma.priceBook.findFirst({
    where: {
      marketCode: "global",
      currencyCode: "USD",
      languageCode: "en",
    },
  });

  const defaultPriceBook = existingDefaultPriceBook ?? await prisma.priceBook.create({
    data: {
      marketCode: "global",
      currencyCode: "USD",
      languageCode: "en",
      taxMode: "exclusive",
      isDefault: true,
    },
  });

  const creditPackGroups = [
    {
      productCode: "motrend",
      packs: DEFAULT_MOTREND_CREDIT_PACKS,
      getProviderId: (pack: {code: string; dodoProductId?: string}) => pack.dodoProductId ? dodoProvider.id : checkoutLinkProvider.id,
      getExternalPriceId: (pack: {code: string; dodoProductId?: string}) => pack.dodoProductId ?? `https://checkout.moads.agency/motrend/${pack.code}`,
    },
    {
      productCode: "aeo",
      packs: DEFAULT_AEO_CREDIT_PACKS,
      getProviderId: (pack: {code: string; dodoProductId?: string; fastspringProductPath?: string}) => pack.dodoProductId ? dodoProvider.id : fastSpringProvider.id,
      getExternalPriceId: (pack: {code: string; dodoProductId?: string; fastspringProductPath?: string}) => pack.dodoProductId ?? pack.fastspringProductPath ?? pack.code,
    },
  ] as const;

  for (const group of creditPackGroups) {
    for (const pack of group.packs) {
      const billingProduct = await prisma.billingProduct.upsert({
        where: {code: pack.code},
        update: {
          name: pack.name,
          status: "active",
          productType: BILLING_CREDIT_PACK_PRODUCT_TYPE,
          scopeType: "product_credits",
          scopeRef: buildCreditPackScopeRef(group.productCode, pack.creditsAmount),
        },
        create: {
          code: pack.code,
          name: pack.name,
          status: "active",
          productType: BILLING_CREDIT_PACK_PRODUCT_TYPE,
          scopeType: "product_credits",
          scopeRef: buildCreditPackScopeRef(group.productCode, pack.creditsAmount),
        },
      });

      const existingPrice = await prisma.billingPrice.findFirst({
        where: {
          billingProductId: billingProduct.id,
          providerId: group.getProviderId(pack),
          priceBookId: defaultPriceBook.id,
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      if (existingPrice) {
        await prisma.billingPrice.update({
          where: {id: existingPrice.id},
          data: {
            amountMinor: pack.amountMinor,
            isActive: true,
            providerId: group.getProviderId(pack),
            externalPriceId: group.getExternalPriceId(pack),
          },
        });
        continue;
      }

      await prisma.billingPrice.create({
        data: {
          billingProductId: billingProduct.id,
          providerId: group.getProviderId(pack),
          priceBookId: defaultPriceBook.id,
          externalPriceId: group.getExternalPriceId(pack),
          amountMinor: pack.amountMinor,
          isActive: true,
        },
      });
    }
  }

  const products = [
    {
      code: "motrend",
      name: "MoTrend",
      entryDomain: "trend.moads.agency",
      realmId: consumerRealm.id,
    },
    {
      code: "lab",
      name: "Lab",
      entryDomain: "lab.moads.agency",
      realmId: proRealm.id,
    },
    {
      code: "aeo",
      name: "AEO",
      entryDomain: "aeo.moads.agency",
      realmId: proRealm.id,
    },
    {
      code: "ugc",
      name: "UGC",
      entryDomain: "ugc.moads.agency",
      realmId: proRealm.id,
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: {code: product.code},
      update: {
        name: product.name,
        entryDomain: product.entryDomain,
        realmId: product.realmId,
      },
      create: product,
    });
  }

  const seededProducts = await prisma.product.findMany({
    where: {
      code: {
        in: ["motrend", "lab", "aeo", "ugc"],
      },
    },
    select: {id: true, code: true},
  });

  const featureMap: Record<string, Array<{code: string; name: string}>> = {
    motrend: [
      {code: "generate", name: "Generate trend video"},
      {code: "download", name: "Download generated trend"},
    ],
    aeo: [
      {code: "scan", name: "Site scan"},
      {code: "public_scan", name: "Public deterministic scan"},
      {code: "unlock_scan", name: "Unlock deterministic report"},
      {code: "generate_ai_tips", name: "Generate AI tips"},
    ],
    lab: [
      {code: "account_center", name: "Account center"},
      {code: "starter_billing", name: "Starter billing and fulfillment"},
    ],
    ugc: [
      {code: "render", name: "UGC render"},
    ],
  };

  for (const product of seededProducts) {
    for (const feature of featureMap[product.code] ?? []) {
      await prisma.feature.upsert({
        where: {
          productId_code: {
            productId: product.id,
            code: feature.code,
          },
        },
        update: {
          name: feature.name,
        },
        create: {
          productId: product.id,
          code: feature.code,
          name: feature.name,
        },
      });
    }
  }

  const motrendProduct = seededProducts.find((product) => product.code === "motrend");
  if (motrendProduct) {
    if (isLocalSeed) {
      await prisma.moTrendTemplate.upsert({
        where: {
          productId_code: {
            productId: motrendProduct.id,
            code: "dev-template-001",
          },
        },
        update: {
          name: "Dev Template 001",
          isActive: true,
          durationSec: 10,
          referenceVideoUrl: localReferenceVideoUrl,
          metadataJson: {
            seeded: true,
            purpose: "local-smoke-test",
            referenceVideoMode: "local-placeholder",
          },
        },
        create: {
          productId: motrendProduct.id,
          code: "dev-template-001",
          name: "Dev Template 001",
          isActive: true,
          durationSec: 10,
          referenceVideoUrl: localReferenceVideoUrl,
          metadataJson: {
            seeded: true,
            purpose: "local-smoke-test",
            referenceVideoMode: "local-placeholder",
          },
        },
      });
    } else {
      await prisma.moTrendTemplate.deleteMany({
        where: {
          productId: motrendProduct.id,
          code: "dev-template-001",
        },
      });
    }
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
