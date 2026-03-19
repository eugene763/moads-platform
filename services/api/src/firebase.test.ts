import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const firebaseAdminMocks = vi.hoisted(() => ({
  initializeAppMock: vi.fn(() => ({name: "mock-app"})),
  getAppsMock: vi.fn(() => []),
  certMock: vi.fn((value: unknown) => ({value})),
  applicationDefaultMock: vi.fn(() => ({kind: "application-default"})),
  bucketMock: vi.fn((name?: string) => ({name: name ?? "default-bucket"})),
  getStorageMock: vi.fn(),
  getAuthMock: vi.fn(() => ({kind: "auth"})),
  getFirestoreMock: vi.fn(() => ({kind: "firestore"})),
}));

firebaseAdminMocks.getStorageMock.mockImplementation(() => ({
  bucket: firebaseAdminMocks.bucketMock,
}));

vi.mock("firebase-admin/app", () => ({
  applicationDefault: firebaseAdminMocks.applicationDefaultMock,
  cert: firebaseAdminMocks.certMock,
  getApps: firebaseAdminMocks.getAppsMock,
  initializeApp: firebaseAdminMocks.initializeAppMock,
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: firebaseAdminMocks.getAuthMock,
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: firebaseAdminMocks.getFirestoreMock,
}));

vi.mock("firebase-admin/storage", () => ({
  getStorage: firebaseAdminMocks.getStorageMock,
}));

import {getFirebaseContext} from "./firebase.js";

describe("getFirebaseContext", () => {
  beforeEach(() => {
    firebaseAdminMocks.initializeAppMock.mockClear();
    firebaseAdminMocks.getAppsMock.mockReset();
    firebaseAdminMocks.getAppsMock.mockReturnValue([]);
    firebaseAdminMocks.certMock.mockClear();
    firebaseAdminMocks.applicationDefaultMock.mockClear();
    firebaseAdminMocks.bucketMock.mockClear();
    firebaseAdminMocks.getStorageMock.mockClear();
    firebaseAdminMocks.getStorageMock.mockImplementation(() => ({
      bucket: firebaseAdminMocks.bucketMock,
    }));
    firebaseAdminMocks.getAuthMock.mockClear();
    firebaseAdminMocks.getFirestoreMock.mockClear();
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
    delete process.env.GCLOUD_PROJECT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses emulator wiring without cloud credentials in local mode", () => {
    const context = getFirebaseContext({
      runtimeProfile: "local",
      nodeEnv: "development",
      port: 8080,
      databaseUrl: "postgresql://moads_local:moads_local@127.0.0.1:5432/moads_local?schema=public",
      sessionCookieName: "moads_session",
      sessionCookieMaxAgeMs: 1000,
      sessionCookieSecret: "local-secret",
      apiBaseUrl: "http://127.0.0.1:8080",
      defaultDevProductCode: "motrend",
      allowedOrigins: ["http://127.0.0.1:3000"],
      firebaseProjectId: "demo-moads-local",
      firebaseStorageBucket: "demo-moads-local.firebasestorage.app",
      firebaseAuthEmulatorHost: "127.0.0.1:9099",
      firebaseStorageEmulatorHost: "127.0.0.1:9199",
      firebaseUseEmulators: true,
      taskDispatchMode: "manual",
      taskDispatchTimeoutMs: 5000,
      cloudTasksProjectId: "demo-moads-local",
      cloudTasksLocation: "us-central1",
      cloudTasksMotrendSubmitQueue: "motrend-submit",
      cloudTasksMotrendPollQueue: "motrend-poll",
      cloudTasksInvokerServiceAccountEmail: "demo-compute@developer.gserviceaccount.com",
      motrendProviderMode: "manual",
      motrendProviderPollDelayMs: 2000,
      klingBaseUrl: "https://api-singapore.klingai.com",
      klingHttpTimeoutMs: 20_000,
    });

    expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe("127.0.0.1:9099");
    expect(process.env.FIREBASE_STORAGE_EMULATOR_HOST).toBe("127.0.0.1:9199");
    expect(process.env.GCLOUD_PROJECT).toBe("demo-moads-local");
    expect(firebaseAdminMocks.applicationDefaultMock).not.toHaveBeenCalled();
    expect(firebaseAdminMocks.certMock).not.toHaveBeenCalled();
    expect(firebaseAdminMocks.initializeAppMock).toHaveBeenCalledWith({
      projectId: "demo-moads-local",
      storageBucket: "demo-moads-local.firebasestorage.app",
    });
    expect(firebaseAdminMocks.getFirestoreMock).toHaveBeenCalled();
    expect(context.bucketName).toBe("demo-moads-local.firebasestorage.app");
  });
});
