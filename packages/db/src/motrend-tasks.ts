import {
  LedgerEntryType,
  MotrendJobStatus,
  MotrendTaskStatus,
  MotrendTaskType,
  Prisma,
} from "@prisma/client";

import {PlatformError, assertOrThrow} from "./errors.js";
import {
  appendLedgerEntry,
  ensureGlobalCreditsWallet,
} from "./wallet.js";

type DbClient = Prisma.TransactionClient | Prisma.DefaultPrismaClient;

const OPEN_TASK_STATUSES = [MotrendTaskStatus.QUEUED, MotrendTaskStatus.PROCESSING] as const;

export const MOTREND_PROVIDER_POLL_DELAY_MS = 2_000;
export const MOTREND_TASK_LEASE_MS = 60_000;
export const MOTREND_PROVIDER_FAILURE_REFUND_REASON = "motrend_provider_failure_refund";
export const MOTREND_AWAITING_UPLOAD_TIMEOUT_MS = 6 * 60 * 60 * 1000;
export const MOTREND_SUBMIT_TIMEOUT_MS = 30 * 60 * 1000;
export const MOTREND_PROCESSING_TIMEOUT_MS = 2 * 60 * 60 * 1000;

function readJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function buildSubmitOperationKey(jobId: string): string {
  return `motrend:job:${jobId}:submit`;
}

function buildPollOperationKey(jobId: string, notBeforeAt: Date): string {
  const bucket = Math.max(
    0,
    Math.floor(notBeforeAt.getTime() / MOTREND_PROVIDER_POLL_DELAY_MS),
  );
  return `motrend:job:${jobId}:poll:${bucket}`;
}

function buildFailureMetadata(
  metadataJson: Prisma.JsonValue | null,
  errorMessage: string,
): Prisma.InputJsonValue {
  return {
    ...readJsonObject(metadataJson),
    providerError: errorMessage,
  } as Prisma.InputJsonValue;
}

function buildQueueMetadata(
  metadataJson: Prisma.JsonValue | null,
  patch: Record<string, unknown>,
): Prisma.InputJsonValue {
  return {
    ...readJsonObject(metadataJson),
    queue: {
      ...readJsonObject(readJsonObject(metadataJson).queue),
      ...patch,
    },
  } as Prisma.InputJsonValue;
}

function assertOwnedJob(
  job: {accountId: string; userId: string} | null,
  accountId: string,
  userId: string,
): asserts job {
  assertOrThrow(job, 404, "job_not_found", "Job was not found.");
  assertOrThrow(
    job.accountId === accountId && job.userId === userId,
    403,
    "job_forbidden",
    "No access to this job.",
  );
}

async function createMotrendTaskTx(
  tx: DbClient,
  input: {
    jobId: string;
    taskType: MotrendTaskType;
    operationKey: string;
    notBeforeAt?: Date;
    providerCode?: string;
    payloadJson?: Prisma.InputJsonValue;
  },
) {
  return await tx.moTrendJobTask.upsert({
    where: {
      operationKey: input.operationKey,
    },
    update: {},
    create: {
      jobId: input.jobId,
      taskType: input.taskType,
      status: MotrendTaskStatus.QUEUED,
      providerCode: input.providerCode ?? "kling",
      operationKey: input.operationKey,
      notBeforeAt: input.notBeforeAt ?? new Date(),
      payloadJson: input.payloadJson ?? Prisma.JsonNull,
    },
  });
}

