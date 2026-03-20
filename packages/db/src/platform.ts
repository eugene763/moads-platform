import {
  AccountType,
  MembershipStatus,
  MembershipType,
  Prisma,
} from "@prisma/client";

import {PlatformError, assertOrThrow} from "./errors.js";
import {
  ensureGlobalCreditsWallet,
  getWalletSnapshot,
  grantMotrendBootstrapCredits,
  MOTREND_TEST_BOOTSTRAP_CREDITS,
} from "./wallet.js";
import {ensureLegacyCompatibleSupportProfile} from "./support.js";

type DbClient = Prisma.TransactionClient | Prisma.DefaultPrismaClient;

export interface SessionBootstrapInput {
  firebaseUid: string;
  productCode: PlatformProductCode;
  email?: string | null;
  emailVerified?: boolean;
  displayName?: string | null;
  photoUrl?: string | null;
  signInProvider?: string | null;
  legacySupportCode?: string | null;
}

export interface SessionBootstrapResult {
  user: {
    id: string;
    firebaseUid: string;
    email: string | null;
    displayName: string | null;
  };
  account: {
    id: string;
    realmDefault: string;
  };
  product: {
    id: string;
    code: string;
    realmCode: string;
  };
  memberships: Array<{
    productCode: string;
    status: string;
  }>;
  supportCode: string;
  wallet: {
    walletId: string;
    currencyCode: string;
    balance: number;
  };
  createdMembership: boolean;
  grantedTestCredits: boolean;
  grantedTestCreditsAmount: number | null;
}

export interface SessionSnapshot {
  user: {
    id: string;
    firebaseUid: string;
    email: string | null;
    displayName: string | null;
  };
  account: {
    id: string;
    realmDefault: string;
  };
  memberships: Array<{
    productCode: string;
    status: string;
    realmCode: string;
  }>;
  wallet: {
    walletId: string;
    currencyCode: string;
    balance: number;
  };
  supportCode: string;
}

export async function resolveProductByCode(tx: DbClient, productCode: string) {
  const product = await tx.product.findUnique({
    where: {code: productCode},
    include: {
      realm: true,
    },
  });

  assertOrThrow(product, 404, "product_not_found", `Unknown product: ${productCode}`);

  return product;
}

