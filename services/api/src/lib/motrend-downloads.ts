import {
  getActiveMotrendDownloadArtifacts,
  getOwnedMotrendJob,
  Prisma,
  reconcileReferenceJobBilling,
  upsertMotrendDownloadArtifacts,
  PlatformError,
} from "@moads/db";
import {FastifyInstance} from "fastify";

import {
  prepareDownloadArtifacts,
  probeRemoteVideoDurationSeconds,
} from "./media.js";

export const DOWNLOAD_PREPARE_RETRY_MS = 2_000;
const DOWNLOAD_PREPARE_STALE_MS = 2 * 60 * 1000;

type DownloadPrepareStatus = "pending" | "processing" | "failed" | "ready";

interface DownloadPrepareState {
  status: DownloadPrepareStatus | null;
  requestedAtMs: number | null;
  lastError: string | null;
}

function readJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readDownloadPrepareState(metadataJson: Prisma.JsonValue | null): DownloadPrepareState {
  const root = readJsonObject(metadataJson);
  const downloadPrepare = readJsonObject(root.downloadPrepare);
  const requestedAtMs = Number(downloadPrepare.requestedAtMs);

  return {
    status: typeof downloadPrepare.status === "string" ?
      downloadPrepare.status as DownloadPrepareStatus :
      null,
    requestedAtMs: Number.isFinite(requestedAtMs) ? requestedAtMs : null,
    lastError: typeof downloadPrepare.lastError === "string" ?
      downloadPrepare.lastError :
      null,
  };
}

function buildMetadataWithDownloadPrepare(
  metadataJson: Prisma.JsonValue | null,
  patch: Record<string, unknown>,
): Prisma.InputJsonValue {
  const root = readJsonObject(metadataJson);
  const downloadPrepare = readJsonObject(root.downloadPrepare);

  return {
    ...root,
    downloadPrepare: {
      ...downloadPrepare,
      ...patch,
    },
  } as Prisma.InputJsonValue;
}

async function setDownloadPrepareState(
  app: FastifyInstance,
  jobId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const job = await app.prisma.moTrendJob.findUnique({
    where: {id: jobId},
    select: {metadataJson: true},
  });
  if (!job) {
    return;
  }

  await app.prisma.moTrendJob.update({
    where: {id: jobId},
    data: {
      metadataJson: buildMetadataWithDownloadPrepare(job.metadataJson, patch),
    },
  });
}

export async function markMotrendDownloadPreparationFailed(
  app: FastifyInstance,
  jobId: string,
  lastError: string,
): Promise<void> {
  await setDownloadPrepareState(app, jobId, {
    status: "failed",
    requestedAtMs: Date.now(),
    lastError,
  });
}

function buildArtifactUrls(
  bucketName: string,
  artifacts: Awaited<ReturnType<typeof getActiveMotrendDownloadArtifacts>>,
  cached: boolean,
) {
  if (!artifacts) {
    throw new PlatformError(500, "download_artifacts_missing", "Download artifacts are missing.");
  }

  return {
    cached,
    inlineUrl: `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(artifacts.inline.storagePath)}?alt=media&token=${encodeURIComponent(artifacts.inline.downloadToken)}`,
    downloadUrl: `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(artifacts.download.storagePath)}?alt=media&token=${encodeURIComponent(artifacts.download.downloadToken)}`,
    expiresAtMs: artifacts.inline.expiresAt.getTime(),
  };
}

export async function getMotrendPreparedDownloadResponse(
  app: FastifyInstance,
  input: {
    accountId: string;
    userId: string;
    jobId: string;
  },
) {
  const artifacts = await getActiveMotrendDownloadArtifacts(app.prisma, input);
  if (!artifacts) {
    return null;
  }

  return buildArtifactUrls(app.firebase.bucketName, artifacts, true);
}

