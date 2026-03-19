import {
  claimNextMotrendJobTask,
  applyMotrendPollResult,
  failMotrendSubmitTaskAndJob,
  markMotrendTaskFailed,
  markMotrendSubmitTaskSucceeded,
  MotrendTaskType,
  PlatformError,
} from "@moads/db";
import {FastifyInstance} from "fastify";

import {pollMotrendProviderJob, submitMotrendProviderJob} from "./motrend-provider.js";

export interface ProcessDueMotrendTasksResult {
  processedCount: number;
  tasks: Array<{
    taskId: string;
    taskType: string;
    jobId: string;
    outcome: "processed" | "failed";
    jobStatus?: string;
    error?: string;
  }>;
}

function errorMessage(error: unknown): string {
  if (error instanceof PlatformError) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown task processing error.";
}

async function processSubmitTask(
  app: FastifyInstance,
  task: NonNullable<Awaited<ReturnType<typeof claimNextMotrendJobTask>>>,
) {
  const {job} = task;

  if (!job.inputImageUrl || !job.referenceVideoUrl) {
    throw new PlatformError(
      409,
      "provider_submit_inputs_missing",
      "Job is missing submit inputs for provider processing.",
    );
  }

  const submitted = await submitMotrendProviderJob(app.config, {
    jobId: job.id,
    inputImageUrl: job.inputImageUrl,
    referenceVideoUrl: job.referenceVideoUrl,
  });

  return await markMotrendSubmitTaskSucceeded(app.prisma, {
    taskId: task.id,
    providerTaskId: submitted.providerTaskId,
    providerState: submitted.providerState,
    nextPollDelayMs: submitted.nextPollDelayMs ?? null,
  });
}

async function processPollTask(
  app: FastifyInstance,
  task: NonNullable<Awaited<ReturnType<typeof claimNextMotrendJobTask>>>,
) {
  const {job} = task;

  if (!job.providerTaskId) {
    throw new PlatformError(
      409,
      "provider_task_missing",
      "Job is missing providerTaskId for polling.",
    );
  }

  const result = await pollMotrendProviderJob(app.config, {
    jobId: job.id,
    providerTaskId: job.providerTaskId,
  });

  return await applyMotrendPollResult(app.prisma, {
    taskId: task.id,
    state: result.state,
    outputUrl: result.outputUrl ?? null,
    watermarkUrl: result.watermarkUrl ?? null,
    error: result.error ?? null,
    nextPollDelayMs: result.nextPollDelayMs ?? null,
  });
}

async function processSingleMotrendTask(
  app: FastifyInstance,
  task: NonNullable<Awaited<ReturnType<typeof claimNextMotrendJobTask>>>,
) {
  try {
    if (task.taskType === MotrendTaskType.SUBMIT) {
      const job = await processSubmitTask(app, task);
      return {
        taskId: task.id,
        taskType: task.taskType,
        jobId: task.jobId,
        outcome: "processed" as const,
        jobStatus: job.status,
      };
    }

    const job = await processPollTask(app, task);
    return {
      taskId: task.id,
      taskType: task.taskType,
      jobId: task.jobId,
      outcome: "processed" as const,
      jobStatus: job.status,
    };
  } catch (error) {
    const message = errorMessage(error);

    if (task.taskType === MotrendTaskType.SUBMIT) {
      await failMotrendSubmitTaskAndJob(app.prisma, {
        taskId: task.id,
        errorMessage: message,
      });
    } else {
      await markMotrendTaskFailed(app.prisma, {
        taskId: task.id,
        errorMessage: message,
      });
    }

    return {
      taskId: task.id,
      taskType: task.taskType,
      jobId: task.jobId,
      outcome: "failed" as const,
      error: message,
    };
  }
}

export async function processDueMotrendTasks(
  app: FastifyInstance,
  input: {
    limit?: number;
    taskType?: MotrendTaskType;
  } = {},
): Promise<ProcessDueMotrendTasksResult> {
  const limit = Math.max(1, Math.min(input.limit ?? 10, 50));
  const results: ProcessDueMotrendTasksResult["tasks"] = [];

  for (let index = 0; index < limit; index += 1) {
    const task = await claimNextMotrendJobTask(app.prisma, {
      ...(input.taskType ? {taskType: input.taskType} : {}),
    });

    if (!task) {
      break;
    }

    results.push(await processSingleMotrendTask(app, task));
  }

  return {
    processedCount: results.length,
    tasks: results,
  };
}
