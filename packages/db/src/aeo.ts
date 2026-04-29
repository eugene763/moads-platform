import {randomBytes} from "node:crypto";

import {
  LedgerEntryType,
  Prisma,
} from "@prisma/client";

import {assertOrThrow} from "./errors.js";
import {
  debitWalletCredits,
  ensureGlobalCreditsWallet,
  getWalletSnapshot,
} from "./wallet.js";

type DbClient = Prisma.TransactionClient | Prisma.DefaultPrismaClient;
export const AEO_KEY_PAGE_SITE_SCAN_CREDIT_COST = 1;

function createToken(bytes = 18): string {
  return randomBytes(bytes).toString("base64url");
}

function extractRootUrl(value: string): {
  rootUrl: string;
  normalizedRootUrl: string;
} {
  const parsed = new URL(value);
  const rootUrl = `${parsed.protocol}//${parsed.host}/`;
  return {
    rootUrl,
    normalizedRootUrl: `${parsed.hostname.toLowerCase()}/`,
  };
}

function parseJsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function shapeScanDetail(scan: {
  id: string;
  accountId: string | null;
  userId: string | null;
  siteId: string | null;
  anonymousSessionId: string | null;
  scanKind: string;
  siteUrl: string;
  normalizedUrl: string;
  finalUrl: string | null;
  httpStatus: number | null;
  status: string;
  publicScore: number | null;
  confidenceLevel: string | null;
  recommendationsLocked: boolean;
  isClaimed: boolean;
  publicToken: string;
  scoreVersion: string;
  createdAt: Date;
  updatedAt: Date;
  reports: Array<{
    id: string;
    rulesetVersion: string;
    promptVersion: string;
    reportJson: Prisma.JsonValue;
    recommendationsJson: Prisma.JsonValue | null;
    extractedFactsJson: Prisma.JsonValue | null;
    issuesJson: Prisma.JsonValue | null;
    signalBlocksJson: Prisma.JsonValue | null;
    rawFetchMetaJson: Prisma.JsonValue | null;
    aiTipsJson: Prisma.JsonValue | null;
    aiTipsGeneratedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  site: {
    id: string;
    rootUrl: string;
    normalizedRootUrl: string;
    displayName: string | null;
    siteTypeGuess: string;
    status: string;
  } | null;
}) {
  const latestReport = scan.reports[0] ?? null;
  const reportJson = parseJsonObject(latestReport?.reportJson);
  const issues = Array.isArray(latestReport?.issuesJson) ? latestReport.issuesJson : [];
  const recommendations = Array.isArray(latestReport?.recommendationsJson) ? latestReport.recommendationsJson : [];
  const extractedFacts = parseJsonObject(latestReport?.extractedFactsJson);
  const signalBlocks = parseJsonObject(latestReport?.signalBlocksJson);
  const rawFetchMeta = parseJsonObject(latestReport?.rawFetchMetaJson);
  const aiTips = parseJsonObject(latestReport?.aiTipsJson);

  return {
    scanId: scan.id,
    accountId: scan.accountId,
    userId: scan.userId,
    siteId: scan.siteId,
    anonymousSessionId: scan.anonymousSessionId,
    scanKind: scan.scanKind,
    siteUrl: scan.siteUrl,
    normalizedUrl: scan.normalizedUrl,
    finalUrl: scan.finalUrl,
    httpStatus: scan.httpStatus,
    status: scan.status.toLowerCase(),
    publicScore: scan.publicScore,
    confidenceLevel: scan.confidenceLevel,
    recommendationsLocked: scan.recommendationsLocked,
    isClaimed: scan.isClaimed,
    publicToken: scan.publicToken,
    scoreVersion: scan.scoreVersion,
    createdAt: scan.createdAt,
    updatedAt: scan.updatedAt,
    report: reportJson,
    issues,
    recommendations,
    extractedFacts,
    signalBlocks,
    rawFetchMeta,
    aiTips,
    aiTipsGeneratedAt: latestReport?.aiTipsGeneratedAt ?? null,
    rulesetVersion: latestReport?.rulesetVersion ?? null,
    promptVersion: latestReport?.promptVersion ?? null,
    site: scan.site,
  };
}

export interface CreateAeoPublicScanInput {
  anonymousSessionId?: string | null;
  siteUrl: string;
  normalizedUrl: string;
  finalUrl?: string | null;
  httpStatus?: number | null;
  status: string;
  publicScore?: number | null;
  confidenceLevel?: string | null;
  scoreVersion?: string;
  reportJson: Prisma.InputJsonValue;
  recommendationsJson?: Prisma.InputJsonValue | null;
  extractedFactsJson?: Prisma.InputJsonValue | null;
  issuesJson?: Prisma.InputJsonValue | null;
  signalBlocksJson?: Prisma.InputJsonValue | null;
  rawFetchMetaJson?: Prisma.InputJsonValue | null;
  rulesetVersion?: string;
  promptVersion?: string;
}

export async function createAeoPublicScan(
  prisma: Prisma.DefaultPrismaClient,
  input: CreateAeoPublicScanInput,
) {
  return await prisma.$transaction(async (tx) => {
    const created = await tx.aeoScan.create({
      data: {
        anonymousSessionId: input.anonymousSessionId ?? null,
        siteUrl: input.siteUrl,
        normalizedUrl: input.normalizedUrl,
        finalUrl: input.finalUrl ?? null,
        httpStatus: input.httpStatus ?? null,
        status: input.status,
        publicScore: input.publicScore ?? null,
        confidenceLevel: input.confidenceLevel ?? null,
        recommendationsLocked: true,
        isClaimed: false,
        scanKind: "public_page",
        publicToken: createToken(),
        scoreVersion: input.scoreVersion ?? "v1",
      },
    });

    await tx.aeoScanReport.create({
      data: {
        scanId: created.id,
        rulesetVersion: input.rulesetVersion ?? "aeo_rules_v1",
        promptVersion: input.promptVersion ?? "deterministic_v1",
        reportJson: input.reportJson,
        recommendationsJson: input.recommendationsJson ?? Prisma.JsonNull,
        extractedFactsJson: input.extractedFactsJson ?? Prisma.JsonNull,
        issuesJson: input.issuesJson ?? Prisma.JsonNull,
        signalBlocksJson: input.signalBlocksJson ?? Prisma.JsonNull,
        rawFetchMetaJson: input.rawFetchMetaJson ?? Prisma.JsonNull,
      },
    });

    return {
      scanId: created.id,
      publicToken: created.publicToken,
      status: created.status.toLowerCase(),
      resultUrl: `/aeo/r/${created.publicToken}`,
    };
  });
}

export async function createAeoSiteScan(
  prisma: Prisma.DefaultPrismaClient,
  input: CreateAeoPublicScanInput & {
    accountId: string;
    userId: string;
  },
) {
  return await prisma.$transaction(async (tx) => {
    const site = await ensureAeoSiteForClaim(tx, {
      accountId: input.accountId,
      userId: input.userId,
      normalizedUrl: input.normalizedUrl,
    });

    const created = await tx.aeoScan.create({
      data: {
        accountId: input.accountId,
        userId: input.userId,
        siteId: site.id,
        anonymousSessionId: input.anonymousSessionId ?? null,
        siteUrl: input.siteUrl,
        normalizedUrl: input.normalizedUrl,
        finalUrl: input.finalUrl ?? null,
        httpStatus: input.httpStatus ?? null,
        status: input.status,
        publicScore: input.publicScore ?? null,
        confidenceLevel: input.confidenceLevel ?? null,
        recommendationsLocked: false,
        isClaimed: true,
        scanKind: "site_scan",
        publicToken: createToken(),
        scoreVersion: input.scoreVersion ?? "v1",
      },
    });

    await tx.aeoScanReport.create({
      data: {
        scanId: created.id,
        rulesetVersion: input.rulesetVersion ?? "aeo_rules_v1",
        promptVersion: input.promptVersion ?? "deterministic_site_v1",
        reportJson: input.reportJson,
        recommendationsJson: input.recommendationsJson ?? Prisma.JsonNull,
        extractedFactsJson: input.extractedFactsJson ?? Prisma.JsonNull,
        issuesJson: input.issuesJson ?? Prisma.JsonNull,
        signalBlocksJson: input.signalBlocksJson ?? Prisma.JsonNull,
        rawFetchMetaJson: input.rawFetchMetaJson ?? Prisma.JsonNull,
      },
    });

    await tx.auditLog.create({
      data: {
        accountId: input.accountId,
        userId: input.userId,
        actionCode: "aeo.site_scan_created",
        targetType: "aeo_scan",
        targetId: created.id,
        payloadJson: {
          siteId: site.id,
          publicToken: created.publicToken,
        },
      },
    });

    return {
      scanId: created.id,
      publicToken: created.publicToken,
      status: created.status.toLowerCase(),
      resultUrl: `/aeo/r/${created.publicToken}`,
    };
  });
}

export async function chargeAeoSiteScanCredits(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    accountId: string;
    userId: string;
    operationKey?: string | null;
  },
) {
  return await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: {code: "aeo"},
    });
    assertOrThrow(product, 404, "product_not_found", "AEO product was not found.");

    const wallet = await ensureGlobalCreditsWallet(tx, input.accountId);
    await debitWalletCredits(tx, {
      walletId: wallet.id,
      accountId: input.accountId,
      productId: product.id,
      entryType: LedgerEntryType.SPEND,
      amountDelta: -AEO_KEY_PAGE_SITE_SCAN_CREDIT_COST,
      reasonCode: "aeo_key_page_site_scan",
      refType: "aeo_site_scan",
      refId: null,
      operationKey: input.operationKey ?? null,
      metadataJson: {
        maxPages: 5,
      },
    });

    await tx.auditLog.create({
      data: {
        accountId: input.accountId,
        userId: input.userId,
        actionCode: "aeo.site_scan_credits_charged",
        targetType: "aeo_site_scan",
        targetId: null,
        payloadJson: {
          creditsCharged: AEO_KEY_PAGE_SITE_SCAN_CREDIT_COST,
        },
      },
    });

    const walletSnapshot = await getWalletSnapshot(tx, input.accountId);
    return {
      chargedCredits: AEO_KEY_PAGE_SITE_SCAN_CREDIT_COST,
      wallet: walletSnapshot,
    };
  });
}