async function getOpenMotrendTaskTx(
  tx: DbClient,
  input: {
    jobId: string;
    taskType: MotrendTaskType;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  return await tx.moTrendJobTask.findFirst({
    where: {
      jobId: input.jobId,
      taskType: input.taskType,
      OR: [
        {
          status: MotrendTaskStatus.QUEUED,
        },
        {
          status: MotrendTaskStatus.PROCESSING,
          leaseUntil: {
            gt: now,
          },
        },
      ],
    },
    orderBy: [
      {notBeforeAt: "asc"},
      {createdAt: "asc"},
    ],
  });
}

async function cancelOpenMotrendTasksTx(
  tx: DbClient,
  input: {
    jobId: string;
    excludeTaskId?: string;
  },
) {
  await tx.moTrendJobTask.updateMany({
    where: {
      jobId: input.jobId,
      status: {
        in: [...OPEN_TASK_STATUSES],
      },
      ...(input.excludeTaskId ? {
        NOT: {
          id: input.excludeTaskId,
        },
      } : {}),
    },
    data: {
      status: MotrendTaskStatus.CANCELLED,
      leaseUntil: null,
      processedAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

async function refundFailedMotrendJobTx(
  tx: DbClient,
  job: {
    id: string;
    accountId: string;
    debitedCredits: number | null;
    refundCredits: number | null;
  },
  reasonCode = MOTREND_PROVIDER_FAILURE_REFUND_REASON,
): Promise<{
  refundCredits: number | null;
  finalCostCredits: number | null;
}> {
  if (!job.debitedCredits || job.refundCredits) {
    return {
      refundCredits: job.refundCredits,
      finalCostCredits: 0,
    };
  }

  const wallet = await ensureGlobalCreditsWallet(tx, job.accountId);
  await appendLedgerEntry(tx, {
    walletId: wallet.id,
    accountId: job.accountId,
    productId: null,
    entryType: LedgerEntryType.REFUND,
    amountDelta: job.debitedCredits,
    reasonCode,
    refType: "motrend_job",
    refId: job.id,
    operationKey: `motrend:job:${job.id}:refund:${reasonCode}`,
  });

  return {
    refundCredits: job.debitedCredits,
    finalCostCredits: 0,
  };
}

export async function scheduleMotrendSubmitTaskTx(
  tx: DbClient,
  input: {
    jobId: string;
    providerCode?: string;
  },
) {
  return await createMotrendTaskTx(tx, {
    jobId: input.jobId,
    taskType: MotrendTaskType.SUBMIT,
    operationKey: buildSubmitOperationKey(input.jobId),
    ...(input.providerCode ? {providerCode: input.providerCode} : {}),
  });
}

export async function scheduleMotrendPollTaskTx(
  tx: DbClient,
  input: {
    jobId: string;
    notBeforeAt?: Date;
    providerCode?: string;
    force?: boolean;
  },
) {
  if (!input.force) {
    const existingOpenTask = await getOpenMotrendTaskTx(tx, {
      jobId: input.jobId,
      taskType: MotrendTaskType.POLL,
      ...(input.notBeforeAt ? {now: input.notBeforeAt} : {}),
    });
    if (existingOpenTask) {
      return existingOpenTask;
    }
  }

  const notBeforeAt = input.notBeforeAt ?? new Date();
  return await createMotrendTaskTx(tx, {
    jobId: input.jobId,
    taskType: MotrendTaskType.POLL,
    notBeforeAt,
    operationKey: buildPollOperationKey(input.jobId, notBeforeAt),
    ...(input.providerCode ? {providerCode: input.providerCode} : {}),
  });
}

function buildRetryAfterMs(
  task: {
    status: MotrendTaskStatus;
    notBeforeAt: Date;
    leaseUntil: Date | null;
  },
  now: Date,
): number {
  if (task.status === MotrendTaskStatus.PROCESSING && task.leaseUntil) {
    return Math.max(1_000, task.leaseUntil.getTime() - now.getTime());
  }

  return Math.max(1_000, task.notBeforeAt.getTime() - now.getTime(), MOTREND_PROVIDER_POLL_DELAY_MS);
}

export async function requestMotrendJobRefresh(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    accountId: string;
    userId: string;
    jobId: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();

  return await prisma.$transaction(async (tx) => {
    const job = await tx.moTrendJob.findUnique({
      where: {id: input.jobId},
    });
    assertOwnedJob(job, input.accountId, input.userId);

    const refreshable = (
      job.status === MotrendJobStatus.QUEUED ||
      job.status === MotrendJobStatus.PROCESSING
    ) && !!job.providerTaskId;

    if (!refreshable) {
      return {
        job,
        queuedForRefresh: false,
      };
    }

    const openPollTask = await getOpenMotrendTaskTx(tx, {
      jobId: job.id,
      taskType: MotrendTaskType.POLL,
      now,
    });

    if (openPollTask) {
      return {
        job,
        queuedForRefresh: true,
        retryAfterMs: buildRetryAfterMs(openPollTask, now),
      };
    }

    if (
      job.lastStatusCheckAt &&
      now.getTime() - job.lastStatusCheckAt.getTime() < MOTREND_PROVIDER_POLL_DELAY_MS
    ) {
      return {
        job,
        queuedForRefresh: true,
        retryAfterMs: Math.max(
          1_000,
          MOTREND_PROVIDER_POLL_DELAY_MS - (now.getTime() - job.lastStatusCheckAt.getTime()),
        ),
      };
    }

    const updatedJob = await tx.moTrendJob.update({
      where: {id: job.id},
      data: {
        lastStatusCheckAt: now,
        metadataJson: buildQueueMetadata(job.metadataJson, {
          nextAction: "poll_requested",
          requestedAt: now.toISOString(),
        }),
      },
    });

    await scheduleMotrendPollTaskTx(tx, {
      jobId: job.id,
      notBeforeAt: now,
    });

    return {
      job: updatedJob,
      queuedForRefresh: true,
      retryAfterMs: MOTREND_PROVIDER_POLL_DELAY_MS,
    };
  });
}

export async function claimNextMotrendJobTask(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    taskType?: MotrendTaskType;
    now?: Date;
    leaseMs?: number;
  } = {},
) {
  const now = input.now ?? new Date();
  const leaseUntil = new Date(now.getTime() + (input.leaseMs ?? MOTREND_TASK_LEASE_MS));

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const claimed = await prisma.$transaction(async (tx) => {
      const candidate = await tx.moTrendJobTask.findFirst({
        where: {
          ...(input.taskType ? {taskType: input.taskType} : {}),
          notBeforeAt: {
            lte: now,
          },
          OR: [
            {
              status: MotrendTaskStatus.QUEUED,
            },
            {
              status: MotrendTaskStatus.PROCESSING,
              leaseUntil: {
                lt: now,
              },
            },
          ],
        },
        orderBy: [
          {notBeforeAt: "asc"},
          {createdAt: "asc"},
        ],
        include: {
          job: true,
        },
      });

      if (!candidate) {
        return null;
      }

      const updated = await tx.moTrendJobTask.updateMany({
        where: {
          id: candidate.id,
          OR: [
            {
              status: MotrendTaskStatus.QUEUED,
            },
            {
              status: MotrendTaskStatus.PROCESSING,
              leaseUntil: {
                lt: now,
              },
            },
          ],
        },
        data: {
          status: MotrendTaskStatus.PROCESSING,
          claimedAt: now,
          leaseUntil,
          attempts: {
            increment: 1,
          },
          lastError: null,
        },
      });

      if (updated.count === 0) {
        return "retry" as const;
      }

      return await tx.moTrendJobTask.findUnique({
        where: {id: candidate.id},
        include: {
          job: true,
        },
      });
    });

    if (claimed === "retry") {
      continue;
    }

    return claimed;
  }

  return null;
}

export async function markMotrendTaskFailed(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    taskId: string;
    errorMessage: string;
  },
) {
  return await prisma.moTrendJobTask.update({
    where: {id: input.taskId},
    data: {
      status: MotrendTaskStatus.FAILED,
      lastError: input.errorMessage,
      processedAt: new Date(),
      leaseUntil: null,
    },
  });
}

export async function markMotrendSubmitTaskSucceeded(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    taskId: string;
    providerTaskId: string;
    providerState: string;
    nextPollDelayMs?: number | null;
  },
) {
  return await prisma.$transaction(async (tx) => {
    const task = await tx.moTrendJobTask.findUnique({
      where: {id: input.taskId},
      include: {
        job: true,
      },
    });

    assertOrThrow(task, 404, "task_not_found", "Task was not found.");
    assertOrThrow(task.taskType === MotrendTaskType.SUBMIT, 409, "task_type_mismatch", "Task is not a submit task.");

    const now = new Date();
    const updatedJob = await tx.moTrendJob.update({
      where: {id: task.jobId},
      data: {
        status: MotrendJobStatus.PROCESSING,
        providerTaskId: input.providerTaskId,
        providerState: input.providerState,
        lastStatusCheckAt: now,
        metadataJson: buildQueueMetadata(task.job.metadataJson, {
          nextAction: input.nextPollDelayMs ? "poll_scheduled" : "manual_poll_required",
          submitCompletedAt: now.toISOString(),
        }),
      },
    });

    if (input.nextPollDelayMs && input.nextPollDelayMs > 0) {
      await scheduleMotrendPollTaskTx(tx, {
        jobId: task.jobId,
        notBeforeAt: new Date(now.getTime() + input.nextPollDelayMs),
      });
    }

    await tx.moTrendJobTask.update({
      where: {id: task.id},
      data: {
        status: MotrendTaskStatus.DONE,
        processedAt: now,
        leaseUntil: null,
        lastError: null,
      },
    });

    return updatedJob;
  });
}

export async function failMotrendSubmitTaskAndJob(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    taskId: string;
    errorMessage: string;
  },
) {
  return await prisma.$transaction(async (tx) => {
    const task = await tx.moTrendJobTask.findUnique({
      where: {id: input.taskId},
      include: {
        job: true,
      },
    });

    assertOrThrow(task, 404, "task_not_found", "Task was not found.");
    assertOrThrow(task.taskType === MotrendTaskType.SUBMIT, 409, "task_type_mismatch", "Task is not a submit task.");

    const refund = await refundFailedMotrendJobTx(tx, task.job);
    const now = new Date();

    const updatedJob = await tx.moTrendJob.update({
      where: {id: task.jobId},
      data: {
        status: MotrendJobStatus.FAILED,
        providerState: "failed",
        finalCostCredits: refund.finalCostCredits,
        refundCredits: refund.refundCredits,
        metadataJson: buildFailureMetadata(task.job.metadataJson, input.errorMessage),
      },
    });

    await cancelOpenMotrendTasksTx(tx, {
      jobId: task.jobId,
      excludeTaskId: task.id,
    });

    await tx.moTrendJobTask.update({
      where: {id: task.id},
      data: {
        status: MotrendTaskStatus.FAILED,
        lastError: input.errorMessage,
        processedAt: now,
        leaseUntil: null,
      },
    });

    return updatedJob;
  });
}

