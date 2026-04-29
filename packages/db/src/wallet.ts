import {
  LedgerEntryType,
  Prisma,
  WalletScope,
} from "@prisma/client";

import {PlatformError, assertOrThrow} from "./errors.js";

export const GLOBAL_CREDITS_WALLET_CURRENCY = "CREDITS";
export const MOTREND_TEST_BOOTSTRAP_CREDITS = 3;
export const MOTREND_TEST_BOOTSTRAP_REASON = "motrend_test_bootstrap";
export const AEO_WELCOME_CREDITS = 1;
export const AEO_WELCOME_REASON = "aeo_welcome_grant";

export type DbClient = Prisma.TransactionClient | Prisma.DefaultPrismaClient;

export async function ensureGlobalCreditsWallet(
  tx: DbClient,
  accountId: string,
) {
  return await tx.wallet.upsert({
    where: {
      accountId_walletScope_currencyCode_scopeRef: {
        accountId,
        walletScope: WalletScope.GLOBAL,
        currencyCode: GLOBAL_CREDITS_WALLET_CURRENCY,
        scopeRef: "",
      },
    },
    update: {
      status: "active",
    },
    create: {
      accountId,
      walletScope: WalletScope.GLOBAL,
      scopeRef: "",
      currencyCode: GLOBAL_CREDITS_WALLET_CURRENCY,
      status: "active",
    },
  });
}

export async function getWalletBalance(
  tx: DbClient,
  walletId: string,
): Promise<number> {
  const aggregate = await tx.ledgerEntry.aggregate({
    where: {walletId},
    _sum: {
      amountDelta: true,
    },
  });

  return aggregate._sum.amountDelta ?? 0;
}

export interface AppendLedgerEntryInput {
  walletId: string;
  accountId: string;
  productId?: string | null;
  entryType: LedgerEntryType;
  amountDelta: number;
  reasonCode: string;
  refType: string;
  refId?: string | null;
  operationKey?: string | null;
  metadataJson?: Prisma.InputJsonValue;
}

export async function appendLedgerEntry(
  tx: DbClient,
  input: AppendLedgerEntryInput,
) {
  assertOrThrow(Number.isInteger(input.amountDelta) && input.amountDelta !== 0, 400, "invalid_ledger_delta", "Ledger delta must be a non-zero integer.");

  const currentBalance = await getWalletBalance(tx, input.walletId);
  const nextBalance = currentBalance + input.amountDelta;

  const metadataJson = input.metadataJson ?? Prisma.JsonNull;

  return await tx.ledgerEntry.create({
    data: {
      walletId: input.walletId,
      accountId: input.accountId,
      productId: input.productId ?? null,
      entryType: input.entryType,
      amountDelta: input.amountDelta,
      reasonCode: input.reasonCode,
      refType: input.refType,
      refId: input.refId ?? null,
      operationKey: input.operationKey ?? null,
      balanceAfter: nextBalance,
      metadataJson,
    },
  });
}

export async function debitWalletCredits(
  tx: DbClient,
  input: AppendLedgerEntryInput,
) {
  const balance = await getWalletBalance(tx, input.walletId);
  const requestedDebit = Math.abs(input.amountDelta);

  assertOrThrow(
    balance >= requestedDebit,
    409,
    "insufficient_credits",
    "Not enough credits for this operation.",
    {
      currentCredits: balance,
      requiredCredits: requestedDebit,
      shortfallCredits: requestedDebit - balance,
    },
  );

  return await appendLedgerEntry(tx, {
    ...input,
    entryType: LedgerEntryType.SPEND,
    amountDelta: -requestedDebit,
  });
}

export async function grantMotrendBootstrapCredits(
  tx: DbClient,
  input: {
    walletId: string;
    accountId: string;
    productId: string;
  },
): Promise<boolean> {
  try {
    await appendLedgerEntry(tx, {
      walletId: input.walletId,
      accountId: input.accountId,
      productId: input.productId,
      entryType: LedgerEntryType.GRANT,
      amountDelta: MOTREND_TEST_BOOTSTRAP_CREDITS,
      reasonCode: MOTREND_TEST_BOOTSTRAP_REASON,
      refType: "product_membership",
      refId: input.productId,
      operationKey: `bootstrap:${input.accountId}:motrend`,
      metadataJson: {
        scope: "motrend-only",
      },
    });
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return false;
    }

    throw error;
  }
}

export async function grantAeoWelcomeCredits(
  tx: DbClient,
  input: {
    walletId: string;
    accountId: string;
    productId: string;
  },
): Promise<boolean> {
  try {
    await appendLedgerEntry(tx, {
      walletId: input.walletId,
      accountId: input.accountId,
      productId: input.productId,
      entryType: LedgerEntryType.GRANT,
      amountDelta: AEO_WELCOME_CREDITS,
      reasonCode: AEO_WELCOME_REASON,
      refType: "product_membership",
      refId: input.productId,
      operationKey: `bootstrap:${input.accountId}:aeo`,
      metadataJson: {
        scope: "aeo-welcome",
      },
    });
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return false;
    }

    throw error;
  }
}

export async function getWalletSnapshot(
  tx: DbClient,
  accountId: string,
) {
  const wallet = await ensureGlobalCreditsWallet(tx, accountId);
  const balance = await getWalletBalance(tx, wallet.id);

  return {
    walletId: wallet.id,
    currencyCode: wallet.currencyCode,
    balance,
  };
}

export function isInsufficientCreditsError(error: unknown): error is PlatformError {
  return error instanceof PlatformError && error.code === "insufficient_credits";
}
