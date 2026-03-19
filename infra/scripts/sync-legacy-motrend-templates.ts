import {PrismaClient} from "@moads/db";
import {applicationDefault, getApps, initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const normalized = value.trim();
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.max(1, Math.ceil(parsed));
  }

  return fallback;
}

async function main() {
  const runtimeProfile = process.env.MOADS_ENV;
  if (runtimeProfile === "local") {
    throw new Error("Legacy template sync is cloud-only. Use a dev-cloud or prod profile explicitly.");
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID is required.");
  }

  if (projectId.startsWith("demo-")) {
    throw new Error("Legacy template sync cannot run against a demo Firebase project.");
  }

  const app = getApps()[0] ?? initializeApp({
    credential: applicationDefault(),
    projectId,
  });

  const firestore = getFirestore(app);
  const prisma = new PrismaClient();

  try {
    const product = await prisma.product.findUnique({
      where: {code: "motrend"},
      select: {id: true},
    });
    if (!product) {
      throw new Error("Product motrend was not found in SQL catalog.");
    }

    const snapshot = await firestore.collection("templates").get();
    const results = [];

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() || {};
      const title = pickString(data.title, docSnap.id, "Template") || "Template";
      const referenceVideoUrl = pickString(
        data.referenceVideoUrl,
        data.kling?.referenceVideoUrl,
      );
      const durationSec = positiveInt(data.durationSec, 10);
      const isActive = data.isActive === true;
      const modeDefault = pickString(data.modeDefault, "std") || "std";
      const order = Number.isFinite(Number(data.order)) ? Number(data.order) : null;

      const upserted = await prisma.moTrendTemplate.upsert({
        where: {
          productId_code: {
            productId: product.id,
            code: docSnap.id,
          },
        },
        update: {
          name: title,
          isActive,
          durationSec,
          referenceVideoUrl,
          metadataJson: {
            legacySource: "firestore",
            legacyTemplateId: docSnap.id,
            title,
            modeDefault,
            order,
            preview: data.preview ?? null,
          },
        },
        create: {
          productId: product.id,
          code: docSnap.id,
          name: title,
          isActive,
          durationSec,
          referenceVideoUrl,
          metadataJson: {
            legacySource: "firestore",
            legacyTemplateId: docSnap.id,
            title,
            modeDefault,
            order,
            preview: data.preview ?? null,
          },
        },
      });

      results.push({
        id: upserted.id,
        code: upserted.code,
        name: upserted.name,
        isActive: upserted.isActive,
        durationSec: upserted.durationSec,
      });
    }

    console.log(JSON.stringify({
      syncedCount: results.length,
      templates: results,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
