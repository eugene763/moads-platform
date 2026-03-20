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
  pathname: string,
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
    const response = await fetch(buildInternalUrl(apiBaseUrl, pathname), {
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

async function dispatchJsonViaInternalHttp(
  app: FastifyInstance,
  pathname: string,
  payload: Record<string, unknown> | undefined,
) {
  const apiBaseUrl = app.config.apiBaseUrl;
  const internalApiKey = app.config.internalApiKey;
  if (!apiBaseUrl || !internalApiKey) {
    throw new PlatformError(503, "dispatch_unconfigured", "Internal HTTP dispatch is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), app.config.taskDispatchTimeoutMs);
  const headers: Record<string, string> = {
    "x-moads-internal-key": internalApiKey,
  };
  if (payload) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const response = await fetch(buildInternalUrl(apiBaseUrl, pathname), {
      method: "POST",
      headers,
      ...(payload ? {body: JSON.stringify(payload)} : {}),
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
  input: {
    pathname: string;
    payload?: Record<string, unknown>;
    queue: string;
  },
) {
  const apiBaseUrl = app.config.apiBaseUrl;
  const projectId = app.config.cloudTasksProjectId;
  const location = app.config.cloudTasksLocation;
  const serviceAccountEmail = app.config.cloudTasksInvokerServiceAccountEmail;

  if (!apiBaseUrl || !projectId || !location || !input.queue || !serviceAccountEmail) {
    throw new PlatformError(503, "dispatch_unconfigured", "Cloud Tasks dispatch is not configured.");
  }

  const client = getCloudTasksClient();
  const parent = client.queuePath(projectId, location, input.queue);
  const headers: Record<string, string> = {};
  if (input.payload) {
    headers["Content-Type"] = "application/json";
  }
  const [task] = await client.createTask({
    parent,
    task: {
      httpRequest: {
        httpMethod: protos.google.cloud.tasks.v2.HttpMethod.POST,
        url: buildInternalUrl(apiBaseUrl, input.pathname),
        ...(Object.keys(headers).length > 0 ? {headers} : {}),
        ...(input.payload ? {
          body: Buffer.from(JSON.stringify(input.payload)).toString("base64"),
        } : {}),
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
    await dispatchViaInternalHttp(app, "/internal/motrend/tasks/run-due", payload);
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

  const queue = input.taskType === MotrendTaskType.SUBMIT ?
    app.config.cloudTasksMotrendSubmitQueue :
    app.config.cloudTasksMotrendPollQueue;
  const taskName = await dispatchViaCloudTasks(app, {
    pathname: "/internal/motrend/tasks/run-due",
    payload,
    queue: queue ?? "",
  });
  return {
    dispatched: true,
    mode: "cloud-tasks" as const,
    taskName,
  };
}

export async function dispatchMotrendDownloadPrepare(
  app: FastifyInstance,
  input: {
    jobId: string;
  },
) {
  if (app.config.taskDispatchMode === "manual") {
    return {
      dispatched: false,
      mode: "manual" as const,
    };
  }

  const pathname = `/internal/motrend/jobs/${encodeURIComponent(input.jobId)}/prepare-download`;
  if (app.config.taskDispatchMode === "internal-http") {
    await dispatchJsonViaInternalHttp(app, pathname, undefined);
    return {
      dispatched: true,
      mode: "internal-http" as const,
    };
  }

  const taskName = await dispatchViaCloudTasks(app, {
    pathname,
    queue: app.config.cloudTasksMotrendPollQueue ?? "",
  });
  return {
    dispatched: true,
    mode: "cloud-tasks" as const,
    taskName,
  };
}
