import {ApiConfig, MotrendProviderMode, RuntimeProfile, TaskDispatchMode} from "./types.js";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const MIN_FIREBASE_SESSION_COOKIE_AGE_MS = 5 * 60 * 1000;
const MAX_FIREBASE_SESSION_COOKIE_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const CREEM_ALLOWED_API_HOSTS = new Set(["api.creem.io", "test-api.creem.io"]);
const PROFILE_NODE_ENV: Record<RuntimeProfile, string> = {
  local: "development",
  "dev-cloud": "production",
  prod: "production",
};

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseRuntimeProfile(value: string | undefined): RuntimeProfile {
  if (value === "local" || value === "dev-cloud" || value === "prod") {
    return value;
  }

  throw new Error("MOADS_ENV must be one of: local, dev-cloud, prod.");
}

function pickTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseCreemApiBaseUrl(
  value: string | undefined,
  runtimeProfile: RuntimeProfile,
): string {
  const fallback = runtimeProfile === "prod" ?
    "https://api.creem.io" :
    "https://test-api.creem.io";
  const candidate = pickTrimmed(value) ?? fallback;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("CREEM_API_BASE_URL must be a valid absolute URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("CREEM_API_BASE_URL must use https.");
  }

  if (!CREEM_ALLOWED_API_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("CREEM_API_BASE_URL must point to api.creem.io or test-api.creem.io.");
  }

  return parsed.origin;
}

function parseMotrendProviderMode(value: string | undefined): MotrendProviderMode {
  if (!value || value === "manual") {
    return "manual";
  }

  if (value === "stub") {
    return "stub";
  }

  if (value === "kling") {
    return "kling";
  }

  throw new Error("MOTREND_PROVIDER_MODE must be one of: manual, stub, kling.");
}

function parseTaskDispatchMode(value: string | undefined): TaskDispatchMode {
  if (!value || value === "manual") {
    return "manual";
  }

  if (value === "internal-http" || value === "cloud-tasks") {
    return value;
  }

  throw new Error("TASK_DISPATCH_MODE must be one of: manual, internal-http, cloud-tasks.");
}

function parseAeoAdapterMode(value: string | undefined, envName: string): "mock" | "live" {
  if (!value || value === "mock") {
    return "mock";
  }

  if (value === "live") {
    return "live";
  }

  throw new Error(`${envName} must be one of: mock, live.`);
}

function normalizeHost(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withProtocol).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isLocalHost(host: string | null): boolean {
  return host != null && LOCAL_HOSTS.has(host);
}

function isLocalDatabaseUrl(databaseUrl: string): boolean {
  try {
    return isLocalHost(new URL(databaseUrl).hostname);
  } catch {
    return false;
  }
}

function hasLocalOrigins(origins: string[]): boolean {
  return origins.some((origin) => isLocalHost(normalizeHost(origin)));
}

function hasNonLocalOrigins(origins: string[]): boolean {
  return origins.some((origin) => !isLocalHost(normalizeHost(origin)));
}

function assertEmulatorHost(name: string, value: string | undefined): void {
  if (!value) {
    return;
  }

  if (value.includes("://")) {
    throw new Error(`${name} must omit protocols such as http://.`);
  }
}

