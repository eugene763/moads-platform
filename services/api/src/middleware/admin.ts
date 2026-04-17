import {FastifyReply, FastifyRequest} from "fastify";

import {PlatformError} from "@moads/db";

export async function hasCurrentAdminClaim(request: FastifyRequest): Promise<boolean> {
  if (!request.authContext) {
    throw new PlatformError(500, "auth_context_missing", "Auth context is missing.");
  }

  return request.authContext.claims.admin === true;
}

export async function requireAdminClaim(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (await hasCurrentAdminClaim(request)) {
    return;
  }

  throw new PlatformError(403, "admin_required", "Admin access is required.");
}
