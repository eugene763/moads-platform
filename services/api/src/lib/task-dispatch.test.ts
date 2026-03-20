import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {MotrendTaskType} from "@moads/db";

const cloudTasksMocks = vi.hoisted(() => {
  const createTaskMock = vi.fn(async () => [{name: "task-123"}]);
  const queuePathMock = vi.fn((projectId: string, location: string, queueId: string) =>
    `projects/${projectId}/locations/${location}/queues/${queueId}`);
  const client = {
    createTask: createTaskMock,
    queuePath: queuePathMock,
  };
  const CloudTasksClientMock = vi.fn(() => ({
    createTask: client.createTask,
    queuePath: client.queuePath,
  }));

  return {
    createTaskMock,
    queuePathMock,
    CloudTasksClientMock,
  };
});

vi.mock("@google-cloud/tasks", () => ({
  CloudTasksClient: cloudTasksMocks.CloudTasksClientMock,
  protos: {
    google: {
      cloud: {
        tasks: {
          v2: {
            HttpMethod: {
              POST: "POST",
            },
          },
        },
      },
    },
  },
}));

import {
  dispatchMotrendDownloadPrepare,
  dispatchMotrendTaskKick,
  resetCloudTasksClientForTest,
} from "./task-dispatch.js";

function buildApp(taskDispatchMode: "cloud-tasks" | "internal-http" | "manual" = "cloud-tasks") {
  return {
    config: {
      apiBaseUrl: "https://api-dev.moads.agency",
      internalApiKey: "internal-key",
      cloudTasksProjectId: "gen-lang-client-0651837818",
      cloudTasksLocation: "us-central1",
      cloudTasksMotrendSubmitQueue: "motrend-submit",
      cloudTasksMotrendPollQueue: "motrend-poll",
      cloudTasksMotrendDownloadQueue: "motrend-download",
      cloudTasksInvokerServiceAccountEmail: "399776789069-compute@developer.gserviceaccount.com",
      taskDispatchMode,
      taskDispatchTimeoutMs: 5000,
    },
  };
}

describe("dispatchMotrendTaskKick", () => {
  beforeEach(() => {
    resetCloudTasksClientForTest();
    cloudTasksMocks.createTaskMock.mockClear();
    cloudTasksMocks.queuePathMock.mockClear();
    cloudTasksMocks.CloudTasksClientMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches submit tasks into the submit queue with OIDC", async () => {
    const result = await dispatchMotrendTaskKick(buildApp() as never, {
      taskType: MotrendTaskType.SUBMIT,
      limit: 1,
    });

    expect(result).toMatchObject({
      dispatched: true,
      mode: "cloud-tasks",
      taskName: "task-123",
    });
    expect(cloudTasksMocks.queuePathMock).toHaveBeenCalledWith(
      "gen-lang-client-0651837818",
      "us-central1",
      "motrend-submit",
    );
    expect(cloudTasksMocks.createTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      parent: "projects/gen-lang-client-0651837818/locations/us-central1/queues/motrend-submit",
      task: expect.objectContaining({
        httpRequest: expect.objectContaining({
          url: "https://api-dev.moads.agency/internal/motrend/tasks/run-due",
          oidcToken: {
            serviceAccountEmail: "399776789069-compute@developer.gserviceaccount.com",
            audience: "https://api-dev.moads.agency",
          },
        }),
      }),
    }));
  });

  it("dispatches poll tasks into the poll queue", async () => {
    await dispatchMotrendTaskKick(buildApp() as never, {
      taskType: MotrendTaskType.POLL,
      limit: 1,
    });

    expect(cloudTasksMocks.queuePathMock).toHaveBeenCalledWith(
      "gen-lang-client-0651837818",
      "us-central1",
      "motrend-poll",
    );
  });

  it("rejects cloud tasks dispatch without a task type", async () => {
    await expect(dispatchMotrendTaskKick(buildApp() as never, {
      limit: 1,
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "dispatch_task_type_required",
    });
  });

  it("dispatches download preparation into the download queue", async () => {
    const result = await dispatchMotrendDownloadPrepare(buildApp() as never, {
      jobId: "job_123",
    });

    expect(result).toMatchObject({
      dispatched: true,
      mode: "cloud-tasks",
      taskName: "task-123",
    });
    expect(cloudTasksMocks.queuePathMock).toHaveBeenCalledWith(
      "gen-lang-client-0651837818",
      "us-central1",
      "motrend-download",
    );
    expect(cloudTasksMocks.createTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      parent: "projects/gen-lang-client-0651837818/locations/us-central1/queues/motrend-download",
      task: expect.objectContaining({
        httpRequest: expect.objectContaining({
          url: "https://api-dev.moads.agency/internal/motrend/jobs/job_123/prepare-download",
          oidcToken: {
            serviceAccountEmail: "399776789069-compute@developer.gserviceaccount.com",
            audience: "https://api-dev.moads.agency",
          },
        }),
      }),
    }));
    const createTaskCalls = cloudTasksMocks.createTaskMock.mock.calls as unknown as Array<[unknown]>;
    const createTaskArgs = createTaskCalls.at(-1)?.[0] as {
      task?: {
        httpRequest?: {
          headers?: Record<string, string>;
        };
      };
    } | undefined;
    expect(createTaskArgs?.task?.httpRequest?.headers).toBeUndefined();
  });
});
