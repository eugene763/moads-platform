import {FastifyReply, FastifyRequest} from "fastify";

import {PlatformError} from "@moads/db";

export async function requireAdminClaim(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.authContext) {
    throw new PlatformError(500, "auth_context_missing", "Auth context is missing.");
  }

  if (request.authContext.claims.admin === true) {
    return;
  }

  throw new PlatformError(403, "admin_required", "Admin access is required.");
}
