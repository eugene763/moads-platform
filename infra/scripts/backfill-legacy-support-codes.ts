import {applicationDefault, getApps, initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";

import {
  AccountType,
  legacySupportCodeBase,
  normalizeSupportCode,
  PrismaClient,
} from "@moads/db";

const prisma = new PrismaClient();

async function main() {
  const runtimeProfile = process.env.MOADS_ENV;
  if (runtimeProfile === "local") {
    throw new Error("Legacy support-code backfill is cloud-only. Use a dev-cloud or prod profile explicitly.");
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID is required.");
  }

  if (projectId.startsWith("demo-")) {
    throw new Error("Legacy support-code backfill cannot run against a demo Firebase project.");
  }

  const app = getApps()[0] ?? initializeApp({
    credential: applicationDefault(),
    projectId,
  });
  const firestore = getFirestore(app);

  const supportProfiles = await prisma.supportProfile.findMany({
    include: {
      account: true,
      user: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let conflicts = 0;

  for (const profile of supportProfiles) {
    scanned += 1;

    if (profile.account.accountType !== AccountType.PERSONAL) {
      skipped += 1;
      continue;
    }

    let desiredSupportCode: string | null = null;
    try {
      const userDoc = await firestore.collection("users").doc(profile.user.firebaseUid).get();
      const supportCodeRaw = userDoc.data()?.supportCode;
      if (typeof supportCodeRaw === "string") {
        desiredSupportCode = normalizeSupportCode(supportCodeRaw);
      }
    } catch {
      desiredSupportCode = null;
    }

    if (!desiredSupportCode) {
      desiredSupportCode = legacySupportCodeBase(profile.user.firebaseUid);
    }

    if (profile.supportCode === desiredSupportCode) {
      skipped += 1;
      continue;
    }

    const existingOwner = await prisma.supportProfile.findUnique({
      where: {supportCode: desiredSupportCode},
      select: {
        accountId: true,
      },
    });
    if (existingOwner && existingOwner.accountId !== profile.accountId) {
      conflicts += 1;
      continue;
    }

    await prisma.supportProfile.update({
      where: {id: profile.id},
      data: {
        supportCode: desiredSupportCode,
      },
    });
    updated += 1;
  }

  console.log(JSON.stringify({
    scanned,
    updated,
    skipped,
    conflicts,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