export async function bootstrapSessionLogin(
  prisma: Prisma.DefaultPrismaClient,
  input: SessionBootstrapInput,
): Promise<SessionBootstrapResult> {
  return await prisma.$transaction(async (tx) => {
    const product = await resolveProductByCode(tx, input.productCode);

    const user = await tx.identityUser.upsert({
      where: {firebaseUid: input.firebaseUid},
      update: {
        primaryEmail: input.email ?? null,
        emailVerified: input.emailVerified ?? false,
        displayName: input.displayName ?? null,
        photoUrl: input.photoUrl ?? null,
        lastLoginAt: new Date(),
      },
      create: {
        firebaseUid: input.firebaseUid,
        primaryEmail: input.email ?? null,
        emailVerified: input.emailVerified ?? false,
        displayName: input.displayName ?? null,
        photoUrl: input.photoUrl ?? null,
        lastLoginAt: new Date(),
      },
    });

    await tx.loginIdentity.upsert({
      where: {
        provider_providerSubject: {
          provider: input.signInProvider ?? "firebase",
          providerSubject: input.firebaseUid,
        },
      },
      update: {
        userId: user.id,
      },
      create: {
        userId: user.id,
        provider: input.signInProvider ?? "firebase",
        providerSubject: input.firebaseUid,
      },
    });

    let account = await tx.account.findFirst({
      where: {
        ownerUserId: user.id,
        accountType: AccountType.PERSONAL,
      },
    });

    if (!account) {
      account = await tx.account.create({
        data: {
          ownerUserId: user.id,
          accountType: AccountType.PERSONAL,
          realmDefault: product.realm.code,
          name: input.displayName ?? input.email ?? "Personal account",
        },
      });
    }

    await tx.accountMember.upsert({
      where: {
        accountId_userId: {
          accountId: account.id,
          userId: user.id,
        },
      },
      update: {
        role: "owner",
        status: "active",
      },
      create: {
        accountId: account.id,
        userId: user.id,
        role: "owner",
        status: "active",
      },
    });

    const supportProfile = await ensureLegacyCompatibleSupportProfile(tx, {
      accountId: account.id,
      userId: user.id,
      firebaseUid: user.firebaseUid,
      preferredSupportCode: input.legacySupportCode ?? null,
    });

    const wallet = await ensureGlobalCreditsWallet(tx, account.id);

    let createdMembership = false;
    const existingMembership = await tx.productMembership.findUnique({
      where: {
        accountId_productId: {
          accountId: account.id,
          productId: product.id,
        },
      },
    });

    if (!existingMembership) {
      createdMembership = true;
      await tx.productMembership.create({
        data: {
          accountId: account.id,
          productId: product.id,
          membershipType: MembershipType.STANDARD,
          status: MembershipStatus.ACTIVE,
          origin: "product_signup",
        },
      });
    }

    const grantedTestCredits = product.code === "motrend" && createdMembership ?
      await grantMotrendBootstrapCredits(tx, {
        walletId: wallet.id,
        accountId: account.id,
        productId: product.id,
      }) :
      false;

    await tx.auditLog.create({
      data: {
        accountId: account.id,
        userId: user.id,
        actionCode: "auth.session_login",
        targetType: "product",
        targetId: product.id,
        payloadJson: {
          productCode: product.code,
          createdMembership,
          grantedTestCredits,
          grantedTestCreditsAmount: grantedTestCredits ?
            MOTREND_TEST_BOOTSTRAP_CREDITS :
            null,
        },
      },
    });

    const memberships = await tx.productMembership.findMany({
      where: {accountId: account.id},
      include: {
        product: {
          include: {
            realm: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const walletSnapshot = await getWalletSnapshot(tx, account.id);

    return {
      user: {
        id: user.id,
        firebaseUid: user.firebaseUid,
        email: user.primaryEmail,
        displayName: user.displayName,
      },
      account: {
        id: account.id,
        realmDefault: account.realmDefault,
      },
      product: {
        id: product.id,
        code: product.code,
        realmCode: product.realm.code,
      },
      memberships: memberships.map((membership) => ({
        productCode: membership.product.code,
        status: membership.status,
      })),
      supportCode: supportProfile.supportCode,
      wallet: walletSnapshot,
      createdMembership,
      grantedTestCredits,
      grantedTestCreditsAmount: grantedTestCredits ?
        MOTREND_TEST_BOOTSTRAP_CREDITS :
        null,
    };
  });
}

export async function getSessionSnapshot(
  prisma: Prisma.DefaultPrismaClient,
  userId: string,
  accountId: string,
): Promise<SessionSnapshot> {
  const user = await prisma.identityUser.findUnique({
    where: {id: userId},
  });
  assertOrThrow(user, 404, "user_not_found", "User was not found.");

  const account = await prisma.account.findUnique({
    where: {id: accountId},
  });
  assertOrThrow(account, 404, "account_not_found", "Account was not found.");

  const supportProfile = await prisma.supportProfile.findUnique({
    where: {accountId},
  });
  assertOrThrow(supportProfile, 404, "support_profile_not_found", "Support profile was not found.");

  const memberships = await prisma.productMembership.findMany({
    where: {accountId},
    include: {
      product: {
        include: {
          realm: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const wallet = await prisma.$transaction(async (tx) => {
    return await getWalletSnapshot(tx, accountId);
  });

  return {
    user: {
      id: user.id,
      firebaseUid: user.firebaseUid,
      email: user.primaryEmail,
      displayName: user.displayName,
    },
    account: {
      id: account.id,
      realmDefault: account.realmDefault,
    },
    memberships: memberships.map((membership) => ({
      productCode: membership.product.code,
      status: membership.status,
      realmCode: membership.product.realm.code,
    })),
    wallet,
    supportCode: supportProfile.supportCode,
  };
}

export async function requireProductMembership(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    accountId: string;
    productCode: string;
  },
) {
  const membership = await prisma.productMembership.findFirst({
    where: {
      accountId: input.accountId,
      product: {
        code: input.productCode,
      },
      status: MembershipStatus.ACTIVE,
    },
    include: {
      product: true,
    },
  });

  assertOrThrow(
    membership,
    403,
    "product_membership_required",
    `Active membership required for ${input.productCode}.`,
  );

  return membership;
}

export async function requireEntitlement(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    accountId: string;
    productCode: string;
    featureCode: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const entitlement = await prisma.entitlement.findFirst({
    where: {
      accountId: input.accountId,
      product: {
        code: input.productCode,
      },
      featureCode: input.featureCode,
      status: "active",
      OR: [
        {startsAt: null},
        {startsAt: {lte: now}},
      ],
      AND: [
        {
          OR: [
            {endsAt: null},
            {endsAt: {gte: now}},
          ],
        },
      ],
    },
  });

  assertOrThrow(
    entitlement,
    403,
    "entitlement_required",
    `Entitlement required for ${input.productCode}.${input.featureCode}.`,
  );

  return entitlement;
}
type PlatformProductCode = "motrend" | "lab" | "aeo" | "ugc";
