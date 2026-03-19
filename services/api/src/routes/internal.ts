import {simulateMotrendProviderResult, MotrendTaskType, PlatformError, sweepStaleMotrendJobs} from "@moads/db";
import {FastifyInstance} from "fastify";

import {cleanupExpiredMotrendDownloads} from "../lib/motrend-download-cleanup.js";
import {processDueMotrendTasks} from "../lib/motrend-task-runner.js";
import {requireInternalAccess} from "../middleware/internal.js";

function parseTaskType(value: unknown): MotrendTaskType | undefined {
  if (value === "submit") {
    return MotrendTaskType.SUBMIT;
  }

  if (value === "poll") {
    return MotrendTaskType.POLL;
  }

  return undefined;
}

export async function registerInternalRoutes(app: FastifyInstance): Promise<void> {
  app.post("/internal/motrend/tasks/run-due", {
    preHandler: [requireInternalAccess],
  }, async (request, reply) => {
    const body = request.body as {
      limit?: unknown;
      taskType?: unknown;
    } | undefined;

    const limit = typeof body?.limit === "number" && Number.isFinite(body.limit) ?
      Math.floor(body.limit) :
      10;
    const taskType = parseTaskType(body?.taskType);

    const result = await processDueMotrendTasks(app, {
      limit,
      ...(taskType ? {taskType} : {}),
    });

    reply.send(result);
  });

  app.post("/internal/motrend/jobs/:id/simulate-provider-result", {
    preHandler: [requireInternalAccess],
  }, async (request, reply) => {
    if (app.config.runtimeProfile === "prod") {
      throw new PlatformError(
        403,
        "simulation_forbidden",
        "Provider simulation is disabled in production.",
      );
    }

    const params = request.params as {id?: string};
    if (typeof params.id !== "string" || !params.id.trim()) {
      throw new PlatformError(400, "job_id_required", "job id is required.");
    }

    const body = request.body as {
      state?: unknown;
      outputUrl?: unknown;
      watermarkUrl?: unknown;
      error?: unknown;
    } | undefined;

    const state = body?.state === "failed" ? "failed" : body?.state === "succeed" ? "succeed" : null;
    if (!state) {
      throw new PlatformError(400, "state_required", "state must be 'succeed' or 'failed'.");
    }

    const job = await simulateMotrendProviderResult(app.prisma, {
      jobId: params.id.trim(),
      state,
      outputUrl: typeof body?.outputUrl === "string" ? body.outputUrl.trim() || null : null,
      watermarkUrl: typeof body?.watermarkUrl === "string" ? body.watermarkUrl.trim() || null : null,
      error: typeof body?.error === "string" ? body.error.trim() || null : null,
    });

    reply.send({
      jobId: job.id,
      status: job.status.toLowerCase(),
      providerState: job.providerState,
      providerOutputUrl: job.providerOutputUrl,
      providerWatermarkUrl: job.providerWatermarkUrl,
    });
  });

  app.post("/internal/motrend/jobs/run-sweep", {
    preHandler: [requireInternalAccess],
  }, async (request, reply) => {
    const body = request.body as {
      limitPerBucket?: unknown;
    } | undefined;

    const limitPerBucket = typeof body?.limitPerBucket === "number" && Number.isFinite(body.limitPerBucket) ?
      Math.floor(body.limitPerBucket) :
      100;

    const result = await sweepStaleMotrendJobs(app.prisma, {
      limitPerBucket,
    });

    reply.send(result);
  });

  app.post("/internal/motrend/downloads/run-cleanup", {
    preHandler: [requireInternalAccess],
  }, async (request, reply) => {
    const body = request.body as {
      limit?: unknown;
    } | undefined;

    const limit = typeof body?.limit === "number" && Number.isFinite(body.limit) ?
      Math.floor(body.limit) :
      200;

    const result = await cleanupExpiredMotrendDownloads(app, {
      limit,
    });

    reply.send(result);
  });
}
