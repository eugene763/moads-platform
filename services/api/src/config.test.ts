import {describe, expect, it} from "vitest";

import {loadConfig} from "./config.js";

function baseEnv() {
  return {
    MOADS_ENV: "local",
    NODE_ENV: "development",
    PORT: "8080",
    DATABASE_URL: "postgresql://moads_local:moads_local@127.0.0.1:5432/moads_local?schema=public",
    SESSION_COOKIE_NAME: "moads_session",
    SESSION_COOKIE_SECRET: "local-secret",
    SESSION_COOKIE_MAX_AGE_MS: "432000000",
    DEFAULT_DEV_PRODUCT_CODE: "motrend",
    API_ALLOWED_ORIGINS: "http://127.0.0.1:3000,http://localhost:5173",
    API_BASE_URL: "http://127.0.0.1:8080",
    FIREBASE_PROJECT_ID: "demo-moads-local",
    FIREBASE_STORAGE_BUCKET: "demo-moads-local.firebasestorage.app",
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
  };
}

describe("loadConfig", () => {
  it("accepts a safe local profile", () => {
    const config = loadConfig(baseEnv());

    expect(config.runtimeProfile).toBe("local");
    expect(config.firebaseUseEmulators).toBe(true);
    expect(config.databaseUrl).toContain("127.0.0.1");
    expect(config.motrendProviderMode).toBe("manual");
    expect(config.taskDispatchMode).toBe("manual");
  });

  it("rejects a local profile that points at a remote database", () => {
    expect(() => loadConfig({
      ...baseEnv(),
      DATABASE_URL: "postgresql://user:pass@db.example.com:5432/moads_local?schema=public",
    })).toThrow("MOADS_ENV=local requires DATABASE_URL");
  });

  it("rejects a prod profile that enables Firebase emulators", () => {
    expect(() => loadConfig({
      ...baseEnv(),
      MOADS_ENV: "prod",
      NODE_ENV: "production",
      FIREBASE_PROJECT_ID: "moads-prod",
      FIREBASE_STORAGE_BUCKET: "moads-prod.firebasestorage.app",
    })).toThrow("MOADS_ENV=prod must not enable Firebase emulators");
  });

  it("accepts a dev-cloud profile with production runtime settings", () => {
    const config = loadConfig({
      ...baseEnv(),
      MOADS_ENV: "dev-cloud",
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://moads_dev:moads_dev@10.0.0.15:5432/moads_dev?schema=public",
      API_ALLOWED_ORIGINS: "http://localhost:3000,https://lab-dev.moads.agency",
      FIREBASE_PROJECT_ID: "gen-lang-client-0651837818",
      FIREBASE_STORAGE_BUCKET: "gen-lang-client-0651837818.firebasestorage.app",
      FIREBASE_AUTH_EMULATOR_HOST: "",
      FIREBASE_STORAGE_EMULATOR_HOST: "",
      GOOGLE_APPLICATION_CREDENTIALS: "/tmp/gen-lang-client-0651837818-sa.json",
    });

    expect(config.runtimeProfile).toBe("dev-cloud");
    expect(config.firebaseUseEmulators).toBe(false);
    expect(config.nodeEnv).toBe("production");
  });

  it("accepts kling provider mode when secrets are set", () => {
    const config = loadConfig({
      ...baseEnv(),
      MOTREND_PROVIDER_MODE: "kling",
      KLING_ACCESS_KEY: "kling-access",
      KLING_SECRET_KEY: "kling-secret",
    });

    expect(config.motrendProviderMode).toBe("kling");
    expect(config.klingBaseUrl).toBe("https://api-singapore.klingai.com");
    expect(config.klingHttpTimeoutMs).toBe(20_000);
  });

  it("rejects kling provider mode when secrets are missing", () => {
    expect(() => loadConfig({
      ...baseEnv(),
      MOTREND_PROVIDER_MODE: "kling",
    })).toThrow("MOTREND_PROVIDER_MODE=kling requires");
  });

  it("accepts internal-http dispatch when api base url and internal key are set", () => {
    const config = loadConfig({
      ...baseEnv(),
      TASK_DISPATCH_MODE: "internal-http",
      INTERNAL_API_KEY: "local-internal-key",
    });

    expect(config.taskDispatchMode).toBe("internal-http");
    expect(config.internalApiKey).toBe("local-internal-key");
  });

  it("rejects cloud-tasks dispatch when queue config is missing", () => {
    expect(() => loadConfig({
      ...baseEnv(),
      MOADS_ENV: "dev-cloud",
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://moads_dev:moads_dev@10.0.0.15:5432/moads_dev?schema=public",
      TASK_DISPATCH_MODE: "cloud-tasks",
      API_BASE_URL: "https://api-dev.moads.agency",
      FIREBASE_PROJECT_ID: "gen-lang-client-0651837818",
      FIREBASE_STORAGE_BUCKET: "gen-lang-client-0651837818.firebasestorage.app",
      FIREBASE_AUTH_EMULATOR_HOST: "",
      FIREBASE_STORAGE_EMULATOR_HOST: "",
      GOOGLE_APPLICATION_CREDENTIALS: "/tmp/gen-lang-client-0651837818-sa.json",
    })).toThrow("TASK_DISPATCH_MODE=cloud-tasks requires");
  });

  it("accepts cloud-tasks dispatch when split queues and invoker email are set", () => {
    const config = loadConfig({
      ...baseEnv(),
      MOADS_ENV: "dev-cloud",
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://moads_dev:moads_dev@10.0.0.15:5432/moads_dev?schema=public",
      API_ALLOWED_ORIGINS: "http://localhost:3000,https://trend.moads.agency",
      API_BASE_URL: "https://api-dev.moads.agency",
      FIREBASE_PROJECT_ID: "gen-lang-client-0651837818",
      FIREBASE_STORAGE_BUCKET: "gen-lang-client-0651837818.firebasestorage.app",
      FIREBASE_AUTH_EMULATOR_HOST: "",
      FIREBASE_STORAGE_EMULATOR_HOST: "",
      GOOGLE_APPLICATION_CREDENTIALS: "/tmp/gen-lang-client-0651837818-sa.json",
      TASK_DISPATCH_MODE: "cloud-tasks",
      CLOUD_TASKS_PROJECT_ID: "gen-lang-client-0651837818",
      CLOUD_TASKS_LOCATION: "us-central1",
      CLOUD_TASKS_MOTREND_SUBMIT_QUEUE: "motrend-submit",
      CLOUD_TASKS_MOTREND_POLL_QUEUE: "motrend-poll",
      CLOUD_TASKS_MOTREND_DOWNLOAD_QUEUE: "motrend-download",
      CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL: "399776789069-compute@developer.gserviceaccount.com",
    });

    expect(config.taskDispatchMode).toBe("cloud-tasks");
    expect(config.cloudTasksMotrendSubmitQueue).toBe("motrend-submit");
    expect(config.cloudTasksMotrendPollQueue).toBe("motrend-poll");
    expect(config.cloudTasksMotrendDownloadQueue).toBe("motrend-download");
    expect(config.cloudTasksInvokerServiceAccountEmail).toBe("399776789069-compute@developer.gserviceaccount.com");
  });
});
