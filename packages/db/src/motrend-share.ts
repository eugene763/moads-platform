import {createHash, randomBytes} from "node:crypto";

import {
  MotrendJobStatus,
  Prisma,
} from "@prisma/client";

import {assertOrThrow} from "./errors.js";
import {getOwnedMotrendJob} from "./motrend.js";

type DbClient = Prisma.TransactionClient | Prisma.DefaultPrismaClient;

function readJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readJsonString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    const isApprovedAssetHost =
      url.hostname === "trend.moads.agency" ||
      url.hostname === "gen-lang-client-0651837818.web.app" ||
      url.hostname === "gen-lang-client-0651837818.firebaseapp.com";
    const isApprovedStorageHost =
      url.hostname === "firebasestorage.googleapis.com" &&
      /^\/v0\/b\/gen-lang-client-0651837818\.firebasestorage\.app\/o\//.test(url.pathname) &&
      Boolean((url.searchParams.get("token") || "").trim());

    if (!isApprovedAssetHost && !isApprovedStorageHost) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function buildSlugCandidate(): string {
  return randomBytes(6)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase()
    .slice(0, 8);
}

async function generateUniqueSlug(tx: DbClient): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const slug = buildSlugCandidate();
    if (!slug) {
      continue;
    }

    const existing = await tx.moTrendPublicShare.findUnique({
      where: {slug},
      select: {id: true},
    });
    if (!existing) {
      return slug;
    }
  }

  const fallback = createHash("sha256")
    .update(`${Date.now()}:${randomBytes(16).toString("hex")}`)
    .digest("hex")
    .slice(0, 10);
  return fallback;
}

function buildShareMetadata(input: {
  templateName: string;
  previewImageUrl: string | null;
  entryDomain: string;
}) {
  const templateName = input.templateName.trim() || "MoTrend";
  const title = `${templateName} video | MoTrend©`;
  const description = `Watch this video made with MoTrend©.`;
  const previewImageUrl = input.previewImageUrl ??
    `https://${input.entryDomain}/assets/moads-logo.png`;

  return {
    title,
    description,
    previewImageUrl,
  };
}

export function buildMotrendPublicShareUrl(entryDomain: string, slug: string): string {
  return `https://${entryDomain}/v/${encodeURIComponent(slug)}`;
}

export async function createOrReuseMotrendPublicShare(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    accountId: string;
    userId: string;
    jobId: string;
    entryDomain: string;
    previewImageUrl?: string | null;
  },
) {
  return await prisma.$transaction(async (tx) => {
    const job = await getOwnedMotrendJob(tx, {
      accountId: input.accountId,
      userId: input.userId,
      jobId: input.jobId,
    });
    assertOrThrow(
      job.status === MotrendJobStatus.DONE,
      409,
      "job_not_shareable",
      "Only completed trends can be shared.",
    );

    const template = await tx.moTrendTemplate.findUnique({
      where: {id: job.templateId},
      select: {
        name: true,
        metadataJson: true,
      },
    });
    assertOrThrow(template, 404, "template_not_found", "Template was not found.");

    const preview = readJsonObject(readJsonObject(template.metadataJson).preview);
    const previewImageUrl = safeExternalUrl(readJsonString(preview.thumbnailUrl));
    const metadata = buildShareMetadata({
      templateName: template.name,
      previewImageUrl: safeExternalUrl(input.previewImageUrl) || previewImageUrl,
      entryDomain: input.entryDomain,
    });

    const existing = await tx.moTrendPublicShare.findUnique({
      where: {jobId: job.id},
    });

    const share = existing ?
      await tx.moTrendPublicShare.update({
        where: {jobId: job.id},
        data: {
          title: metadata.title,
          description: metadata.description,
          previewImageUrl: metadata.previewImageUrl,
          isActive: true,
        },
      }) :
      await tx.moTrendPublicShare.create({
        data: {
          jobId: job.id,
          slug: await generateUniqueSlug(tx),
          title: metadata.title,
          description: metadata.description,
          previewImageUrl: metadata.previewImageUrl,
          isActive: true,
        },
      });

    return {
      ...share,
      shareUrl: buildMotrendPublicShareUrl(input.entryDomain, share.slug),
    };
  });
}

export async function getActiveMotrendPublicShareBySlug(
  prisma: Prisma.DefaultPrismaClient,
  slug: string,
) {
  const normalizedSlug = typeof slug === "string" ? slug.trim().toLowerCase() : "";
  assertOrThrow(normalizedSlug, 404, "share_not_found", "Shared video was not found.");

  const share = await prisma.moTrendPublicShare.findFirst({
    where: {
      slug: normalizedSlug,
      isActive: true,
    },
    include: {
      job: {
        include: {
          user: true,
          downloadArtifacts: true,
        },
      },
    },
  });

  assertOrThrow(share, 404, "share_not_found", "Shared video was not found.");
  assertOrThrow(
    share.job.status === MotrendJobStatus.DONE,
    404,
    "share_not_found",
    "Shared video was not found.",
  );

  return share;
}
