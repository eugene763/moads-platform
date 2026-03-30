import {describe, expect, it, vi} from "vitest";

import {PlatformError} from "@moads/db";

import {hasCurrentAdminClaim, requireAdminClaim} from "./admin.js";

function createRequest({
  sessionAdmin = false,
  liveAdmin = false,
  getUserRejects = false,
}: {
  sessionAdmin?: boolean;
  liveAdmin?: boolean;
  getUserRejects?: boolean;
} = {}) {
  const getUser = getUserRejects ?
    vi.fn().mockRejectedValue(new Error("firebase lookup failed")) :
    vi.fn().mockResolvedValue({customClaims: {admin: liveAdmin}});

  return {
    authContext: {
      userId: "user_123",
      firebaseUid: "firebase_123",
      email: "admin@example.com",
      claims: {admin: sessionAdmin},
    },
    server: {
      firebase: {
        auth: {
          getUser,
        },
      },
    },
    log: {
      warn: vi.fn(),
    },
  } as any;
}

describe("hasCurrentAdminClaim", () => {
  it("trusts an admin claim already present in the session cookie", async () => {
    const request = createRequest({sessionAdmin: true});

    await expect(hasCurrentAdminClaim(request)).resolves.toBe(true);
    expect(request.server.firebase.auth.getUser).not.toHaveBeenCalled();
  });

  it("falls back to live Firebase custom claims when the cookie claim is stale", async () => {
    const request = createRequest({sessionAdmin: false, liveAdmin: true});

    await expect(hasCurrentAdminClaim(request)).resolves.toBe(true);
    expect(request.server.firebase.auth.getUser).toHaveBeenCalledWith("firebase_123");
  });

  it("returns false when live claim lookup fails", async () => {
    const request = createRequest({sessionAdmin: false, getUserRejects: true});

    await expect(hasCurrentAdminClaim(request)).resolves.toBe(false);
    expect(request.log.warn).toHaveBeenCalled();
  });
});

describe("requireAdminClaim", () => {
  it("throws admin_required when neither session nor live claims mark the user as admin", async () => {
    const request = createRequest({sessionAdmin: false, liveAdmin: false});

    await expect(requireAdminClaim(request, {} as any)).rejects.toMatchObject({
      statusCode: 403,
      code: "admin_required",
    } satisfies Partial<PlatformError>);
  });
});
