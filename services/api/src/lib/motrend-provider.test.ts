import {afterEach, describe, expect, it, vi} from "vitest";

import type {ApiConfig, MotrendProviderMode} from "../types.js";
import {pollMotrendProviderJob, submitMotrendProviderJob} from "./motrend-provider.js";

function baseConfig(motrendProviderMode: MotrendProviderMode): ApiConfig {
  return {
    runtimeProfile: "dev-cloud",
    nodeEnv: "production",
    port: 8080,
    databaseUrl: "postgresql://moads_dev:moads_dev@10.0.0.15:5432/moads_dev?schema=public",
    sessionCookieName: "moads_session_dev",
    sessionCookieDomain: ".moads.agency",
    sessionCookieMaxAgeMs: 432000000,
    sessionCookieSecret: "session-secret",
    apiBaseUrl: "https://api-dev.moads.agency",
    defaultDevProductCode: "motrend",
    allowedOrigins: ["https://trend.moads.agency"],
    firebaseProjectId: "gen-lang-client-0651837818",
    firebaseStorageBucket: "gen-lang-client-0651837818.firebasestorage.app",
    firebaseUseEmulators: false,
    taskDispatchMode: "manual",
    taskDispatchTimeoutMs: 5000,
    cloudTasksProjectId: "gen-lang-client-0651837818",
    cloudTasksLocation: "us-central1",
    cloudTasksMotrendSubmitQueue: "motrend-submit",
    cloudTasksMotrendPollQueue: "motrend-poll",
    cloudTasksInvokerServiceAccountEmail: "399776789069-compute@developer.gserviceaccount.com",
    motrendProviderMode,
    motrendProviderPollDelayMs: 2000,
    klingAccessKey: "kling-access",
    klingSecretKey: "kling-secret",
    klingBaseUrl: "https://api-singapore.klingai.com",
    klingHttpTimeoutMs: 20_000,
    aeoPublicScanRateLimitPerHour: 20,
    aeoPublicScanCacheTtlMs: 86_400_000,
    aeoAiTipsMode: "mock",
    aeoGa4Mode: "mock",
    aeoRealtimeMode: "mock",
    aeoRealtimeIntervalMs: 5_000,
    aeoAiTipsModel: "gpt-5-mini",
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("submitMotrendProviderJob", () => {
  it("returns a manual placeholder in manual mode", async () => {
    const result = await submitMotrendProviderJob(baseConfig("manual"), {
      jobId: "job-1",
      inputImageUrl: "https://storage.example.com/input.jpg",
      referenceVideoUrl: "https://storage.example.com/ref.mp4",
    });

    expect(result).toEqual({
      providerTaskId: "manual:job-1",
      providerState: "processing",
      nextPollDelayMs: null,
    });
  });

  it("posts the expected payload in kling mode", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      code: 0,
      data: {
        task_id: "kling-task-123",
      },
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitMotrendProviderJob(baseConfig("kling"), {
      jobId: "job-1",
      inputImageUrl: "https://storage.example.com/input.jpg",
      referenceVideoUrl: "https://storage.example.com/ref.mp4",
    });

    expect(result).toEqual({
      providerTaskId: "kling-task-123",
      providerState: "processing",
      nextPollDelayMs: 2000,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit | undefined]>;
    const firstCall = calls[0];
    expect(firstCall).toBeDefined();
    const url = firstCall?.[0];
    const init = firstCall?.[1];
    expect(url).toBe("https://api-singapore.klingai.com/v1/videos/motion-control");
    expect(init).toBeDefined();
    expect(init).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        "Content-Type": "application/json",
        Authorization: expect.stringMatching(/^Bearer /),
      }),
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      video_url: "https://storage.example.com/ref.mp4",
      image_url: "https://storage.example.com/input.jpg",
      mode: "std",
      keep_original_sound: "yes",
      character_orientation: "video",
      external_task_id: "job-1",
    });
  });
});

describe("pollMotrendProviderJob", () => {
  it("returns a succeed payload in stub mode", async () => {
    const result = await pollMotrendProviderJob({
      ...baseConfig("stub"),
      motrendStubOutputUrl: "https://storage.example.com/output.mp4",
    }, {
      jobId: "job-1",
      providerTaskId: "stub:job-1",
    });

    expect(result).toEqual({
      state: "succeed",
      outputUrl: "https://storage.example.com/output.mp4",
      watermarkUrl: null,
      nextPollDelayMs: null,
    });
  });

  it("keeps processing on transient kling http errors", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      code: 1200,
      message: "busy",
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await pollMotrendProviderJob(baseConfig("kling"), {
      jobId: "job-1",
      providerTaskId: "kling-task-123",
    });

    expect(result).toEqual({
      state: "processing",
      error: expect.stringContaining("Kling status 500"),
      nextPollDelayMs: 2000,
    });
  });

  it("keeps processing on transient kling api codes", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      code: 1200,
      message: "busy",
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await pollMotrendProviderJob(baseConfig("kling"), {
      jobId: "job-1",
      providerTaskId: "kling-task-123",
    });

    expect(result).toEqual({
      state: "processing",
      error: expect.stringContaining("Kling status code 1200"),
      nextPollDelayMs: 2000,
    });
  });

  it("returns succeed output when kling task is finished", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      code: 0,
      data: {
        task_status: "succeed",
        task_result: {
          videos: [{
            url: "https://storage.example.com/output.mp4",
            watermark_url: "https://storage.example.com/output-watermark.mp4",
          }],
        },
      },
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await pollMotrendProviderJob(baseConfig("kling"), {
      jobId: "job-1",
      providerTaskId: "kling-task-123",
    });

    expect(result).toEqual({
      state: "succeed",
      outputUrl: "https://storage.example.com/output.mp4",
      watermarkUrl: "https://storage.example.com/output-watermark.mp4",
      nextPollDelayMs: null,
    });
  });
});
