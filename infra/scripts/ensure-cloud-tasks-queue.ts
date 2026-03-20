import {CloudTasksClient} from "@google-cloud/tasks";

import {loadConfig} from "../../services/api/src/config.js";

const DEFAULT_RETRY_CONFIG = {
  maxAttempts: 5,
  minBackoff: {
    seconds: 5,
  },
  maxBackoff: {
    seconds: 300,
  },
  maxDoublings: 5,
} as const;

const UPDATE_MASK_PATHS = [
  "rate_limits.max_dispatches_per_second",
  "rate_limits.max_concurrent_dispatches",
  "retry_config.max_attempts",
  "retry_config.min_backoff",
  "retry_config.max_backoff",
  "retry_config.max_doublings",
] as const;

function readErrorCode(error: unknown): number | null {
  return typeof error === "object" && error && "code" in error ?
    Number((error as {code?: unknown}).code) :
    null;
}

async function ensureQueue(
  client: CloudTasksClient,
  input: {
    projectId: string;
    location: string;
    queueId: string;
    maxDispatchesPerSecond: number;
    maxConcurrentDispatches: number;
  },
) {
  const parent = client.locationPath(input.projectId, input.location);
  const name = client.queuePath(input.projectId, input.location, input.queueId);
  const queue = {
    name,
    rateLimits: {
      maxDispatchesPerSecond: input.maxDispatchesPerSecond,
      maxConcurrentDispatches: input.maxConcurrentDispatches,
    },
    retryConfig: DEFAULT_RETRY_CONFIG,
  };

  try {
    await client.getQueue({name});
  } catch (error) {
    if (readErrorCode(error) !== 5) {
      throw error;
    }

    try {
      await client.createQueue({
        parent,
        queue,
        queueId: input.queueId,
      });

      return {
        action: "created" as const,
        queue: name,
        rateLimits: queue.rateLimits,
        retryConfig: queue.retryConfig,
      };
    } catch (createError) {
      if (readErrorCode(createError) !== 6) {
        throw createError;
      }
    }
  }

  await client.updateQueue({
    queue,
    updateMask: {
      paths: [...UPDATE_MASK_PATHS],
    },
  });

  return {
    action: "updated" as const,
    queue: name,
    rateLimits: queue.rateLimits,
    retryConfig: queue.retryConfig,
  };
}

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  if (config.runtimeProfile === "local") {
    throw new Error("Cloud Tasks bootstrap is cloud-only. Use dev-cloud or prod env files.");
  }

  if (
    !config.cloudTasksProjectId ||
    !config.cloudTasksLocation ||
    !config.cloudTasksMotrendSubmitQueue ||
    !config.cloudTasksMotrendPollQueue ||
    !config.cloudTasksMotrendDownloadQueue
  ) {
    throw new Error(
      "CLOUD_TASKS_PROJECT_ID, CLOUD_TASKS_LOCATION, CLOUD_TASKS_MOTREND_SUBMIT_QUEUE, CLOUD_TASKS_MOTREND_POLL_QUEUE, and CLOUD_TASKS_MOTREND_DOWNLOAD_QUEUE are required.",
    );
  }

  const client = new CloudTasksClient();
  const results = await Promise.all([
    ensureQueue(client, {
      projectId: config.cloudTasksProjectId,
      location: config.cloudTasksLocation,
      queueId: config.cloudTasksMotrendSubmitQueue,
      maxDispatchesPerSecond: 2,
      maxConcurrentDispatches: 2,
    }),
    ensureQueue(client, {
      projectId: config.cloudTasksProjectId,
      location: config.cloudTasksLocation,
      queueId: config.cloudTasksMotrendPollQueue,
      maxDispatchesPerSecond: 10,
      maxConcurrentDispatches: 10,
    }),
    ensureQueue(client, {
      projectId: config.cloudTasksProjectId,
      location: config.cloudTasksLocation,
      queueId: config.cloudTasksMotrendDownloadQueue,
      maxDispatchesPerSecond: 4,
      maxConcurrentDispatches: 4,
    }),
  ]);

  console.log(JSON.stringify({
    projectId: config.cloudTasksProjectId,
    location: config.cloudTasksLocation,
    queues: results,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
