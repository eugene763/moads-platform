import {
  LedgerEntryType,
  MotrendDownloadArtifactType,
  MotrendJobStatus,
  MotrendSelectionKind,
  Prisma,
} from "@prisma/client";

import {PlatformError, assertOrThrow} from "./errors.js";
import {
  debitWalletCredits,
  ensureGlobalCreditsWallet,
  appendLedgerEntry,
  getWalletSnapshot,
} from "./wallet.js";
import {scheduleMotrendSubmitTaskTx} from "./motrend-tasks.js";

type DbClient = Prisma.TransactionClient | Prisma.DefaultPrismaClient;

const MAX_ACTIVE_GENERATION_JOBS = 3;

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

function readJsonNumber(value: unknown): number | null {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

export interface MotrendPrepareJobInput {
  accountId: string;
  userId: string;
  firebaseUid: string;
  templateId: string;
  selectionKind: "template" | "reference";
  clientRequestId?: string | null;
}

export interface FinalizePreparedMotrendJobInput {
  accountId: string;
  userId: string;
  jobId: string;
  inputImagePath: string;
  inputImageUrl: string;
  referenceVideoPath?: string | null;
  referenceVideoUrl?: string | null;
  uploadedReferenceDurationSec?: number | null;
}

export interface ReconcileReferenceBillingInput {
  accountId: string;
  userId: string;
  jobId: string;
  outputRawDurationSec: number;
}

export interface DownloadArtifactUpsertInput {
  accountId: string;
  userId: string;
  jobId: string;
  inlineArtifact: {
    storagePath: string;
    downloadToken: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    expiresAt: Date;
    metadataJson?: Prisma.InputJsonValue;
  };
  downloadArtifact: {
    storagePath: string;
    downloadToken: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    expiresAt: Date;
    metadataJson?: Prisma.InputJsonValue;
  };
}

export function normalizeSelectionKind(value: string | undefined): MotrendSelectionKind {
  return value === "reference" ? MotrendSelectionKind.REFERENCE : MotrendSelectionKind.TEMPLATE;
}

function templateCostCredits(durationSec: number): number {
  return Math.max(1, Math.ceil(durationSec));
}

export async function listActiveMotrendTemplates(
  prisma: Prisma.DefaultPrismaClient,
) {
  const product = await prisma.product.findUnique({
    where: {code: "motrend"},
    select: {id: true},
  });
  assertOrThrow(product, 404, "product_not_found", "MoTrend product was not found.");

  const templates = await prisma.moTrendTemplate.findMany({
    where: {
      productId: product.id,
      isActive: true,
    },
  });

  return templates
    .map((template) => {
      const metadata = readJsonObject(template.metadataJson);
      const preview = readJsonObject(metadata.preview);
      const order = readJsonNumber(metadata.order);
      const modeDefault = readJsonString(metadata.modeDefault) ?? "std";

      return {
        id: template.code,
        code: template.code,
        title: template.name,
        name: template.name,
        durationSec: template.durationSec,
        modeDefault,
        costCredits: templateCostCredits(template.durationSec),
        referenceVideoUrl: template.referenceVideoUrl,
        preview: {
          thumbnailUrl: readJsonString(preview.thumbnailUrl),
          previewVideoUrl: readJsonString(preview.previewVideoUrl),
        },
        sortOrder: order ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.title.localeCompare(right.title);
    })
    .map(({sortOrder: _sortOrder, ...template}) => template);
}

function buildClientRequestKey(userId: string, clientRequestId: string): string {
  return `${userId}:${clientRequestId}`;
}

function assertOwnedJob(job: {accountId: string; userId: string} | null, accountId: string, userId: string): asserts job {
  assertOrThrow(job, 404, "job_not_found", "Job was not found.");
  assertOrThrow(job.accountId === accountId && job.userId === userId, 403, "job_forbidden", "No access to this job.");
}

export async function getMotrendProfile(
  prisma: Prisma.DefaultPrismaClient,
  accountId: string,
  userId: string,
) {
  const accountMember = await prisma.accountMember.findUnique({
    where: {
      accountId_userId: {
        accountId,
        userId,
      },
    },
  });

  assertOrThrow(accountMember, 403, "account_member_required", "The user is not attached to this account.");

  const [supportProfile, wallet] = await prisma.$transaction(async (tx) => {
    const profile = await tx.supportProfile.findUnique({
      where: {accountId},
    });
    const walletSnapshot = await getWalletSnapshot(tx, accountId);
    return [profile, walletSnapshot] as const;
  });

  assertOrThrow(supportProfile, 404, "support_profile_not_found", "Support profile was not found.");

  return {
    supportCode: supportProfile.supportCode,
    creditsBalance: wallet.balance,
    walletId: wallet.walletId,
    country: null,
    language: null,
  };
}

export async function listMotrendJobs(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    accountId: string;
    userId: string;
    limit?: number;
  },
) {
  const jobs = await prisma.moTrendJob.findMany({
    where: {
      accountId: input.accountId,
      userId: input.userId,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: input.limit ?? 20,
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

  return jobs.map((job) => ({
    id: job.id,
    status: job.status,
    selectionKind: job.selectionKind,
    templateId: templateCodeById.get(job.templateId) ?? job.templateId,
    inputImagePath: job.inputImagePath,
    referenceVideoPath: job.referenceVideoPath,
    debitedCredits: job.debitedCredits,
    finalCostCredits: job.finalCostCredits,
    refundCredits: job.refundCredits,
    providerState: job.providerState,
    providerOutputUrl: job.providerOutputUrl,
    reconciliationError: job.reconciliationError,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }));
}

export async function prepareMotrendJob(
  prisma: Prisma.DefaultPrismaClient,
  input: MotrendPrepareJobInput,
) {
  return await prisma.$transaction(async (tx) => {
    const requestedSelectionKind = normalizeSelectionKind(input.selectionKind);

    if (input.clientRequestId) {
      const existingRequest = await tx.moTrendJobRequest.findUnique({
        where: {
          idempotencyKey: buildClientRequestKey(input.userId, input.clientRequestId),
        },
        include: {
          job: true,
        },
      });

      if (existingRequest) {
        return {
          jobId: existingRequest.job.id,
          uploadPath: existingRequest.job.inputImagePath,
          reused: true,
        };
      }
    }

    const awaitingUploadJob = await tx.moTrendJob.findFirst({
      where: {
        accountId: input.accountId,
        userId: input.userId,
        status: MotrendJobStatus.AWAITING_UPLOAD,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    let template = null;
    if (awaitingUploadJob) {
      template = await tx.moTrendTemplate.findFirst({
        where: {
          OR: [
            {id: input.templateId},
            {code: input.templateId},
          ],
        },
      });

      if (
        template?.isActive &&
        awaitingUploadJob.templateId === template.id &&
        awaitingUploadJob.selectionKind === requestedSelectionKind
      ) {
        return {
          jobId: awaitingUploadJob.id,
          uploadPath: awaitingUploadJob.inputImagePath,
          reused: true,
        };
      }
    }

    assertOrThrow(
      !awaitingUploadJob,
      409,
      "active_job_exists",
      "Finish the current upload before starting a new one.",
      awaitingUploadJob ?
        {activeJobId: awaitingUploadJob.id, activeStatus: awaitingUploadJob.status} :
        undefined,
    );

    const activeGenerationCount = await tx.moTrendJob.count({
      where: {
        accountId: input.accountId,
        userId: input.userId,
        status: {
          in: [
            MotrendJobStatus.QUEUED,
            MotrendJobStatus.PROCESSING,
          ],
        },
      },
    });

    assertOrThrow(
      activeGenerationCount < MAX_ACTIVE_GENERATION_JOBS,
      409,
      "active_queue_limit_reached",
      `You already have ${MAX_ACTIVE_GENERATION_JOBS} generations in progress. Wait for one to finish before starting another.`,
      {
        activeCount: activeGenerationCount,
        activeLimit: MAX_ACTIVE_GENERATION_JOBS,
      },
    );

    if (!template) {
      template = await tx.moTrendTemplate.findFirst({
        where: {
          OR: [
            {id: input.templateId},
            {code: input.templateId},
          ],
        },
      });
    }
    assertOrThrow(template?.isActive, 400, "template_inactive", "Template is not active.");

    const job = await tx.moTrendJob.create({
      data: {
        accountId: input.accountId,
        userId: input.userId,
        templateId: template.id,
        selectionKind: requestedSelectionKind,
        status: MotrendJobStatus.AWAITING_UPLOAD,
        inputImagePath: `user_uploads/${input.firebaseUid}/${crypto.randomUUID()}/photo.jpg`,
      },
    });

    const uploadPath = `user_uploads/${input.firebaseUid}/${job.id}/photo.jpg`;
    const updatedJob = await tx.moTrendJob.update({
      where: {id: job.id},
      data: {
        inputImagePath: uploadPath,
      },
    });

    if (input.clientRequestId) {
      await tx.moTrendJobRequest.create({
        data: {
          jobId: updatedJob.id,
          userId: input.userId,
          clientRequestId: input.clientRequestId,
          idempotencyKey: buildClientRequestKey(input.userId, input.clientRequestId),
        },
      });
    }

    return {
      jobId: updatedJob.id,
      uploadPath: updatedJob.inputImagePath,
      reused: false,
    };
  });
}

export async function finalizePreparedMotrendJob(
  prisma: Prisma.DefaultPrismaClient,
  input: FinalizePreparedMotrendJobInput,
) {
  return await prisma.$transaction(async (tx) => {
    const job = await tx.moTrendJob.findUnique({
      where: {id: input.jobId},
    });
    assertOwnedJob(job, input.accountId, input.userId);

    assertOrThrow(job.inputImagePath === input.inputImagePath, 400, "invalid_input_image_path", "Invalid input image path.");

    if (job.status !== MotrendJobStatus.AWAITING_UPLOAD) {
      if (job.inputImageUrl && job.debitedCredits !== null) {
        return {
          jobId: job.id,
          status: job.status,
          finalized: true,
        };
      }

      throw new PlatformError(409, "job_not_finalizable", "Job cannot be finalized in its current state.");
    }

    const template = await tx.moTrendTemplate.findUnique({
      where: {id: job.templateId},
    });
    assertOrThrow(template?.isActive, 400, "template_inactive", "Template is not active.");

    const effectiveReferenceVideoUrl = input.referenceVideoUrl ?? template.referenceVideoUrl;
    assertOrThrow(effectiveReferenceVideoUrl, 400, "missing_reference_video", "Reference video is not available for this job.");

    const billedDurationSec = input.uploadedReferenceDurationSec != null ?
      Math.max(1, Math.ceil(input.uploadedReferenceDurationSec)) :
      templateCostCredits(template.durationSec);
    const costCredits = billedDurationSec;

    const wallet = await ensureGlobalCreditsWallet(tx, input.accountId);
    await debitWalletCredits(tx, {
      walletId: wallet.id,
      accountId: input.accountId,
      productId: null,
      entryType: LedgerEntryType.SPEND,
      amountDelta: -costCredits,
      reasonCode: "motrend_job_debit",
      refType: "motrend_job",
      refId: job.id,
      operationKey: `motrend:finalize:${job.id}:debit`,
      metadataJson: {
        selectionKind: job.selectionKind,
      },
    });

    const updated = await tx.moTrendJob.update({
      where: {id: job.id},
      data: {
        status: MotrendJobStatus.QUEUED,
        debitedCredits: costCredits,
        billingSource: input.uploadedReferenceDurationSec != null ? "reference_video_duration" : "template_duration",
        billingDurationSec: billedDurationSec,
        billingRawDurationSec: input.uploadedReferenceDurationSec ?? null,
        inputImageUrl: input.inputImageUrl,
        inputImagePath: input.inputImagePath,
        referenceVideoPath: input.referenceVideoPath ?? null,
        referenceVideoUrl: effectiveReferenceVideoUrl,
        providerState: "queued",
        finalizedAt: new Date(),
        metadataJson: {
          queue: {
            nextAction: "submit_pending",
          },
        },
      },
    });

    await scheduleMotrendSubmitTaskTx(tx, {
      jobId: job.id,
    });

    await tx.auditLog.create({
      data: {
        accountId: input.accountId,
        userId: input.userId,
        actionCode: "motrend.job_finalized",
        targetType: "motrend_job",
        targetId: job.id,
        payloadJson: {
          billedDurationSec,
          costCredits,
          selectionKind: job.selectionKind,
        },
      },
    });

    return {
      jobId: updated.id,
      status: updated.status,
      finalized: true,
    };
  });
}

export async function getOwnedMotrendJob(
  prisma: DbClient,
  input: {
    accountId: string;
    userId: string;
    jobId: string;
  },
) {
  const job = await prisma.moTrendJob.findUnique({
    where: {id: input.jobId},
    include: {
      downloadArtifacts: true,
    },
  });
  assertOwnedJob(job, input.accountId, input.userId);
  return job;
}

export async function reconcileReferenceJobBilling(
  prisma: Prisma.DefaultPrismaClient,
  input: ReconcileReferenceBillingInput,
) {
  return await prisma.$transaction(async (tx) => {
    const job = await tx.moTrendJob.findUnique({
      where: {id: input.jobId},
    });
    assertOwnedJob(job, input.accountId, input.userId);

    if (
      job.status !== MotrendJobStatus.DONE ||
      job.selectionKind !== MotrendSelectionKind.REFERENCE ||
      job.debitedCredits == null
    ) {
      return job;
    }

    const outputDurationSec = Math.max(1, Math.ceil(input.outputRawDurationSec));
    const finalCostCredits = Math.min(job.debitedCredits, outputDurationSec);
    const refundAmount = job.debitedCredits > finalCostCredits ?
      job.debitedCredits - finalCostCredits :
      0;

    if (refundAmount > 0 && !job.refundCredits) {
      const wallet = await ensureGlobalCreditsWallet(tx, input.accountId);
      await appendLedgerEntry(tx, {
        walletId: wallet.id,
        accountId: input.accountId,
        productId: null,
        entryType: LedgerEntryType.REFUND,
        amountDelta: refundAmount,
        reasonCode: "motrend_output_duration_reconciliation",
        refType: "motrend_job",
        refId: job.id,
        operationKey: `motrend:reconcile:${job.id}:refund`,
      });
    }

    return await tx.moTrendJob.update({
      where: {id: job.id},
      data: {
        outputRawDurationSec: input.outputRawDurationSec,
        outputDurationSec,
        finalCostCredits,
        refundCredits: refundAmount > 0 ? refundAmount : job.refundCredits,
        reconciliationError: null,
      },
    });
  });
}

export async function upsertMotrendDownloadArtifacts(
  prisma: Prisma.DefaultPrismaClient,
  input: DownloadArtifactUpsertInput,
) {
  return await prisma.$transaction(async (tx) => {
    const job = await tx.moTrendJob.findUnique({
      where: {id: input.jobId},
    });
    assertOwnedJob(job, input.accountId, input.userId);

    const inlineMetadataJson = input.inlineArtifact.metadataJson ?? Prisma.JsonNull;
    const downloadMetadataJson = input.downloadArtifact.metadataJson ?? Prisma.JsonNull;

    const inline = await tx.moTrendDownloadArtifact.upsert({
      where: {
        jobId_artifactType: {
          jobId: input.jobId,
          artifactType: MotrendDownloadArtifactType.INLINE,
        },
      },
      update: {
        storagePath: input.inlineArtifact.storagePath,
        downloadToken: input.inlineArtifact.downloadToken,
        fileName: input.inlineArtifact.fileName,
        contentType: input.inlineArtifact.contentType,
        sizeBytes: input.inlineArtifact.sizeBytes,
        expiresAt: input.inlineArtifact.expiresAt,
        metadataJson: inlineMetadataJson,
      },
      create: {
        jobId: input.jobId,
        artifactType: MotrendDownloadArtifactType.INLINE,
        storagePath: input.inlineArtifact.storagePath,
        downloadToken: input.inlineArtifact.downloadToken,
        fileName: input.inlineArtifact.fileName,
        contentType: input.inlineArtifact.contentType,
        sizeBytes: input.inlineArtifact.sizeBytes,
        expiresAt: input.inlineArtifact.expiresAt,
        metadataJson: inlineMetadataJson,
      },
    });

    const download = await tx.moTrendDownloadArtifact.upsert({
      where: {
        jobId_artifactType: {
          jobId: input.jobId,
          artifactType: MotrendDownloadArtifactType.DOWNLOAD,
        },
      },
      update: {
        storagePath: input.downloadArtifact.storagePath,
        downloadToken: input.downloadArtifact.downloadToken,
        fileName: input.downloadArtifact.fileName,
        contentType: input.downloadArtifact.contentType,
        sizeBytes: input.downloadArtifact.sizeBytes,
        expiresAt: input.downloadArtifact.expiresAt,
        metadataJson: downloadMetadataJson,
      },
      create: {
        jobId: input.jobId,
        artifactType: MotrendDownloadArtifactType.DOWNLOAD,
        storagePath: input.downloadArtifact.storagePath,
        downloadToken: input.downloadArtifact.downloadToken,
        fileName: input.downloadArtifact.fileName,
        contentType: input.downloadArtifact.contentType,
        sizeBytes: input.downloadArtifact.sizeBytes,
        expiresAt: input.downloadArtifact.expiresAt,
        metadataJson: downloadMetadataJson,
      },
    });

    await tx.auditLog.create({
      data: {
        accountId: input.accountId,
        userId: input.userId,
        actionCode: "motrend.download_prepared",
        targetType: "motrend_job",
        targetId: input.jobId,
        payloadJson: {
          inlineArtifactId: inline.id,
          downloadArtifactId: download.id,
        },
      },
    });

    return {inline, download};
  });
}

export async function getActiveMotrendDownloadArtifacts(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    accountId: string;
    userId: string;
    jobId: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const job = await getOwnedMotrendJob(prisma, input);

  const inline = job.downloadArtifacts.find((artifact) => artifact.artifactType === MotrendDownloadArtifactType.INLINE);
  const download = job.downloadArtifacts.find((artifact) => artifact.artifactType === MotrendDownloadArtifactType.DOWNLOAD);

  if (inline && download && inline.expiresAt > now && download.expiresAt > now) {
    return {inline, download};
  }

  return null;
}
