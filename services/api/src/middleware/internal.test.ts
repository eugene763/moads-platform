import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const googleAuthMocks = vi.hoisted(() => {
  const verifyIdTokenMock = vi.fn();
  const OAuth2ClientMock = vi.fn(() => ({
    verifyIdToken: verifyIdTokenMock,
  }));

  return {
    verifyIdTokenMock,
    OAuth2ClientMock,
  };
});

vi.mock("google-auth-library", () => ({
  OAuth2Client: googleAuthMocks.OAuth2ClientMock,
}));

import {requireInternalAccess, resetGoogleOidcClientForTest} from "./internal.js";

function buildRequest(input: {
  headers?: Record<string, string | undefined>;
  internalApiKey?: string | undefined;
  apiBaseUrl?: string | undefined;
  cloudTasksInvokerServiceAccountEmail?: string | undefined;
}) {
  return {
    headers: input.headers ?? {},
    server: {
      config: {
        internalApiKey: input.internalApiKey,
        apiBaseUrl: input.apiBaseUrl,
        cloudTasksInvokerServiceAccountEmail: input.cloudTasksInvokerServiceAccountEmail,
      },
    },
  };
}

describe("requireInternalAccess", () => {
  beforeEach(() => {
    resetGoogleOidcClientForTest();
    googleAuthMocks.verifyIdTokenMock.mockReset();
    googleAuthMocks.OAuth2ClientMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts the shared internal api key path", async () => {
    await expect(requireInternalAccess(buildRequest({
      headers: {
        "x-moads-internal-key": "internal-key",
      },
      internalApiKey: "internal-key",
      apiBaseUrl: "https://api-dev.moads.agency",
    }) as never, {} as never)).resolves.toBeUndefined();
  });

  it("accepts a valid Google OIDC token", async () => {
    googleAuthMocks.verifyIdTokenMock.mockResolvedValue({
      getPayload: () => ({
        iss: "https://accounts.google.com",
        email: "cloud-tasks-invoker@moads.test",
      }),
    });

    await expect(requireInternalAccess(buildRequest({
      headers: {
        authorization: "Bearer valid-google-token",
      },
      apiBaseUrl: "https://api-dev.moads.agency",
      cloudTasksInvokerServiceAccountEmail: "cloud-tasks-invoker@moads.test",
    }) as never, {} as never)).resolves.toBeUndefined();
    expect(googleAuthMocks.verifyIdTokenMock).toHaveBeenCalledWith({
      idToken: "valid-google-token",
      audience: "https://api-dev.moads.agency",
    });
  });

  it("rejects an invalid Google issuer", async () => {
    googleAuthMocks.verifyIdTokenMock.mockResolvedValue({
      getPayload: () => ({
        iss: "https://evil.example.com",
        email: "cloud-tasks-invoker@moads.test",
      }),
    });

    await expect(requireInternalAccess(buildRequest({
      headers: {
        authorization: "Bearer bad-issuer-token",
      },
      apiBaseUrl: "https://api-dev.moads.agency",
      cloudTasksInvokerServiceAccountEmail: "cloud-tasks-invoker@moads.test",
    }) as never, {} as never)).rejects.toMatchObject({
      statusCode: 403,
      code: "internal_oidc_forbidden",
    });
  });

  it("rejects a valid Google token from the wrong principal", async () => {
    googleAuthMocks.verifyIdTokenMock.mockResolvedValue({
      getPayload: () => ({
        iss: "https://accounts.google.com",
        email: "other-principal@moads.test",
      }),
    });

    await expect(requireInternalAccess(buildRequest({
      headers: {
        authorization: "Bearer wrong-principal-token",
      },
      apiBaseUrl: "https://api-dev.moads.agency",
      cloudTasksInvokerServiceAccountEmail: "cloud-tasks-invoker@moads.test",
    }) as never, {} as never)).rejects.toMatchObject({
      statusCode: 403,
      code: "internal_oidc_forbidden",
    });
  });

  it("rejects OIDC when the expected service account is not configured", async () => {
    googleAuthMocks.verifyIdTokenMock.mockResolvedValue({
      getPayload: () => ({
        iss: "https://accounts.google.com",
        email: "cloud-tasks-invoker@moads.test",
      }),
    });

    await expect(requireInternalAccess(buildRequest({
      headers: {
        authorization: "Bearer missing-config-token",
      },
      apiBaseUrl: "https://api-dev.moads.agency",
    }) as never, {} as never)).rejects.toMatchObject({
      statusCode: 503,
      code: "internal_oidc_unconfigured",
    });
  });

  it("rejects missing internal auth material", async () => {
    await expect(requireInternalAccess(buildRequest({
      apiBaseUrl: "https://api-dev.moads.agency",
    }) as never, {} as never)).rejects.toMatchObject({
      statusCode: 403,
      code: "internal_api_forbidden",
    });
  });
});