async function findScanByPublicToken(
  tx: DbClient,
  publicToken: string,
) {
  return await tx.aeoScan.findUnique({
    where: {publicToken},
    include: {
      site: true,
      reports: {
        orderBy: {createdAt: "desc"},
        take: 1,
      },
    },
  });
}

export async function getAeoPublicScanByToken(
  prisma: Prisma.DefaultPrismaClient,
  publicToken: string,
) {
  const scan = await findScanByPublicToken(prisma, publicToken);
  assertOrThrow(scan, 404, "aeo_scan_not_found", "AEO scan was not found.");

  const detail = shapeScanDetail(scan);
  const recommendations = Array.isArray(detail.recommendations) ? detail.recommendations : [];
  const topRecommendations = recommendations.slice(0, 3);

  return {
    ...detail,
    recommendations: topRecommendations,
    recommendationsLocked: true,
    lockedRecommendationsCount: Math.max(0, recommendations.length - topRecommendations.length),
  };
}

async function ensureAeoSiteForClaim(
  tx: DbClient,
  input: {
    accountId: string;
    userId: string;
    normalizedUrl: string;
  },
) {
  const {rootUrl, normalizedRootUrl} = extractRootUrl(input.normalizedUrl);

  const existing = await tx.aeoSite.findUnique({
    where: {
      accountId_normalizedRootUrl: {
        accountId: input.accountId,
        normalizedRootUrl,
      },
    },
  });

  if (existing) {
    return existing;
  }

  return await tx.aeoSite.create({
    data: {
      accountId: input.accountId,
      createdByUserId: input.userId,
      rootUrl,
      normalizedRootUrl,
      displayName: new URL(rootUrl).hostname,
      siteTypeGuess: "generic",
      status: "active",
    },
  });
}

