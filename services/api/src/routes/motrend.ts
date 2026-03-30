import {FastifyInstance} from "fastify";

import {
  finalizePreparedMotrendJob,
  getMotrendProfile,
  listActiveMotrendTemplates,
  listMotrendJobs,
  MotrendTaskType,
  requestMotrendJobRefresh,
  PlatformError,
  prepareMotrendJob,
} from "@moads/db";

import {requireProductMembership} from "../middleware/access.js";
import {requireAuth, resolveAccount} from "../middleware/auth.js";
import {
  assertUploadedPhotoIsValid,
  assertUploadedReferenceVideoIsValid,
  ensureStorageDownloadUrl,
  storageObjectExists,
} from "../lib/media.js";
import {
  DOWNLOAD_PREPARE_RETRY_MS,
  getMotrendPreparedDownloadResponse,
  markMotrendDownloadPreparationFailed,
  requestMotrendDownloadPreparation,
  runMotrendDownloadPreparation,
} from "../lib/motrend-downloads.js";
import {hasCurrentAdminClaim} from "../middleware/admin.js";
import {
  dispatchMotrendDownloadPrepare,
  dispatchMotrendTaskKick,
} from "../lib/task-dispatch.js";

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
    const isAdmin = await hasCurrentAdminClaim(request);

    reply.send({
      ...profile,
      isAdmin,
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

    let dispatchDeferred = false;
    try {
      const dispatchResult = await dispatchMotrendTaskKick(app, {
        taskType: MotrendTaskType.SUBMIT,
        limit: 1,
      });
      dispatchDeferred = dispatchResult.dispatched !== true;
    } catch (error) {
      dispatchDeferred = true;
      request.log.warn({err: error, jobId: body.jobId}, "motrend submit dispatch failed");
    }

    reply.send({
      ...finalized,
      status: normalizeJobStatus(finalized.status),
      dispatchDeferred,
      retryAfterMs: dispatchDeferred ? 2_000 : null,
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

    const latest = refresh.job;

    let dispatchDeferred = false;
    if (refresh.queuedForRefresh) {
      try {
        const dispatchResult = await dispatchMotrendTaskKick(app, {
          taskType: refresh.dispatchTaskType ?? MotrendTaskType.POLL,
          limit: 1,
        });
        dispatchDeferred = dispatchResult.dispatched !== true;
      } catch (error) {
        dispatchDeferred = true;
        request.log.warn({err: error, jobId: params.id}, "motrend poll dispatch failed");
      }
    }

    reply.send({
      jobId: latest.id,
      status: normalizeJobStatus(latest.status),
      providerState: latest.providerState,
      providerOutputUrl: latest.providerOutputUrl,
      queuedForRefresh: refresh.queuedForRefresh,
      retryAfterMs: refresh.retryAfterMs,
      dispatchDeferred,
    });
  });

  app.post("/motrend/jobs/:id/prepare-download", {preHandler: authGuards}, async (request, reply) => {
    if (!request.accountContext || !request.authContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const params = request.params as {id?: string};
    if (typeof params.id !== "string" || !params.id.trim()) {
      throw new PlatformError(400, "job_id_required", "job id is required.");
    }

    const jobId = params.id.trim();
    const requested = await requestMotrendDownloadPreparation(app, {
      accountId: request.accountContext.accountId,
      userId: request.authContext.userId,
      jobId,
    });

    if (requested.state === "ready") {
      reply.send(requested.response);
      return;
    }

    if (requested.state === "pending") {
      reply.send(requested.response);
      return;
    }

    try {
      const dispatchResult = await dispatchMotrendDownloadPrepare(app, {
        jobId,
      });

      if (dispatchResult.dispatched === false) {
        const prepared = await runMotrendDownloadPreparation(app, {jobId});
        reply.send(prepared);
        return;
      }

      reply.send(requested.response);
    } catch (error) {
      request.log.warn({err: error, jobId}, "motrend download prepare dispatch failed");
      await markMotrendDownloadPreparationFailed(
        app,
        jobId,
        error instanceof Error ? error.message : "Download preparation dispatch failed."
      );
      reply.send({
        pending: true,
        retryAfterMs: DOWNLOAD_PREPARE_RETRY_MS,
        dispatchDeferred: true,
      });
    }
  });
}