export async function applyMotrendPollResult(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    taskId: string;
    state: "processing" | "succeed" | "failed";
    outputUrl?: string | null;
    watermarkUrl?: string | null;
    error?: string | null;
    nextPollDelayMs?: number | null;
  },
) {
  return await prisma.$transaction(async (tx) => {
    const task = await tx.moTrendJobTask.findUnique({
      where: {id: input.taskId},
      include: {
        job: true,
      },
    });

    assertOrThrow(task, 404, "task_not_found", "Task was not found.");
    assertOrThrow(task.taskType === MotrendTaskType.POLL, 409, "task_type_mismatch", "Task is not a poll task.");

    const now = new Date();
    let updatedJob;

    if (input.state === "succeed") {
      assertOrThrow(input.outputUrl, 409, "provider_output_required", "Provider outputUrl is required.");
      updatedJob = await tx.moTrendJob.update({
        where: {id: task.jobId},
        data: {
          status: MotrendJobStatus.DONE,
          providerState: "succeed",
          providerOutputUrl: input.outputUrl,
          providerWatermarkUrl: input.watermarkUrl ?? null,
          lastStatusCheckAt: now,
          metadataJson: buildQueueMetadata(task.job.metadataJson, {
            nextAction: "download_ready",
            pollCompletedAt: now.toISOString(),
          }),
        },
      });

      await cancelOpenMotrendTasksTx(tx, {
        jobId: task.jobId,
        excludeTaskId: task.id,
      });
    } else if (input.state === "failed") {
      const refund = await refundFailedMotrendJobTx(tx, task.job);
      updatedJob = await tx.moTrendJob.update({
        where: {id: task.jobId},
        data: {
          status: MotrendJobStatus.FAILED,
          providerState: "failed",
          finalCostCredits: refund.finalCostCredits,
          refundCredits: refund.refundCredits,
          lastStatusCheckAt: now,
          metadataJson: buildFailureMetadata(task.job.metadataJson, input.error ?? "Provider processing failed."),
        },
      });

      await cancelOpenMotrendTasksTx(tx, {
        jobId: task.jobId,
        excludeTaskId: task.id,
      });
    } else {
      updatedJob = await tx.moTrendJob.update({
        where: {id: task.jobId},
        data: {
          status: MotrendJobStatus.PROCESSING,
          providerState: "processing",
          lastStatusCheckAt: now,
          metadataJson: buildQueueMetadata(task.job.metadataJson, {
            nextAction: input.nextPollDelayMs ? "poll_scheduled" : "poll_pending_manual_refresh",
            pollCompletedAt: now.toISOString(),
          }),
        },
      });

      if (input.nextPollDelayMs && input.nextPollDelayMs > 0) {
        await scheduleMotrendPollTaskTx(tx, {
          jobId: task.jobId,
          notBeforeAt: new Date(now.getTime() + input.nextPollDelayMs),
        });
      }
    }

    await tx.moTrendJobTask.update({
      where: {id: task.id},
      data: {
        status: MotrendTaskStatus.DONE,
        processedAt: now,
        leaseUntil: null,
        lastError: null,
      },
    });

    return updatedJob;
  });
}

