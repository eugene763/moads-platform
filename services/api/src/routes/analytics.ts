import {FastifyInstance} from "fastify";

import {
  PlatformError,
  upsertAttributionProfile,
} from "@moads/db";

import {requireAuth, resolveAccount} from "../middleware/auth.js";

export async function registerAnalyticsRoutes(app: FastifyInstance): Promise<void> {
  app.post("/analytics/attribution", {preHandler: [requireAuth, resolveAccount]}, async (request, reply) => {
    if (!request.authContext || !request.accountContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const body = (
      request.body &&
      typeof request.body === "object" &&
      !Array.isArray(request.body)
    ) ? request.body as Record<string, unknown> : {};

    const result = await upsertAttributionProfile(app.prisma, {
      accountId: request.accountContext.accountId,
      userId: request.authContext.userId,
      payload: body,
    });

    reply.send(result);
  });
}