export async function claimAeoScan(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    accountId: string;
    userId: string;
    scanId: string;
  },
) {
  return await prisma.$transaction(async (tx) => {
    const scan = await tx.aeoScan.findUnique({
      where: {id: input.scanId},
      include: {
        site: true,
        reports: {
          orderBy: {createdAt: "desc"},
          take: 1,
        },
      },
    });

    assertOrThrow(scan, 404, "aeo_scan_not_found", "AEO scan was not found.");
    assertOrThrow(
      !scan.accountId || scan.accountId === input.accountId,
      403,
      "aeo_scan_claim_forbidden",
      "This scan belongs to a different account.",
    );

    const site = await ensureAeoSiteForClaim(tx, {
      accountId: input.accountId,
      userId: input.userId,
      normalizedUrl: scan.normalizedUrl,
    });

    const updated = await tx.aeoScan.update({
      where: {id: scan.id},
      data: {
        accountId: input.accountId,
        userId: input.userId,
        siteId: site.id,
        isClaimed: true,
        recommendationsLocked: false,
        status: scan.status === "queued" ? "completed" : scan.status,
      },
      include: {
        site: true,
        reports: {
          orderBy: {createdAt: "desc"},
          take: 1,
        },
      },
    });

    await tx.aeoScanClaim.create({
      data: {
        scanId: scan.id,
        claimToken: createToken(12),
        claimedByUserId: input.userId,
        claimedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        accountId: input.accountId,
        userId: input.userId,
        actionCode: "aeo.scan_claimed",
        targetType: "aeo_scan",
        targetId: scan.id,
        payloadJson: {
          siteId: site.id,
          publicToken: updated.publicToken,
        },
      },
    });

    return shapeScanDetail(updated);
  });
}