export async function simulateMotrendProviderResult(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    jobId: string;
    state: "succeed" | "failed";
    outputUrl?: string | null;
    watermarkUrl?: string | null;
    error?: string | null;
  },
) {
  return await prisma.$transaction(async (tx) => {
    const job = await tx.moTrendJob.findUnique({
      where: {id: input.jobId},
    });

    assertOrThrow(job, 404, "job_not_found", "Job was not found.");
    assertOrThrow(job.debitedCredits != null, 409, "job_not_finalized", "Job has not been finalized yet.");

    const now = new Date();
    let updatedJob;

    if (input.state === "succeed") {
      assertOrThrow(input.outputUrl, 409, "provider_output_required", "Provider outputUrl is required.");
      updatedJob = await tx.moTrendJob.update({
        where: {id: job.id},
        data: {
          status: MotrendJobStatus.DONE,
          providerState: "succeed",
          providerOutputUrl: input.outputUrl,
          providerWatermarkUrl: input.watermarkUrl ?? null,
          lastStatusCheckAt: now,
          metadataJson: buildQueueMetadata(job.metadataJson, {
            nextAction: "download_ready",
            simulatedAt: now.toISOString(),
          }),
        },
      });
    } else {
      const refund = await refundFailedMotrendJobTx(tx, job);
      updatedJob = await tx.moTrendJob.update({
        where: {id: job.id},
        data: {
          status: MotrendJobStatus.FAILED,
          providerState: "failed",
          finalCostCredits: refund.finalCostCredits,
          refundCredits: refund.refundCredits,
          lastStatusCheckAt: now,
          metadataJson: buildFailureMetadata(job.metadataJson, input.error ?? "Simulated provider failure."),
        },
      });
    }

    await cancelOpenMotrendTasksTx(tx, {
      jobId: job.id,
    });

    return updatedJob;
  });
}

