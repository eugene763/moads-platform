import {createHmac} from "node:crypto";

import {PlatformError} from "@moads/db";

import {ApiConfig} from "../types.js";

interface KlingCreateResponse {
  code?: number;
  message?: string;
  request_id?: string;
  data?: {
    task_id?: string;
  };
}

interface KlingStatusResponse {
  code?: number;
  message?: string;
  request_id?: string;
  data?: {
    task_status?: string;
    task_status_msg?: string;
    task_result?: {
      videos?: Array<{
        url?: string;
        watermark_url?: string;
      }>;
    };
  };
}

export interface SubmitMotrendProviderJobInput {
  jobId: string;
  inputImageUrl: string;
  referenceVideoUrl: string;
}

export interface SubmitMotrendProviderJobResult {
  providerTaskId: string;
  providerState: string;
  nextPollDelayMs?: number | null;
}

export interface PollMotrendProviderJobInput {
  jobId: string;
  providerTaskId: string;
}

export interface PollMotrendProviderJobResult {
  state: "processing" | "succeed" | "failed";
  outputUrl?: string | null;
  watermarkUrl?: string | null;
  error?: string | null;
  nextPollDelayMs?: number | null;
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
}

function errorMessage(error: unknown): string {
  if (error instanceof PlatformError) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown provider error.";
}

function trailingSlashless(url: string): string {
  return url.replace(/\/+$/, "");
}

function encodeBase64Url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function makeKlingJwt(accessKey: string, secretKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({
    alg: "HS256",
    typ: "JWT",
  }));
  const payload = encodeBase64Url(JSON.stringify({
    iss: accessKey,
    iat: now - 5,
    nbf: now - 5,
    exp: now + (30 * 60),
  }));
  const signature = createHmac("sha256", secretKey)
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}

function isTransientStatus(statusCode: number): boolean {
  return [408, 425, 429, 500, 502, 503, 504].includes(statusCode);
}

function isTransientKlingCode(code: number): boolean {
  return code === 1200;
}

async function readResponseBody<T>(response: Response): Promise<{
  bodyText: string;
  json: T;
}> {
  const bodyText = await response.text();
  let json = {} as T;

  if (bodyText) {
    try {
      json = JSON.parse(bodyText) as T;
    } catch {
      json = {} as T;
    }
  }

  return {
    bodyText,
    json,
  };
}

function assertKlingConfigured(config: ApiConfig): {
  accessKey: string;
  secretKey: string;
  baseUrl: string;
  timeoutMs: number;
} {
  if (!config.klingAccessKey || !config.klingSecretKey || !config.klingBaseUrl) {
    throw new PlatformError(
      503,
      "kling_unconfigured",
      "KLING_ACCESS_KEY, KLING_SECRET_KEY, and KLING_BASE_URL are required when MOTREND_PROVIDER_MODE=kling.",
    );
  }

  return {
    accessKey: config.klingAccessKey,
    secretKey: config.klingSecretKey,
    baseUrl: config.klingBaseUrl,
    timeoutMs: config.klingHttpTimeoutMs,
  };
}