export async function listAeoScans(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    accountId: string;
    limit?: number;
  },
) {
  const limit = input.limit && Number.isInteger(input.limit) ? Math.max(1, Math.min(100, input.limit)) : 20;

  const scans = await prisma.aeoScan.findMany({
    where: {
      accountId: input.accountId,
    },
    include: {
      site: true,
      reports: {
        orderBy: {createdAt: "desc"},
        take: 1,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
  });

  return scans.map((scan) => shapeScanDetail(scan));
}

export async function getAeoScanById(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    accountId: string;
    scanId: string;
  },
) {
  const scan = await prisma.aeoScan.findFirst({
    where: {
      id: input.scanId,
      accountId: input.accountId,
    },
    include: {
      site: true,
      reports: {
        orderBy: {createdAt: "desc"},
        take: 1,
      },
    },
  });

  assertOrThrow(scan, 404, "aeo_scan_not_found", "AEO scan was not found.");
  return shapeScanDetail(scan);
}

export async function removeAeoScanFromWorkspace(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    accountId: string;
    userId: string;
    scanId: string;
  },
) {
  return await prisma.$transaction(async (tx) => {
    const scan = await tx.aeoScan.findFirst({
      where: {
        id: input.scanId,
        accountId: input.accountId,
      },
    });

    assertOrThrow(scan, 404, "aeo_scan_not_found", "AEO scan was not found.");

    await tx.aeoScan.update({
      where: {id: scan.id},
      data: {
        accountId: null,
        userId: null,
        siteId: null,
        isClaimed: false,
        recommendationsLocked: true,
      },
    });

    await tx.auditLog.create({
      data: {
        accountId: input.accountId,
        userId: input.userId,
        actionCode: "aeo.scan_removed_from_workspace",
        targetType: "aeo_scan",
        targetId: scan.id,
        payloadJson: {
          publicToken: scan.publicToken,
        },
      },
    });

    return {
      scanId: scan.id,
      removed: true,
    };
  });
}