export function loadConfig(env = process.env): ApiConfig {
  const runtimeProfile = parseRuntimeProfile(env.MOADS_ENV);
  const nodeEnv = env.NODE_ENV ?? PROFILE_NODE_ENV[runtimeProfile];
  const databaseUrl = env.DATABASE_URL;
  const sessionCookieSecret = env.SESSION_COOKIE_SECRET;
  const sessionCookieMaxAgeMs = parseNumber(
    env.SESSION_COOKIE_MAX_AGE_MS,
    MAX_FIREBASE_SESSION_COOKIE_AGE_MS,
  );
  const sessionCookieDomain = pickTrimmed(env.SESSION_COOKIE_DOMAIN);
  const allowedOrigins = parseAllowedOrigins(env.API_ALLOWED_ORIGINS);
  const apiBaseUrl = pickTrimmed(env.API_BASE_URL);
  const firebaseProjectId = pickTrimmed(env.FIREBASE_PROJECT_ID);
  const firebaseStorageBucket = pickTrimmed(env.FIREBASE_STORAGE_BUCKET);
  const firebaseServiceAccountJson = pickTrimmed(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const firebaseAuthEmulatorHost = pickTrimmed(env.FIREBASE_AUTH_EMULATOR_HOST);
  const firebaseStorageEmulatorHost = pickTrimmed(env.FIREBASE_STORAGE_EMULATOR_HOST);
  const googleApplicationCredentials = pickTrimmed(env.GOOGLE_APPLICATION_CREDENTIALS);
  const internalApiKey = pickTrimmed(env.INTERNAL_API_KEY);
  const taskDispatchMode = parseTaskDispatchMode(env.TASK_DISPATCH_MODE);
  const cloudTasksProjectId = pickTrimmed(env.CLOUD_TASKS_PROJECT_ID) ?? firebaseProjectId;
  const cloudTasksLocation = pickTrimmed(env.CLOUD_TASKS_LOCATION);
  const cloudTasksMotrendSubmitQueue = pickTrimmed(env.CLOUD_TASKS_MOTREND_SUBMIT_QUEUE);
  const cloudTasksMotrendPollQueue = pickTrimmed(env.CLOUD_TASKS_MOTREND_POLL_QUEUE);
  const cloudTasksMotrendDownloadQueue = pickTrimmed(env.CLOUD_TASKS_MOTREND_DOWNLOAD_QUEUE);
  const cloudTasksInvokerServiceAccountEmail = pickTrimmed(env.CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL);
  const fsApiUsername = pickTrimmed(env.FS_API_USERNAME);
  const fsApiPassword = pickTrimmed(env.FS_API_PASSWORD);
  const fsStoreHost = pickTrimmed(env.FS_STORE_HOST);
  const creemApiKey = pickTrimmed(env.CREEM_API_KEY);
  const creemWebhookSecret = pickTrimmed(env.CREEM_WEBHOOK_SECRET);
  const creemApiBaseUrl = parseCreemApiBaseUrl(env.CREEM_API_BASE_URL, runtimeProfile);
  const motrendProviderMode = parseMotrendProviderMode(env.MOTREND_PROVIDER_MODE);
  const motrendStubOutputUrl = pickTrimmed(env.MOTREND_STUB_OUTPUT_URL);
  const klingAccessKey = pickTrimmed(env.KLING_ACCESS_KEY);
  const klingSecretKey = pickTrimmed(env.KLING_SECRET_KEY);
  const klingBaseUrl = pickTrimmed(env.KLING_BASE_URL) ?? "https://api-singapore.klingai.com";
  const aeoAiTipsMode = parseAeoAdapterMode(env.AEO_AI_TIPS_MODE, "AEO_AI_TIPS_MODE");
  const aeoGa4Mode = parseAeoAdapterMode(env.AEO_GA4_MODE, "AEO_GA4_MODE");
  const aeoRealtimeMode = parseAeoAdapterMode(env.AEO_REALTIME_MODE, "AEO_REALTIME_MODE");
  const aeoOpenAiApiKey = pickTrimmed(env.OPENAI_API_KEY) ?? pickTrimmed(env.AEO_OPENAI_API_KEY);
  const aeoAiTipsModel = pickTrimmed(env.AEO_AI_TIPS_MODEL) ?? "gpt-5-mini";

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  if (!sessionCookieSecret) {
    throw new Error("SESSION_COOKIE_SECRET is required.");
  }

  if (
    sessionCookieMaxAgeMs < MIN_FIREBASE_SESSION_COOKIE_AGE_MS ||
    sessionCookieMaxAgeMs > MAX_FIREBASE_SESSION_COOKIE_AGE_MS
  ) {
    throw new Error(
      `SESSION_COOKIE_MAX_AGE_MS must be between ${MIN_FIREBASE_SESSION_COOKIE_AGE_MS} and ${MAX_FIREBASE_SESSION_COOKIE_AGE_MS}.`,
    );
  }

  if (!firebaseProjectId) {
    throw new Error("FIREBASE_PROJECT_ID is required.");
  }

  if (!firebaseStorageBucket) {
    throw new Error("FIREBASE_STORAGE_BUCKET is required.");
  }

  assertEmulatorHost("FIREBASE_AUTH_EMULATOR_HOST", firebaseAuthEmulatorHost);
  assertEmulatorHost("FIREBASE_STORAGE_EMULATOR_HOST", firebaseStorageEmulatorHost);

  if (nodeEnv !== PROFILE_NODE_ENV[runtimeProfile]) {
    throw new Error(`MOADS_ENV=${runtimeProfile} requires NODE_ENV=${PROFILE_NODE_ENV[runtimeProfile]}.`);
  }

  if (runtimeProfile === "local") {
    if (!isLocalDatabaseUrl(databaseUrl)) {
      throw new Error("MOADS_ENV=local requires DATABASE_URL to point at localhost or 127.0.0.1.");
    }

    if (hasNonLocalOrigins(allowedOrigins)) {
      throw new Error("MOADS_ENV=local allows only localhost or 127.0.0.1 origins.");
    }

    if (sessionCookieDomain && !isLocalHost(normalizeHost(sessionCookieDomain))) {
      throw new Error("MOADS_ENV=local must not set a shared cloud cookie domain.");
    }

    if (!firebaseProjectId.startsWith("demo-")) {
      throw new Error("MOADS_ENV=local must use a demo Firebase project id starting with demo-.");
    }

    if (!firebaseAuthEmulatorHost || !firebaseStorageEmulatorHost) {
      throw new Error("MOADS_ENV=local requires both FIREBASE_AUTH_EMULATOR_HOST and FIREBASE_STORAGE_EMULATOR_HOST.");
    }

    if (firebaseServiceAccountJson || googleApplicationCredentials) {
      throw new Error("MOADS_ENV=local must not load cloud Firebase credentials.");
    }
  }

  if (runtimeProfile !== "local") {
    if (firebaseProjectId.startsWith("demo-")) {
      throw new Error(`MOADS_ENV=${runtimeProfile} cannot use a demo Firebase project id.`);
    }

    if (firebaseAuthEmulatorHost || firebaseStorageEmulatorHost) {
      throw new Error(`MOADS_ENV=${runtimeProfile} must not enable Firebase emulators.`);
    }
  }

  if (runtimeProfile === "prod") {
    if (hasLocalOrigins(allowedOrigins)) {
      throw new Error("MOADS_ENV=prod must not allow localhost origins.");
    }

    if (sessionCookieDomain && isLocalHost(normalizeHost(sessionCookieDomain))) {
      throw new Error("MOADS_ENV=prod must not use a localhost cookie domain.");
    }
  }

  if (taskDispatchMode === "internal-http") {
    if (!internalApiKey) {
      throw new Error(`TASK_DISPATCH_MODE=${taskDispatchMode} requires INTERNAL_API_KEY.`);
    }

    if (!apiBaseUrl) {
      throw new Error(`TASK_DISPATCH_MODE=${taskDispatchMode} requires API_BASE_URL.`);
    }
  }

  if (taskDispatchMode === "cloud-tasks") {
    if (
      !apiBaseUrl ||
      !cloudTasksProjectId ||
      !cloudTasksLocation ||
      !cloudTasksMotrendSubmitQueue ||
      !cloudTasksMotrendPollQueue ||
      !cloudTasksMotrendDownloadQueue ||
      !cloudTasksInvokerServiceAccountEmail
    ) {
      throw new Error(
        "TASK_DISPATCH_MODE=cloud-tasks requires API_BASE_URL, CLOUD_TASKS_PROJECT_ID, CLOUD_TASKS_LOCATION, CLOUD_TASKS_MOTREND_SUBMIT_QUEUE, CLOUD_TASKS_MOTREND_POLL_QUEUE, CLOUD_TASKS_MOTREND_DOWNLOAD_QUEUE, and CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL.",
      );
    }
  }

  if (motrendProviderMode === "stub" && !motrendStubOutputUrl) {
    throw new Error("MOTREND_PROVIDER_MODE=stub requires MOTREND_STUB_OUTPUT_URL.");
  }

  if (motrendProviderMode === "kling" && (!klingAccessKey || !klingSecretKey)) {
    throw new Error("MOTREND_PROVIDER_MODE=kling requires KLING_ACCESS_KEY and KLING_SECRET_KEY.");
  }

  if (aeoAiTipsMode === "live" && !aeoOpenAiApiKey) {
    throw new Error("AEO_AI_TIPS_MODE=live requires OPENAI_API_KEY (or AEO_OPENAI_API_KEY).");
  }

  return {
    runtimeProfile,
    nodeEnv,
    port: parseNumber(env.PORT, 8080),
    databaseUrl,
    sessionCookieName: env.SESSION_COOKIE_NAME ?? "moads_session",
    sessionCookieMaxAgeMs,
    sessionCookieSecret,
    ...(apiBaseUrl ? {apiBaseUrl} : {}),
    defaultDevProductCode: env.DEFAULT_DEV_PRODUCT_CODE ?? "motrend",
    allowedOrigins,
    ...(sessionCookieDomain ? {sessionCookieDomain} : {}),
    firebaseProjectId,
    firebaseStorageBucket,
    ...(firebaseServiceAccountJson ? {firebaseServiceAccountJson} : {}),
    ...(firebaseAuthEmulatorHost ? {firebaseAuthEmulatorHost} : {}),
    ...(firebaseStorageEmulatorHost ? {firebaseStorageEmulatorHost} : {}),
    firebaseUseEmulators: runtimeProfile === "local",
    ...(internalApiKey ? {internalApiKey} : {}),
    taskDispatchMode,
    taskDispatchTimeoutMs: parseNumber(env.TASK_DISPATCH_TIMEOUT_MS, 5_000),
    ...(cloudTasksProjectId ? {cloudTasksProjectId} : {}),
    ...(cloudTasksLocation ? {cloudTasksLocation} : {}),
    ...(cloudTasksMotrendSubmitQueue ? {cloudTasksMotrendSubmitQueue} : {}),
    ...(cloudTasksMotrendPollQueue ? {cloudTasksMotrendPollQueue} : {}),
    ...(cloudTasksMotrendDownloadQueue ? {cloudTasksMotrendDownloadQueue} : {}),
    ...(cloudTasksInvokerServiceAccountEmail ? {cloudTasksInvokerServiceAccountEmail} : {}),
    ...(fsApiUsername ? {fsApiUsername} : {}),
    ...(fsApiPassword ? {fsApiPassword} : {}),
    ...(fsStoreHost ? {fsStoreHost} : {}),
    ...(creemApiKey ? {creemApiKey} : {}),
    ...(creemWebhookSecret ? {creemWebhookSecret} : {}),
    creemApiBaseUrl,
    motrendProviderMode,
    motrendProviderPollDelayMs: parseNumber(env.MOTREND_PROVIDER_POLL_DELAY_MS, 2_000),
    ...(motrendStubOutputUrl ? {motrendStubOutputUrl} : {}),
    ...(klingAccessKey ? {klingAccessKey} : {}),
    ...(klingSecretKey ? {klingSecretKey} : {}),
    klingBaseUrl,
    klingHttpTimeoutMs: parseNumber(env.KLING_HTTP_TIMEOUT_MS, 20_000),
    aeoPublicScanRateLimitPerHour: parseNumber(env.AEO_PUBLIC_SCAN_RATE_LIMIT_PER_HOUR, 20),
    aeoPublicScanCacheTtlMs: parseNumber(env.AEO_PUBLIC_SCAN_CACHE_TTL_MS, 24 * 60 * 60 * 1000),
    aeoAiTipsMode,
    aeoGa4Mode,
    aeoRealtimeMode,
    aeoRealtimeIntervalMs: parseNumber(env.AEO_REALTIME_INTERVAL_MS, 5_000),
    ...(aeoOpenAiApiKey ? {aeoOpenAiApiKey} : {}),
    aeoAiTipsModel,
  };
}