export async function requestMotrendDownloadPreparation(
  app: FastifyInstance,
  input: {
    accountId: string;
    userId: string;
    jobId: string;
  },
) {
  const job = await getOwnedMotrendJob(app.prisma, input);

  if (job.status !== "DONE") {
    throw new PlatformError(409, "job_not_ready", "Trend is not ready yet.");
  }

  if (!job.providerOutputUrl) {
    throw new PlatformError(409, "download_source_missing", "Generated output is not available.");
  }

  if (job.selectionKind === "REFERENCE" && job.finalCostCredits == null) {
    const duration = await probeRemoteVideoDurationSeconds(job.providerOutputUrl);
    await reconcileReferenceJobBilling(app.prisma, {
      accountId: input.accountId,
      userId: input.userId,
      jobId: job.id,
      outputRawDurationSec: duration,
    });
  }

  const cached = await getMotrendPreparedDownloadResponse(app, input);
  if (cached) {
    return {
      state: "ready" as const,
      response: cached,
    };
  }

  const downloadPrepare = readDownloadPrepareState(job.metadataJson);
  const nowMs = Date.now();
  const isActivePending = (
    downloadPrepare.status === "pending" ||
    downloadPrepare.status === "processing"
  ) && downloadPrepare.requestedAtMs != null &&
    nowMs - downloadPrepare.requestedAtMs < DOWNLOAD_PREPARE_STALE_MS;

  if (isActivePending) {
    return {
      state: "pending" as const,
      response: {
        pending: true,
        retryAfterMs: DOWNLOAD_PREPARE_RETRY_MS,
      },
    };
  }

  await setDownloadPrepareState(app, job.id, {
    status: "pending",
    requestedAtMs: nowMs,
    lastError: null,
  });

  return {
    state: "dispatch" as const,
    response: {
      pending: true,
      retryAfterMs: DOWNLOAD_PREPARE_RETRY_MS,
    },
  };
}

export async function runMotrendDownloadPreparation(
  app: FastifyInstance,
  input: {jobId: string},
) {
  const job = await app.prisma.moTrendJob.findUnique({
    where: {id: input.jobId},
    include: {
      user: true,
      downloadArtifacts: true,
    },
  });
  if (!job) {
    throw new PlatformError(404, "job_not_found", "Job was not found.");
  }

  if (job.status !== "DONE") {
    throw new PlatformError(409, "job_not_ready", "Trend is not ready yet.");
  }

  if (!job.providerOutputUrl) {
    throw new PlatformError(409, "download_source_missing", "Generated output is not available.");
  }

  const cached = await getMotrendPreparedDownloadResponse(app, {
    accountId: job.accountId,
    userId: job.userId,
    jobId: job.id,
  });
  if (cached) {
    await setDownloadPrepareState(app, job.id, {
      status: "ready",
      requestedAtMs: Date.now(),
      lastError: null,
    });
    return cached;
  }

  await setDownloadPrepareState(app, job.id, {
    status: "processing",
    requestedAtMs: Date.now(),
    lastError: null,
  });

  try {
    if (job.selectionKind === "REFERENCE" && job.finalCostCredits == null) {
      const duration = await probeRemoteVideoDurationSeconds(job.providerOutputUrl);
      await reconcileReferenceJobBilling(app.prisma, {
        accountId: job.accountId,
        userId: job.userId,
        jobId: job.id,
        outputRawDurationSec: duration,
      });
    }

    const prepared = await prepareDownloadArtifacts({
      bucket: app.firebase.bucket,
      bucketName: app.firebase.bucketName,
      sourceUrl: job.providerOutputUrl,
      uidSegment: job.user.firebaseUid,
      jobId: job.id,
      fileName: `${job.id}.mp4`,
    });

    await upsertMotrendDownloadArtifacts(app.prisma, {
      accountId: job.accountId,
      userId: job.userId,
      jobId: job.id,
      inlineArtifact: {
        storagePath: prepared.inline.storagePath,
        downloadToken: prepared.inline.downloadToken,
        fileName: prepared.inline.fileName,
        contentType: prepared.inline.contentType,
        sizeBytes: prepared.inline.sizeBytes,
        expiresAt: prepared.inline.expiresAt,
      },
      downloadArtifact: {
        storagePath: prepared.download.storagePath,
        downloadToken: prepared.download.downloadToken,
        fileName: prepared.download.fileName,
        contentType: prepared.download.contentType,
        sizeBytes: prepared.download.sizeBytes,
        expiresAt: prepared.download.expiresAt,
      },
    });

    await setDownloadPrepareState(app, job.id, {
      status: "ready",
      requestedAtMs: Date.now(),
      lastError: null,
    });

    return {
      cached: false,
      inlineUrl: prepared.inline.downloadUrl,
      downloadUrl: prepared.download.downloadUrl,
      expiresAtMs: prepared.inline.expiresAt.getTime(),
    };
  } catch (error) {
    const lastError = error instanceof Error ?
      error.message :
      "Download preparation failed.";
    await setDownloadPrepareState(app, job.id, {
      status: "failed",
      requestedAtMs: Date.now(),
      lastError,
    });
    throw error;
  }
}