export async function saveAeoAiTips(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    accountId: string;
    userId: string;
    scanId: string;
    aiTipsJson: Prisma.InputJsonValue;
    providerCode: string;
    modelCode: string;
    creditsCharged: number;
    internalCostMinor: number;
    chargeOperationKey?: string | null;
  },
) {
  return await prisma.$transaction(async (tx) => {
    const scan = await tx.aeoScan.findFirst({
      where: {
        id: input.scanId,
        accountId: input.accountId,
      },
      include: {
        reports: {
          orderBy: {createdAt: "desc"},
          take: 1,
        },
      },
    });
    assertOrThrow(scan, 404, "aeo_scan_not_found", "AEO scan was not found.");

    const report = scan.reports[0];
    assertOrThrow(report, 409, "aeo_report_missing", "AEO report is missing for this scan.");

    await tx.aeoScanReport.update({
      where: {id: report.id},
      data: {
        aiTipsJson: input.aiTipsJson,
        aiTipsGeneratedAt: new Date(),
      },
    });

    const product = await tx.product.findUnique({
      where: {code: "aeo"},
    });
    assertOrThrow(product, 404, "product_not_found", "AEO product was not found.");

    const wallet = await ensureGlobalCreditsWallet(tx, input.accountId);
    let alreadyCharged = false;
    const chargeOperationKey = input.chargeOperationKey ?? null;

    if (input.creditsCharged > 0) {
      if (chargeOperationKey) {
        const existingCharge = await tx.ledgerEntry.findUnique({
          where: {
            operationKey: chargeOperationKey,
          },
        });
        if (existingCharge) {
          alreadyCharged = true;
        }
      }

      if (!alreadyCharged) {
        await debitWalletCredits(tx, {
          walletId: wallet.id,
          accountId: input.accountId,
          productId: product.id,
          entryType: LedgerEntryType.SPEND,
          amountDelta: -Math.abs(input.creditsCharged),
          reasonCode: "aeo_ai_tips_generation",
          refType: "aeo_scan",
          refId: input.scanId,
          operationKey: chargeOperationKey,
          metadataJson: {
            providerCode: input.providerCode,
            modelCode: input.modelCode,
          },
        });
      }
    }

    const usageOperationKey = chargeOperationKey ? `${chargeOperationKey}:usage` : null;
    if (usageOperationKey) {
      const existingUsage = await tx.economicsUsageEvent.findUnique({
        where: {
          operationKey: usageOperationKey,
        },
      });

      if (!existingUsage) {
        await tx.economicsUsageEvent.create({
          data: {
            accountId: input.accountId,
            productId: product.id,
            featureCode: "generate_ai_tips",
            providerCode: input.providerCode,
            modelCode: input.modelCode,
            rawUnitsJson: {
              scanId: input.scanId,
            },
            internalCostMinor: input.internalCostMinor,
            creditsCharged: input.creditsCharged,
            operationKey: usageOperationKey,
          },
        });
      }
    } else {
      await tx.economicsUsageEvent.create({
        data: {
          accountId: input.accountId,
          productId: product.id,
          featureCode: "generate_ai_tips",
          providerCode: input.providerCode,
          modelCode: input.modelCode,
          rawUnitsJson: {
            scanId: input.scanId,
          },
          internalCostMinor: input.internalCostMinor,
          creditsCharged: input.creditsCharged,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        accountId: input.accountId,
        userId: input.userId,
        actionCode: "aeo.ai_tips_generated",
        targetType: "aeo_scan",
        targetId: input.scanId,
        payloadJson: {
          providerCode: input.providerCode,
          modelCode: input.modelCode,
          creditsCharged: input.creditsCharged,
          internalCostMinor: input.internalCostMinor,
        },
      },
    });

    const walletSnapshot = await getWalletSnapshot(tx, input.accountId);
    return {
      chargedCredits: input.creditsCharged,
      alreadyCharged,
      wallet: walletSnapshot,
    };
  });
}

export async function createAeoWaitlistRequest(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    email: string;
    requestedPlanCode: string;
    siteUrl?: string | null;
    notes?: string | null;
    accountId?: string | null;
    userId?: string | null;
  },
) {
  const request = await prisma.aeoWaitlistRequest.create({
    data: {
      email: input.email.trim().toLowerCase(),
      requestedPlanCode: input.requestedPlanCode.trim().toLowerCase(),
      siteUrl: input.siteUrl ?? null,
      notes: input.notes ?? null,
      accountId: input.accountId ?? null,
      userId: input.userId ?? null,
    },
  });

  return {
    id: request.id,
    status: "submitted",
    createdAt: request.createdAt,
  };
}

