import {CloudTasksClient, protos} from "@google-cloud/tasks";
import {MotrendTaskType, PlatformError} from "@moads/db";
import {FastifyInstance} from "fastify";

let cloudTasksClientSingleton: CloudTasksClient | undefined;

function getCloudTasksClient(): CloudTasksClient {
  if (!cloudTasksClientSingleton) {
    cloudTasksClientSingleton = new CloudTasksClient();
  }

  return cloudTasksClientSingleton;
}

export function resetCloudTasksClientForTest() {
  cloudTasksClientSingleton = undefined;
}

function buildInternalUrl(baseUrl: string, pathname: string): string {
  return new URL(pathname, baseUrl).toString();
}

function buildKickPayload(input: {
  limit?: number;
  taskType?: MotrendTaskType;
}) {
  return {
    limit: Math.max(1, Math.min(input.limit ?? 1, 10)),
    ...(input.taskType ? {
      taskType: input.taskType === MotrendTaskType.SUBMIT ? "submit" : "poll",
    } : {}),
  };
}

async function dispatchViaInternalHttp(
  app: FastifyInstance,
  payload: ReturnType<typeof buildKickPayload>,
) {
  const apiBaseUrl = app.config.apiBaseUrl;
  const internalApiKey = app.config.internalApiKey;
  if (!apiBaseUrl || !internalApiKey) {
    throw new PlatformError(503, "dispatch_unconfigured", "Internal HTTP dispatch is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), app.config.taskDispatchTimeoutMs);

  try {
    const response = await fetch(buildInternalUrl(apiBaseUrl, "/internal/motrend/tasks/run-due"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-moads-internal-key": internalApiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new PlatformError(
        502,
        "dispatch_http_failed",
        `Internal dispatch returned ${response.status}.`,
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function dispatchViaCloudTasks(
  app: FastifyInstance,
  payload: ReturnType<typeof buildKickPayload>,
  taskType: MotrendTaskType,
) {
  const apiBaseUrl = app.config.apiBaseUrl;
  const projectId = app.config.cloudTasksProjectId;
  const location = app.config.cloudTasksLocation;
  const queue = taskType === MotrendTaskType.SUBMIT ?
    app.config.cloudTasksMotrendSubmitQueue :
    app.config.cloudTasksMotrendPollQueue;
  const serviceAccountEmail = app.config.cloudTasksInvokerServiceAccountEmail;

  if (!apiBaseUrl || !projectId || !location || !queue || !serviceAccountEmail) {
    throw new PlatformError(503, "dispatch_unconfigured", "Cloud Tasks dispatch is not configured.");
  }

  const client = getCloudTasksClient();
  const parent = client.queuePath(projectId, location, queue);
  const [task] = await client.createTask({
    parent,
    task: {
      httpRequest: {
        httpMethod: protos.google.cloud.tasks.v2.HttpMethod.POST,
        url: buildInternalUrl(apiBaseUrl, "/internal/motrend/tasks/run-due"),
        headers: {
          "Content-Type": "application/json",
        },
        body: Buffer.from(JSON.stringify(payload)).toString("base64"),
        oidcToken: {
          serviceAccountEmail,
          audience: apiBaseUrl,
        },
      },
    },
  });

  return task.name ?? null;
}

export async function dispatchMotrendTaskKick(
  app: FastifyInstance,
  input: {
    limit?: number;
    taskType?: MotrendTaskType;
  } = {},
) {
  const payload = buildKickPayload(input);

  if (app.config.taskDispatchMode === "manual") {
    return {
      dispatched: false,
      mode: "manual" as const,
    };
  }

  if (app.config.taskDispatchMode === "internal-http") {
    await dispatchViaInternalHttp(app, payload);
    return {
      dispatched: true,
      mode: "internal-http" as const,
    };
  }

  if (!input.taskType) {
    throw new PlatformError(
      500,
      "dispatch_task_type_required",
      "Cloud Tasks dispatch requires a concrete taskType.",
    );
  }

  const taskName = await dispatchViaCloudTasks(app, payload, input.taskType);
  return {
    dispatched: true,
    mode: "cloud-tasks" as const,
    taskName,
  };
}
