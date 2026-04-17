import {describe, expect, it, vi} from "vitest";

import {PlatformError} from "@moads/db";

import {requireAuth} from "./auth.js";

function buildRequest({
  runtimeProfile = "prod",
  sessionCookie = "",
  authorization,
  user = {
    id: "user_123",
    firebaseUid: "firebase_123",
    primaryEmail: "person@example.com",
  },
  verifySessionCookieImpl,
  verifyIdTokenImpl,
}: {
  runtimeProfile?: "local" | "dev-cloud" | "prod";
  sessionCookie?: string;
  authorization?: string | undefined;
  user?: {id: string; firebaseUid: string; primaryEmail: string | null} | null;
  verifySessionCookieImpl?: ReturnType<typeof vi.fn>;
  verifyIdTokenImpl?: ReturnType<typeof vi.fn>;
} = {}) {
  const verifySessionCookie = verifySessionCookieImpl ?? vi.fn().mockResolvedValue({
    uid: "firebase_123",
    admin: false,
  });
  const verifyIdToken = verifyIdTokenImpl ?? vi.fn().mockResolvedValue({
    uid: "firebase_123",
    admin: false,
  });

  return {
    cookies: sessionCookie ? {moads_session_dev: sessionCookie} : {},
    headers: authorization ? {authorization} : {},
    server: {
      config: {
        runtimeProfile,
        sessionCookieName: "moads_session_dev",
      },
      firebase: {
        auth: {
          verifySessionCookie,
          verifyIdToken,
        },
      },
      prisma: {
        identityUser: {
          findUnique: vi.fn().mockResolvedValue(user),
        },
      },
    },
  } as any;
}

describe("requireAuth", () => {
  it("uses the session cookie in prod", async () => {
    const request = buildRequest({
      runtimeProfile: "prod",
      sessionCookie: "session-cookie",
    });

    await expect(requireAuth(request, {} as any)).resolves.toBeUndefined();
    expect(request.server.firebase.auth.verifySessionCookie).toHaveBeenCalledWith("session-cookie", true);
    expect(request.server.firebase.auth.verifyIdToken).not.toHaveBeenCalled();
    expect(request.authContext).toMatchObject({
      userId: "user_123",
      firebaseUid: "firebase_123",
      email: "person@example.com",
    });
  });

  it("accepts a bearer Firebase ID token in dev-cloud when the session cookie is missing", async () => {
    const request = buildRequest({
      runtimeProfile: "dev-cloud",
      authorization: "Bearer firebase-id-token",
    });

    await expect(requireAuth(request, {} as any)).resolves.toBeUndefined();
    expect(request.server.firebase.auth.verifySessionCookie).not.toHaveBeenCalled();
    expect(request.server.firebase.auth.verifyIdToken).toHaveBeenCalledWith("firebase-id-token");
  });

  it("falls back to a bearer Firebase ID token in dev-cloud when the session cookie is invalid", async () => {
    const request = buildRequest({
      runtimeProfile: "dev-cloud",
      sessionCookie: "stale-cookie",
      authorization: "Bearer fresh-firebase-id-token",
      verifySessionCookieImpl: vi.fn().mockRejectedValue(new Error("cookie expired")),
    });

    await expect(requireAuth(request, {} as any)).resolves.toBeUndefined();
    expect(request.server.firebase.auth.verifySessionCookie).toHaveBeenCalledWith("stale-cookie", true);
    expect(request.server.firebase.auth.verifyIdToken).toHaveBeenCalledWith("fresh-firebase-id-token");
  });

  it("rejects missing auth material", async () => {
    const request = buildRequest({
      runtimeProfile: "dev-cloud",
    });

    await expect(requireAuth(request, {} as any)).rejects.toMatchObject({
      statusCode: 401,
      code: "unauthenticated",
    } satisfies Partial<PlatformError>);
  });
});