export async function listAeoSites(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    accountId: string;
  },
) {
  const sites = await prisma.aeoSite.findMany({
    where: {
      accountId: input.accountId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return sites.map((site) => ({
    siteId: site.id,
    rootUrl: site.rootUrl,
    normalizedRootUrl: site.normalizedRootUrl,
    displayName: site.displayName,
    siteTypeGuess: site.siteTypeGuess,
    status: site.status,
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  }));
}

export async function createAeoSite(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    accountId: string;
    userId: string;
    rootUrl: string;
    displayName?: string | null;
    siteTypeGuess?: string | null;
  },
) {
  const parsed = extractRootUrl(input.rootUrl);

  const site = await prisma.aeoSite.upsert({
    where: {
      accountId_normalizedRootUrl: {
        accountId: input.accountId,
        normalizedRootUrl: parsed.normalizedRootUrl,
      },
    },
    update: {
      rootUrl: parsed.rootUrl,
      displayName: input.displayName ?? null,
      siteTypeGuess: input.siteTypeGuess ?? "generic",
      status: "active",
    },
    create: {
      accountId: input.accountId,
      createdByUserId: input.userId,
      rootUrl: parsed.rootUrl,
      normalizedRootUrl: parsed.normalizedRootUrl,
      displayName: input.displayName ?? new URL(parsed.rootUrl).hostname,
      siteTypeGuess: input.siteTypeGuess ?? "generic",
      status: "active",
    },
  });

  return {
    siteId: site.id,
    rootUrl: site.rootUrl,
    normalizedRootUrl: site.normalizedRootUrl,
    displayName: site.displayName,
    siteTypeGuess: site.siteTypeGuess,
    status: site.status,
  };
}

export async function upsertAeoMonitoringSnapshot(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    accountId: string;
    siteId?: string | null;
    scanId?: string | null;
    sourceCode: string;
    dataJson: Prisma.InputJsonValue;
    capturedAt?: Date;
  },
) {
  return await prisma.aeoMonitoringSnapshot.create({
    data: {
      accountId: input.accountId,
      siteId: input.siteId ?? null,
      scanId: input.scanId ?? null,
      sourceCode: input.sourceCode,
      dataJson: input.dataJson,
      capturedAt: input.capturedAt ?? new Date(),
    },
  });
}

export async function listRecentAeoMonitoringSnapshots(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    accountId: string;
    siteId?: string | null;
    sourceCode?: string | null;
    limit?: number;
  },
) {
  const limit = input.limit && Number.isInteger(input.limit) ? Math.max(1, Math.min(200, input.limit)) : 20;
  const snapshots = await prisma.aeoMonitoringSnapshot.findMany({
    where: {
      accountId: input.accountId,
      ...(input.siteId ? {siteId: input.siteId} : {}),
      ...(input.sourceCode ? {sourceCode: input.sourceCode} : {}),
    },
    orderBy: {
      capturedAt: "desc",
    },
    take: limit,
  });

  return snapshots.map((snapshot) => ({
    id: snapshot.id,
    sourceCode: snapshot.sourceCode,
    dataJson: snapshot.dataJson,
    capturedAt: snapshot.capturedAt,
    createdAt: snapshot.createdAt,
  }));
}

