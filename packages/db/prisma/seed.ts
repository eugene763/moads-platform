import {PrismaClient} from "@prisma/client";

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
    lab: [
      {code: "account_center", name: "Account center"},
    ],
    aeo: [
      {code: "scan", name: "Site scan"},
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
