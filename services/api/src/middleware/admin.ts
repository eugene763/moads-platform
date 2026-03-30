import {FastifyReply, FastifyRequest} from "fastify";

import {PlatformError} from "@moads/db";

export async function hasCurrentAdminClaim(request: FastifyRequest): Promise<boolean> {
  if (!request.authContext) {
    throw new PlatformError(500, "auth_context_missing", "Auth context is missing.");
  }

  if (request.authContext.claims.admin === true) {
    return true;
  }

  try {
    const userRecord = await request.server.firebase.auth.getUser(request.authContext.firebaseUid);
    return userRecord.customClaims?.admin === true;
  } catch (error) {
    request.log.warn(
      {
        err: error,
        firebaseUid: request.authContext.firebaseUid,
        userId: request.authContext.userId,
      },
      "firebase custom claim lookup failed",
    );
    return false;
  }
}

export async function requireAdminClaim(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (await hasCurrentAdminClaim(request)) {
    return;
  }

  throw new PlatformError(403, "admin_required", "Admin access is required.");
}