export async function sweepStaleMotrendJobs(
  prisma: Prisma.DefaultPrismaClient,
  input: {
    now?: Date;
    limitPerBucket?: number;
  } = {},
) {
  const now = input.now ?? new Date();
  const limitPerBucket = Math.max(1, Math.min(input.limitPerBucket ?? 100, 500));
  const awaitingUploadCutoff = new Date(now.getTime() - MOTREND_AWAITING_UPLOAD_TIMEOUT_MS);
  const queuedCutoff = new Date(now.getTime() - MOTREND_SUBMIT_TIMEOUT_MS);
  const processingCutoff = new Date(now.getTime() - MOTREND_PROCESSING_TIMEOUT_MS);

  const result = {
    awaitingUploadScanned: 0,
    awaitingUploadFailed: 0,
    queuedScanned: 0,
    queuedFailed: 0,
    queuedRefunded: 0,
    processingScanned: 0,
    processingFailed: 0,
    processingRefunded: 0,
  };

  const awaitingUploadCandidates = await prisma.moTrendJob.findMany({
    where: {
      status: MotrendJobStatus.AWAITING_UPLOAD,
      createdAt: {
        lte: awaitingUploadCutoff,
      },
      inputImageUrl: null,
    },
    orderBy: {
      createdAt: "asc",
    },
    take: limitPerBucket,
  });

  result.awaitingUploadScanned = awaitingUploadCandidates.length;
  for (const candidate of awaitingUploadCandidates) {
    const markedFailed = await prisma.$transaction(async (tx) => {
      const job = await tx.moTrendJob.findUnique({
        where: {id: candidate.id},
      });

      if (
        !job ||
        job.status !== MotrendJobStatus.AWAITING_UPLOAD ||
        !!job.inputImageUrl ||
        job.createdAt > awaitingUploadCutoff
      ) {
        return false;
      }

      await tx.moTrendJob.update({
        where: {id: job.id},
        data: {
          status: MotrendJobStatus.FAILED,
          providerState: "failed",
          metadataJson: buildFailureMetadata(job.metadataJson, "Upload timed out before finalize."),
        },
      });

      await cancelOpenMotrendTasksTx(tx, {
        jobId: job.id,
      });

      return true;
    });

    if (markedFailed) {
      result.awaitingUploadFailed += 1;
    }
  }

  const queuedCandidates = await prisma.moTrendJob.findMany({
    where: {
      status: MotrendJobStatus.QUEUED,
      providerTaskId: null,
      finalizedAt: {
        lte: queuedCutoff,
      },
    },
    orderBy: {
      finalizedAt: "asc",
    },
    take: limitPerBucket,
  });

  result.queuedScanned = queuedCandidates.length;
  for (const candidate of queuedCandidates) {
    const timedOut = await prisma.$transaction(async (tx) => {
      const job = await tx.moTrendJob.findUnique({
        where: {id: candidate.id},
      });

      if (
        !job ||
        job.status !== MotrendJobStatus.QUEUED ||
        !!job.providerTaskId ||
        !job.finalizedAt ||
        job.finalizedAt > queuedCutoff
      ) {
        return {
          failed: false,
          refunded: false,
        };
      }

      const refund = await refundFailedMotrendJobTx(tx, job, "motrend_submit_timeout_refund");
      await tx.moTrendJob.update({
        where: {id: job.id},
        data: {
          status: MotrendJobStatus.FAILED,
          providerState: "failed",
          finalCostCredits: refund.finalCostCredits,
          refundCredits: refund.refundCredits,
          metadataJson: buildFailureMetadata(job.metadataJson, "Provider submit timed out."),
        },
      });

      await cancelOpenMotrendTasksTx(tx, {
        jobId: job.id,
      });

      return {
        failed: true,
        refunded: refund.refundCredits != null && refund.refundCredits > 0,
      };
    });

    if (timedOut.failed) {
      result.queuedFailed += 1;
      if (timedOut.refunded) {
        result.queuedRefunded += 1;
      }
    }
  }

  const processingCandidates = await prisma.moTrendJob.findMany({
    where: {
      status: MotrendJobStatus.PROCESSING,
      updatedAt: {
        lte: processingCutoff,
      },
    },
    orderBy: {
      updatedAt: "asc",
    },
    take: limitPerBucket,
  });

  result.processingScanned = processingCandidates.length;
  for (const candidate of processingCandidates) {
    const timedOut = await prisma.$transaction(async (tx) => {
      const job = await tx.moTrendJob.findUnique({
        where: {id: candidate.id},
      });

      if (
        !job ||
        job.status !== MotrendJobStatus.PROCESSING ||
        job.updatedAt > processingCutoff
      ) {
        return {
          failed: false,
          refunded: false,
        };
      }

      const refund = await refundFailedMotrendJobTx(tx, job, "motrend_processing_timeout_refund");
      await tx.moTrendJob.update({
        where: {id: job.id},
        data: {
          status: MotrendJobStatus.FAILED,
          providerState: "failed",
          finalCostCredits: refund.finalCostCredits,
          refundCredits: refund.refundCredits,
          metadataJson: buildFailureMetadata(job.metadataJson, "Processing timed out."),
        },
      });

      await cancelOpenMotrendTasksTx(tx, {
        jobId: job.id,
      });

      return {
        failed: true,
        refunded: refund.refundCredits != null && refund.refundCredits > 0,
      };
    });

    if (timedOut.failed) {
      result.processingFailed += 1;
      if (timedOut.refunded) {
        result.processingRefunded += 1;
      }
    }
  }

  return result;
}
