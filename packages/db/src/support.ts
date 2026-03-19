import {createHash} from "node:crypto";

import {
  LedgerEntryType,
  Prisma,
} from "@prisma/client";

import {PlatformError, assertOrThrow} from "./errors.js";
import {
  appendLedgerEntry,
  ensureGlobalCreditsWallet,
  getWalletSnapshot,
} from "./wallet.js";

type DbClient = Prisma.TransactionClient | Prisma.DefaultPrismaClient;

const SUPPORT_CODE_PATTERN = /^U-[A-Z0-9]{10}(?:-[A-Z0-9]{2})?$/;
const SUPPORT_CODE_SUFFIX_SPACE = 36 * 36;

export function legacySupportCodeBase(firebaseUid: string): string {
  return `U-${createHash("sha256").update(firebaseUid).digest("hex").slice(0, 10).toUpperCase()}`;
}

function normalizeSupportCodeOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (!normalized || !SUPPORT_CODE_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

export function normalizeSupportCode(value: string): string {
  const normalized = normalizeSupportCodeOrNull(value);
  assertOrThrow(normalized, 400, "invalid_support_code", "Invalid support code.");
  return normalized;
}

async function canAssignSupportCode(
  tx: DbClient,
  accountId: string,
  supportCode: string,
): Promise<boolean> {
  const existing = await tx.supportProfile.findUnique({
    where: {supportCode},
    select: {accountId: true},
  });

  return !existing || existing.accountId === accountId;
}

async function allocateLegacyCompatibleSupportCode(
  tx: DbClient,
  input: {
    accountId: string;
    firebaseUid: string;
    preferredSupportCode?: string | null;
  },
): Promise<string> {
  const preferredSupportCode = normalizeSupportCodeOrNull(input.preferredSupportCode ?? null);
  if (
    preferredSupportCode &&
    await canAssignSupportCode(tx, input.accountId, preferredSupportCode)
  ) {
    return preferredSupportCode;
  }

  const base = legacySupportCodeBase(input.firebaseUid);
  for (let attempt = 0; attempt < SUPPORT_CODE_SUFFIX_SPACE; attempt += 1) {
    const suffix = attempt === 0 ?
      "" :
      `-${attempt.toString(36).toUpperCase().padStart(2, "0")}`;
    const candidate = `${base}${suffix}`;
    if (await canAssignSupportCode(tx, input.accountId, candidate)) {
      return candidate;
    }
  }

  throw new PlatformError(500, "support_code_exhausted", "Unable to allocate a support code.");
}

export async function ensureLegacyCompatibleSupportProfile(
  tx: DbClient,
  input: {
    accountId: string;
    userId: string;
    firebaseUid: string;
    preferredSupportCode?: string | null;
  },
) {
  const existing = await tx.supportProfile.findUnique({
    where: {accountId: input.accountId},
  });
  if (existing) {
    return existing;
  }

  const supportCode = await allocateLegacyCompatibleSupportCode(tx, {
    accountId: input.accountId,
    firebaseUid: input.firebaseUid,
    preferredSupportCode: input.preferredSupportCode ?? null,
  });

  return await tx.supportProfile.create({
    data: {
      accountId: input.accountId,
      userId: input.userId,
      supportCode,
    },
  });
}

export interface AdminSupportLookupResult {
  uid: string;
  supportCode: string;
  user: {
    email: string | null;
    creditsBalance: number;
    country: null;
    language: null;
  };
  recentJobs: Array<{
    id: string;
    status: string;
    templateId: string | null;
    createdAtMs: number;
    updatedAtMs: number;
  }>;
}

export async function findAdminSupportLookup(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    supportCode: string;
    recentJobsLimit?: number;
  },
): Promise<AdminSupportLookupResult> {
  const supportCode = normalizeSupportCode(input.supportCode);
  const supportProfile = await prisma.supportProfile.findUnique({
    where: {supportCode},
    include: {
      account: true,
      user: true,
    },
  });

  assertOrThrow(supportProfile, 404, "support_profile_not_found", "Support ID not found.");

  const [wallet, jobs] = await prisma.$transaction(async (tx) => {
    const walletSnapshot = await getWalletSnapshot(tx, supportProfile.accountId);
    const recentJobs = await tx.moTrendJob.findMany({
      where: {accountId: supportProfile.accountId},
      orderBy: {createdAt: "desc"},
      take: input.recentJobsLimit ?? 5,
    });
    return [walletSnapshot, recentJobs] as const;
  });

  const templateIds = [...new Set(jobs.map((job) => job.templateId).filter(Boolean))];
  const templates = templateIds.length > 0 ?
    await prisma.moTrendTemplate.findMany({
      where: {
        id: {
          in: templateIds,
        },
      },
    }) :
    [];
  const templateCodeById = new Map(
    templates.map((template) => [template.id, template.code]),
  );

  return {
    uid: supportProfile.user.firebaseUid,
    supportCode: supportProfile.supportCode,
    user: {
      email: supportProfile.user.primaryEmail ?? null,
      creditsBalance: wallet.balance,
      country: null,
      language: null,
    },
    recentJobs: jobs.map((job) => ({
      id: job.id,
      status: job.status.toLowerCase(),
      templateId: templateCodeById.get(job.templateId) ?? null,
      createdAtMs: job.createdAt.getTime(),
      updatedAtMs: job.updatedAt.getTime(),
    })),
  };
}

export interface GrantAdminWalletCreditsResult {
  supportCode: string;
  amount: number;
  balanceAfter: number;
  entryId: string;
}

export async function grantAdminWalletCredits(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    adminUserId: string;
    supportCode: string;
    amount: number;
    reason: string;
  },
): Promise<GrantAdminWalletCreditsResult> {
  const supportCode = normalizeSupportCode(input.supportCode);
  const amount = Math.ceil(Number(input.amount));
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";

  assertOrThrow(Number.isFinite(amount) && amount > 0, 400, "invalid_grant_amount", "amount must be a positive integer.");
  assertOrThrow(reason, 400, "invalid_grant_reason", "reason is required.");

  return await prisma.$transaction(async (tx) => {
    const supportProfile = await tx.supportProfile.findUnique({
      where: {supportCode},
      include: {
        account: true,
      },
    });

    assertOrThrow(supportProfile, 404, "support_profile_not_found", "Support ID not found.");

    const wallet = await ensureGlobalCreditsWallet(tx, supportProfile.accountId);
    const entry = await appendLedgerEntry(tx, {
      walletId: wallet.id,
      accountId: supportProfile.accountId,
      productId: null,
      entryType: LedgerEntryType.ADJUSTMENT,
      amountDelta: amount,
      reasonCode: "support_manual_grant",
      refType: "support_code",
      refId: supportProfile.supportCode,
      metadataJson: {
        reason,
        grantedByUserId: input.adminUserId,
      },
    });

    await tx.auditLog.create({
      data: {
        accountId: supportProfile.accountId,
        userId: input.adminUserId,
        actionCode: "wallet.support_manual_grant",
        targetType: "support_code",
        targetId: supportProfile.supportCode,
        payloadJson: {
          amount,
          reason,
          ledgerEntryId: entry.id,
        },
      },
    });

    return {
      supportCode: supportProfile.supportCode,
      amount,
      balanceAfter: entry.balanceAfter,
      entryId: entry.id,
    };
  });
}
