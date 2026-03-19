import {FastifyInstance} from "fastify";

import {
  finalizePreparedMotrendJob,
  getActiveMotrendDownloadArtifacts,
  getMotrendProfile,
  getOwnedMotrendJob,
  listActiveMotrendTemplates,
  listMotrendJobs,
  MotrendTaskType,
  requestMotrendJobRefresh,
  PlatformError,
  prepareMotrendJob,
  reconcileReferenceJobBilling,
  upsertMotrendDownloadArtifacts,
} from "@moads/db";

import {requireProductMembership} from "../middleware/access.js";
import {requireAuth, resolveAccount} from "../middleware/auth.js";
import {
  assertUploadedPhotoIsValid,
  assertUploadedReferenceVideoIsValid,
  ensureStorageDownloadUrl,
  prepareDownloadArtifacts,
  probeRemoteVideoDurationSeconds,
  storageObjectExists,
} from "../lib/media.js";
import {dispatchMotrendTaskKick} from "../lib/task-dispatch.js";

function normalizeJobStatus(status: string): string {
  return status.toLowerCase();
}

function normalizeSelectionKind(selectionKind: string): string {
  return selectionKind.toLowerCase();
}

export async function registerMotrendRoutes(app: FastifyInstance): Promise<void> {
  const authGuards = [requireAuth, resolveAccount, requireProductMembership("motrend")];

  app.get("/motrend/templates", async (_request, reply) => {
    const templates = await listActiveMotrendTemplates(app.prisma);
    reply.send({templates});
  });

  app.get("/motrend/me", {preHandler: authGuards}, async (request, reply) => {
    if (!request.accountContext || !request.authContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const profile = await getMotrendProfile(
      app.prisma,
      request.accountContext.accountId,
      request.authContext.userId,
    );

    reply.send({
      ...profile,
      isAdmin: request.authContext.claims.admin === true,
    });
  });

  app.get("/motrend/jobs", {preHandler: authGuards}, async (request, reply) => {
    if (!request.accountContext || !request.authContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const jobs = await listMotrendJobs(app.prisma, {
      accountId: request.accountContext.accountId,
      userId: request.authContext.userId,
      limit: 20,
    });

    reply.send({
      jobs: jobs.map((job) => ({
        ...job,
        status: normalizeJobStatus(job.status),
        selectionKind: normalizeSelectionKind(job.selectionKind),
      })),
    });
  });

  app.post("/motrend/jobs/prepare", {preHandler: authGuards}, async (request, reply) => {
    if (!request.accountContext || !request.authContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const body = request.body as {
      templateId?: unknown;
      selectionKind?: unknown;
      clientRequestId?: unknown;
    } | undefined;

    if (typeof body?.templateId !== "string" || !body.templateId.trim()) {
      throw new PlatformError(400, "template_id_required", "templateId is required.");
    }

    const prepared = await prepareMotrendJob(app.prisma, {
      accountId: request.accountContext.accountId,
      userId: request.authContext.userId,
      firebaseUid: request.authContext.firebaseUid,
      templateId: body.templateId.trim(),
      selectionKind: body.selectionKind === "reference" ? "reference" : "template",
      clientRequestId: typeof body.clientRequestId === "string" ? body.clientRequestId.trim() || null : null,
    });

    reply.send(prepared);
  });

  app.post("/motrend/jobs/finalize", {preHandler: authGuards}, async (request, reply) => {
    if (!request.accountContext || !request.authContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const body = request.body as {
      jobId?: unknown;
      inputImagePath?: unknown;
      referenceVideoPath?: unknown;
    } | undefined;

    if (typeof body?.jobId !== "string" || !body.jobId.trim()) {
      throw new PlatformError(400, "job_id_required", "jobId is required.");
    }
    if (typeof body?.inputImagePath !== "string" || !body.inputImagePath.trim()) {
      throw new PlatformError(400, "input_image_path_required", "inputImagePath is required.");
    }

    const inputImagePath = body.inputImagePath.trim();
    const referenceVideoPath = typeof body.referenceVideoPath === "string" ? body.referenceVideoPath.trim() || null : null;

    const photoExists = await storageObjectExists(app.firebase.bucket, inputImagePath);
    if (!photoExists) {
      throw new PlatformError(400, "input_image_missing", "Uploaded photo was not found.");
    }
    await assertUploadedPhotoIsValid(app.firebase.bucket, inputImagePath);
    const inputImageDownload = await ensureStorageDownloadUrl(app.firebase.bucket, app.firebase.bucketName, inputImagePath);

    let referenceVideoDownload:
      | {
          downloadUrl: string;
          downloadToken: string;
        }
      | null = null;
    let uploadedReferenceDurationSec: number | null = null;

    if (referenceVideoPath) {
      const referenceExists = await storageObjectExists(app.firebase.bucket, referenceVideoPath);
      if (!referenceExists) {
        throw new PlatformError(400, "reference_video_missing", "Uploaded reference video was not found.");
      }
      uploadedReferenceDurationSec = await assertUploadedReferenceVideoIsValid(app.firebase.bucket, referenceVideoPath);
      referenceVideoDownload = await ensureStorageDownloadUrl(app.firebase.bucket, app.firebase.bucketName, referenceVideoPath);
    }

    const finalized = await finalizePreparedMotrendJob(app.prisma, {
      accountId: request.accountContext.accountId,
      userId: request.authContext.userId,
      jobId: body.jobId.trim(),
      inputImagePath,
      inputImageUrl: inputImageDownload.downloadUrl,
      referenceVideoPath,
      referenceVideoUrl: referenceVideoDownload?.downloadUrl ?? null,
      uploadedReferenceDurationSec,
    });

    void dispatchMotrendTaskKick(app, {
      taskType: MotrendTaskType.SUBMIT,
      limit: 1,
    }).catch((error) => {
      request.log.warn({err: error, jobId: body.jobId}, "motrend submit dispatch failed");
    });

    reply.send({
      ...finalized,
      status: normalizeJobStatus(finalized.status),
    });
  });

  app.post("/motrend/jobs/:id/refresh", {preHandler: authGuards}, async (request, reply) => {
    if (!request.accountContext || !request.authContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const params = request.params as {id?: string};
    if (typeof params.id !== "string" || !params.id.trim()) {
      throw new PlatformError(400, "job_id_required", "job id is required.");
    }

    const refresh = await requestMotrendJobRefresh(app.prisma, {
      accountId: request.accountContext.accountId,
      userId: request.authContext.userId,
      jobId: params.id.trim(),
    });

    let latest = refresh.job;
    if (
      latest.status === "DONE" &&
      latest.selectionKind === "REFERENCE" &&
      latest.providerOutputUrl &&
      latest.finalCostCredits == null
    ) {
      const duration = await probeRemoteVideoDurationSeconds(latest.providerOutputUrl);
      await reconcileReferenceJobBilling(app.prisma, {
        accountId: request.accountContext.accountId,
        userId: request.authContext.userId,
        jobId: latest.id,
        outputRawDurationSec: duration,
      });
      latest = await getOwnedMotrendJob(app.prisma, {
        accountId: request.accountContext.accountId,
        userId: request.authContext.userId,
        jobId: latest.id,
      });
    }

    reply.send({
      jobId: latest.id,
      status: normalizeJobStatus(latest.status),
      providerState: latest.providerState,
      providerOutputUrl: latest.providerOutputUrl,
      queuedForRefresh: refresh.queuedForRefresh,
      retryAfterMs: refresh.retryAfterMs,
    });

    if (refresh.queuedForRefresh) {
      void dispatchMotrendTaskKick(app, {
        taskType: MotrendTaskType.POLL,
        limit: 1,
      }).catch((error) => {
        request.log.warn({err: error, jobId: params.id}, "motrend poll dispatch failed");
      });
    }
  });

  app.post("/motrend/jobs/:id/prepare-download", {preHandler: authGuards}, async (request, reply) => {
    if (!request.accountContext || !request.authContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const params = request.params as {id?: string};
    if (typeof params.id !== "string" || !params.id.trim()) {
      throw new PlatformError(400, "job_id_required", "job id is required.");
    }

    const job = await getOwnedMotrendJob(app.prisma, {
      accountId: request.accountContext.accountId,
      userId: request.authContext.userId,
      jobId: params.id.trim(),
    });

    if (job.status !== "DONE") {
      throw new PlatformError(409, "job_not_ready", "Trend is not ready yet.");
    }

    if (!job.providerOutputUrl) {
      throw new PlatformError(409, "download_source_missing", "Generated output is not available.");
    }

    if (
      job.selectionKind === "REFERENCE" &&
      job.finalCostCredits == null
    ) {
      const duration = await probeRemoteVideoDurationSeconds(job.providerOutputUrl);
      await reconcileReferenceJobBilling(app.prisma, {
        accountId: request.accountContext.accountId,
        userId: request.authContext.userId,
        jobId: job.id,
        outputRawDurationSec: duration,
      });
    }

    const cachedArtifacts = await getActiveMotrendDownloadArtifacts(app.prisma, {
      accountId: request.accountContext.accountId,
      userId: request.authContext.userId,
      jobId: job.id,
    });

    if (cachedArtifacts) {
      reply.send({
        cached: true,
        inlineUrl: `https://firebasestorage.googleapis.com/v0/b/${app.firebase.bucketName}/o/${encodeURIComponent(cachedArtifacts.inline.storagePath)}?alt=media&token=${encodeURIComponent(cachedArtifacts.inline.downloadToken)}`,
        downloadUrl: `https://firebasestorage.googleapis.com/v0/b/${app.firebase.bucketName}/o/${encodeURIComponent(cachedArtifacts.download.storagePath)}?alt=media&token=${encodeURIComponent(cachedArtifacts.download.downloadToken)}`,
        expiresAtMs: cachedArtifacts.inline.expiresAt.getTime(),
      });
      return;
    }

    const prepared = await prepareDownloadArtifacts({
      bucket: app.firebase.bucket,
      bucketName: app.firebase.bucketName,
      sourceUrl: job.providerOutputUrl,
      uidSegment: request.authContext.firebaseUid,
      jobId: job.id,
      fileName: `${job.id}.mp4`,
    });

    await upsertMotrendDownloadArtifacts(app.prisma, {
      accountId: request.accountContext.accountId,
      userId: request.authContext.userId,
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

    reply.send({
      cached: false,
      inlineUrl: prepared.inline.downloadUrl,
      downloadUrl: prepared.download.downloadUrl,
      expiresAtMs: prepared.inline.expiresAt.getTime(),
    });
  });
}