async function submitKlingProviderJob(
  config: ApiConfig,
  input: SubmitMotrendProviderJobInput,
): Promise<SubmitMotrendProviderJobResult> {
  const kling = assertKlingConfigured(config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), kling.timeoutMs);

  try {
    const response = await fetch(
      `${trailingSlashless(kling.baseUrl)}/v1/videos/motion-control`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${makeKlingJwt(kling.accessKey, kling.secretKey)}`,
        },
        body: JSON.stringify({
          video_url: input.referenceVideoUrl,
          image_url: input.inputImageUrl,
          mode: "std",
          keep_original_sound: "yes",
          character_orientation: "video",
          external_task_id: input.jobId,
        }),
        signal: controller.signal,
      },
    );

    const {bodyText, json} = await readResponseBody<KlingCreateResponse>(response);

    if (!response.ok) {
      throw new Error(`Kling ${response.status}: ${bodyText || "empty body"}`);
    }

    if (json.code && json.code !== 0) {
      throw new Error(`Kling ${json.code}: ${bodyText || "empty body"}`);
    }

    const providerTaskId = pickString(json.data?.task_id);
    if (!providerTaskId) {
      throw new Error(`No task_id in response: ${bodyText || "empty body"}`);
    }

    return {
      providerTaskId,
      providerState: "processing",
      nextPollDelayMs: config.motrendProviderPollDelayMs,
    };
  } catch (error) {
    throw new Error(`Kling submit request failed: ${errorMessage(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function pollKlingProviderJob(
  config: ApiConfig,
  input: PollMotrendProviderJobInput,
): Promise<PollMotrendProviderJobResult> {
  const kling = assertKlingConfigured(config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), kling.timeoutMs);

  try {
    const response = await fetch(
      `${trailingSlashless(kling.baseUrl)}/v1/videos/motion-control/${encodeURIComponent(input.providerTaskId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${makeKlingJwt(kling.accessKey, kling.secretKey)}`,
        },
        signal: controller.signal,
      },
    );

    const {bodyText, json} = await readResponseBody<KlingStatusResponse>(response);

    if (!response.ok) {
      const message = `Kling status ${response.status}: ${bodyText || "empty body"}`;
      if (isTransientStatus(response.status)) {
        return {
          state: "processing",
          error: message,
          nextPollDelayMs: config.motrendProviderPollDelayMs,
        };
      }

      return {
        state: "failed",
        error: message,
        nextPollDelayMs: null,
      };
    }

    if (json.code && json.code !== 0) {
      const message = `Kling status code ${json.code}: ${bodyText || "empty body"}`;
      if (isTransientKlingCode(json.code)) {
        return {
          state: "processing",
          error: message,
          nextPollDelayMs: config.motrendProviderPollDelayMs,
        };
      }

      return {
        state: "failed",
        error: pickString(json.message, message) ?? message,
        nextPollDelayMs: null,
      };
    }

    const taskStatus = pickString(json.data?.task_status)?.toLowerCase() ?? "";
    if (taskStatus === "succeed") {
      const video = json.data?.task_result?.videos?.[0];
      const outputUrl = pickString(video?.url);
      if (!outputUrl) {
        return {
          state: "failed",
          error: "Kling task succeeded without output url.",
          nextPollDelayMs: null,
        };
      }

      return {
        state: "succeed",
        outputUrl,
        watermarkUrl: pickString(video?.watermark_url),
        nextPollDelayMs: null,
      };
    }

    if (taskStatus === "failed") {
      return {
        state: "failed",
        error: pickString(json.data?.task_status_msg, json.message) ?? "Kling task failed.",
        nextPollDelayMs: null,
      };
    }

    return {
      state: "processing",
      nextPollDelayMs: config.motrendProviderPollDelayMs,
    };
  } catch (error) {
    return {
      state: "processing",
      error: `Kling status request failed: ${errorMessage(error)}`,
      nextPollDelayMs: config.motrendProviderPollDelayMs,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function submitMotrendProviderJob(
  config: ApiConfig,
  input: SubmitMotrendProviderJobInput,
): Promise<SubmitMotrendProviderJobResult> {
  if (config.motrendProviderMode === "stub") {
    return {
      providerTaskId: `stub:${input.jobId}`,
      providerState: "processing",
      nextPollDelayMs: config.motrendProviderPollDelayMs,
    };
  }

  if (config.motrendProviderMode === "kling") {
    return await submitKlingProviderJob(config, input);
  }

  return {
    providerTaskId: `manual:${input.jobId}`,
    providerState: "processing",
    nextPollDelayMs: null,
  };
}

export async function pollMotrendProviderJob(
  config: ApiConfig,
  input: PollMotrendProviderJobInput,
): Promise<PollMotrendProviderJobResult> {
  if (config.motrendProviderMode === "stub") {
    if (!config.motrendStubOutputUrl) {
      throw new PlatformError(
        503,
        "motrend_stub_output_missing",
        "MOTREND_STUB_OUTPUT_URL is required when MOTREND_PROVIDER_MODE=stub.",
      );
    }

    return {
      state: "succeed",
      outputUrl: config.motrendStubOutputUrl,
      watermarkUrl: null,
      nextPollDelayMs: null,
    };
  }

  if (config.motrendProviderMode === "kling") {
    return await pollKlingProviderJob(config, input);
  }

  return {
    state: "processing",
    error: `Provider result for ${input.providerTaskId} is waiting for manual simulation.`,
    nextPollDelayMs: null,
  };
}