const AEO_LAUNCH_OFFER_CODE = "aeo_first_purchase_launch_v1";
const AEO_LAUNCH_OFFER_DURATION_MS = 60 * 60 * 1000;

async function ensureLaunchOfferTemplate(tx: DbClient) {
  const now = new Date();
  return await tx.aeoPlanOffer.upsert({
    where: {
      id: AEO_LAUNCH_OFFER_CODE,
    },
    update: {
      productCode: "aeo",
      offerType: "first_purchase_launch",
      title: "AEO Starter Launch Offer",
      startsAt: now,
      status: "active",
      metadataJson: {
        discountedPackCodes: ["aeo_pack_s", "aeo_pack_m"],
        regularPackCodes: ["aeo_pack_l"],
      },
    },
    create: {
      id: AEO_LAUNCH_OFFER_CODE,
      productCode: "aeo",
      offerType: "first_purchase_launch",
      title: "AEO Starter Launch Offer",
      startsAt: now,
      status: "active",
      metadataJson: {
        discountedPackCodes: ["aeo_pack_s", "aeo_pack_m"],
        regularPackCodes: ["aeo_pack_l"],
      },
    },
  });
}

export async function getOrCreateAeoStarterOfferState(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    accountId: string;
  },
) {
  return await prisma.$transaction(async (tx) => {
    const offer = await ensureLaunchOfferTemplate(tx);
    const existing = await tx.aeoAccountOfferState.findUnique({
      where: {
        accountId_offerId: {
          accountId: input.accountId,
          offerId: offer.id,
        },
      },
    });

    if (existing) {
      return {
        offerId: offer.id,
        status: existing.status,
        startedAt: existing.startedAt,
        expiresAt: existing.expiresAt,
        consumedAt: existing.consumedAt,
      };
    }

    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + AEO_LAUNCH_OFFER_DURATION_MS);
    const created = await tx.aeoAccountOfferState.create({
      data: {
        accountId: input.accountId,
        offerId: offer.id,
        status: "active",
        startedAt,
        expiresAt,
      },
    });

    return {
      offerId: offer.id,
      status: created.status,
      startedAt: created.startedAt,
      expiresAt: created.expiresAt,
      consumedAt: created.consumedAt,
    };
  });
}

export async function consumeAeoStarterOfferState(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    accountId: string;
  },
) {
  return await prisma.$transaction(async (tx) => {
    const offer = await ensureLaunchOfferTemplate(tx);
    const state = await tx.aeoAccountOfferState.findUnique({
      where: {
        accountId_offerId: {
          accountId: input.accountId,
          offerId: offer.id,
        },
      },
    });

    assertOrThrow(state, 404, "aeo_offer_state_not_found", "Offer state was not found.");
    if (state.consumedAt) {
      return {
        offerId: offer.id,
        status: state.status,
        startedAt: state.startedAt,
        expiresAt: state.expiresAt,
        consumedAt: state.consumedAt,
      };
    }

    const now = new Date();
    const updated = await tx.aeoAccountOfferState.update({
      where: {id: state.id},
      data: {
        status: "consumed",
        consumedAt: now,
      },
    });

    return {
      offerId: offer.id,
      status: updated.status,
      startedAt: updated.startedAt,
      expiresAt: updated.expiresAt,
      consumedAt: updated.consumedAt,
    };
  });
}
