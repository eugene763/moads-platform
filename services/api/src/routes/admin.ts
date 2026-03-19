import {FastifyInstance} from "fastify";

import {
  findAdminSupportLookup,
  grantAdminWalletCredits,
  PlatformError,
} from "@moads/db";

import {requireAdminClaim} from "../middleware/admin.js";
import {requireAuth} from "../middleware/auth.js";

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  const adminGuards = [requireAuth, requireAdminClaim];

  app.get("/admin/support/:supportCode", {preHandler: adminGuards}, async (request, reply) => {
    if (!request.authContext) {
      throw new PlatformError(500, "auth_context_missing", "Auth context is missing.");
    }

    const params = request.params as {supportCode?: string} | undefined;
    if (typeof params?.supportCode !== "string" || !params.supportCode.trim()) {
      throw new PlatformError(400, "support_code_required", "supportCode is required.");
    }

    const result = await findAdminSupportLookup(app.prisma, {
      supportCode: params.supportCode.trim(),
    });

    reply.send(result);
  });

  app.post("/admin/wallet-grants", {preHandler: adminGuards}, async (request, reply) => {
    if (!request.authContext) {
      throw new PlatformError(500, "auth_context_missing", "Auth context is missing.");
    }

    const body = request.body as {
      supportCode?: unknown;
      amount?: unknown;
      reason?: unknown;
    } | undefined;

    if (typeof body?.supportCode !== "string" || !body.supportCode.trim()) {
      throw new PlatformError(400, "support_code_required", "supportCode is required.");
    }

    const result = await grantAdminWalletCredits(app.prisma, {
      adminUserId: request.authContext.userId,
      supportCode: body.supportCode.trim(),
      amount: Number(body.amount),
      reason: typeof body.reason === "string" ? body.reason : "",
    });

    reply.send(result);
  });
}
