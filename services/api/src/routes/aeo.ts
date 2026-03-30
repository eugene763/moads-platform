import {
  Prisma,
  claimAeoScan,
  consumeAeoStarterOfferState,
  createAeoPublicScan,
  createAeoSite,
  createAeoWaitlistRequest,
  fulfillBillingOrderManually,
  getAeoPublicScanByToken,
  getAeoScanById,
  getOrCreateAeoStarterOfferState,
  listAeoScans,
  listAeoSites,
  listBillingCreditPackOffers,
  listBillingOrders,
  PlatformError,
  saveAeoAiTips,
  upsertAeoMonitoringSnapshot,
} from "@moads/db";
import {FastifyInstance, FastifyRequest} from "fastify";

import {
  createAeoAiTipsAdapter,
  createAeoGaAdapter,
  createAeoRealtimeAdapter,
} from "../lib/aeo-adapters.js";
import {createBillingCheckoutResponse, normalizeCheckoutAttribution} from "../lib/billing-checkout.js";
import {maskUnavailableCheckoutOffers} from "../lib/billing-offers.js";
import {
  normalizeSiteUrl,
  runAeoDeterministicScan,
} from "../lib/aeo-scanner.js";
import {requireProductMembership} from "../middleware/access.js";
import {requireAdminClaim} from "../middleware/admin.js";
import {requireAuth, resolveAccount} from "../middleware/auth.js";

interface RateBucket {
  windowStartMs: number;
  count: number;
}

const PUBLIC_SCAN_WINDOW_MS = 60 * 60 * 1000;
const publicScanRateBuckets = new Map<string, RateBucket>();

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function assertRateLimit(ipKey: string, limitPerHour: number): void {
  const now = Date.now();

  for (const [key, bucket] of publicScanRateBuckets) {
    if (now - bucket.windowStartMs > PUBLIC_SCAN_WINDOW_MS * 2) {
      publicScanRateBuckets.delete(key);
    }
  }

  const bucket = publicScanRateBuckets.get(ipKey);
  if (!bucket || now - bucket.windowStartMs > PUBLIC_SCAN_WINDOW_MS) {
    publicScanRateBuckets.set(ipKey, {
      windowStartMs: now,
      count: 1,
    });
    return;
  }

  if (bucket.count >= limitPerHour) {
    throw new PlatformError(429, "aeo_public_scan_rate_limited", "Public scan rate limit exceeded. Try again later.");
  }

  bucket.count += 1;
}

function readPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw new PlatformError(400, "invalid_email", "email is required.");
  }

  const email = value.trim().toLowerCase();
  if (!email || !email.includes("@") || email.length > 320) {
    throw new PlatformError(400, "invalid_email", "email is invalid.");
  }

  return email;
}

async function tryResolveAuthContext(request: FastifyRequest) {
  const sessionCookie = request.cookies[request.server.config.sessionCookieName];
  if (!sessionCookie) {
    return null;
  }

  try {
    const decoded = await request.server.firebase.auth.verifySessionCookie(sessionCookie, true);
    const user = await request.server.prisma.identityUser.findUnique({
      where: {firebaseUid: decoded.uid},
    });

    if (!user) {
      return null;
    }

    const membership = await request.server.prisma.accountMember.findFirst({
      where: {
        userId: user.id,
        status: "active",
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return {
      userId: user.id,
      accountId: membership?.accountId ?? null,
    };
  } catch {
    return null;
  }
}

export async function registerAeoRoutes(app: FastifyInstance): Promise<void> {
  const authGuards = [requireAuth, resolveAccount, requireProductMembership("aeo")];
  const aiTipsAdapter = createAeoAiTipsAdapter(app.config);
  const gaAdapter = createAeoGaAdapter(app.config);
  const realtimeAdapter = createAeoRealtimeAdapter(app.config);

  app.post("/aeo/public-scans", async (request, reply) => {
    const ipKey = request.ip || request.headers["x-forwarded-for"] || "unknown";
    assertRateLimit(String(ipKey), app.config.aeoPublicScanRateLimitPerHour);

    const body = request.body as {
      siteUrl?: unknown;
      anonymousSessionId?: unknown;
      brandName?: unknown;
      category?: unknown;
      workEmail?: unknown;
    } | undefined;

    if (typeof body?.siteUrl !== "string") {
      throw new PlatformError(400, "aeo_site_url_required", "siteUrl is required.");
    }

    const normalized = normalizeSiteUrl(body.siteUrl);
    const cacheCutoff = new Date(Date.now() - app.config.aeoPublicScanCacheTtlMs);

    const cached = await app.prisma.aeoScan.findFirst({
      where: {
        normalizedUrl: normalized.normalizedUrl,
        createdAt: {
          gte: cacheCutoff,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (cached) {
      reply.send({
        scanId: cached.id,
        publicToken: cached.publicToken,
        resultUrl: `/aeo/r/${cached.publicToken}`,
        cached: true,
        status: cached.status.toLowerCase(),
      });
      return;
    }

    const scan = await runAeoDeterministicScan({
      siteUrl: normalized.requestedUrl,
    });

    const created = await createAeoPublicScan(app.prisma, {
      anonymousSessionId: typeof body.anonymousSessionId === "string" ? body.anonymousSessionId.trim() || null : null,
      siteUrl: scan.requestedUrl,
      normalizedUrl: scan.normalizedUrl,
      finalUrl: scan.finalUrl,
      httpStatus: scan.httpStatus,
      status: scan.status,
      publicScore: scan.publicScore,
      confidenceLevel: scan.confidenceLevel,
      scoreVersion: "aeo_score_v1",
      reportJson: toInputJson(scan.reportJson),
      recommendationsJson: toInputJson(scan.recommendationsJson),
      extractedFactsJson: toInputJson(scan.extractedFactsJson),
      issuesJson: toInputJson(scan.issuesJson),
      signalBlocksJson: toInputJson(scan.signalBlocksJson),
      rawFetchMetaJson: toInputJson({
        ...scan.rawFetchMetaJson,
        lead: {
          brandName: typeof body.brandName === "string" ? body.brandName.trim() : null,
          category: typeof body.category === "string" ? body.category.trim() : null,
          workEmail: typeof body.workEmail === "string" ? body.workEmail.trim().toLowerCase() : null,
        },
      }),
      rulesetVersion: scan.rulesetVersion,
      promptVersion: scan.promptVersion,
    });

    reply.status(201).send({
      ...created,
      cached: false,
      status: scan.status,
    });
  });

  app.get("/aeo/public-scans/:publicToken", async (request, reply) => {
    const params = request.params as {publicToken?: unknown};
    if (typeof params.publicToken !== "string" || !params.publicToken.trim()) {
      throw new PlatformError(400, "public_token_required", "publicToken is required.");
    }

    const report = await getAeoPublicScanByToken(app.prisma, params.publicToken.trim());

    reply.send({
      ...report,
      planVisibility: {
        free: {
          scoreVisible: true,
          recommendationsUnlocked: 3,
        },
        starter: {
          recommendationsUnlocked: "all",
          includesGa4: true,
          includesRealtime: true,
        },
      },
    });
  });

  app.post("/aeo/waitlist", async (request, reply) => {
    const body = request.body as {
      email?: unknown;
      requestedPlanCode?: unknown;
      siteUrl?: unknown;
      notes?: unknown;
    } | undefined;

    const auth = await tryResolveAuthContext(request);
    const created = await createAeoWaitlistRequest(app.prisma, {
      email: normalizeEmail(body?.email),
      requestedPlanCode: typeof body?.requestedPlanCode === "string" ? body.requestedPlanCode.trim().toLowerCase() : "starter",
      siteUrl: typeof body?.siteUrl === "string" ? body.siteUrl.trim() || null : null,
      notes: typeof body?.notes === "string" ? body.notes.trim() || null : null,
      accountId: auth?.accountId ?? null,
      userId: auth?.userId ?? null,
    });

    reply.status(201).send(created);
  });

  app.post("/aeo/scans/:scanId/claim", {preHandler: authGuards}, async (request, reply) => {
    if (!request.accountContext || !request.authContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const params = request.params as {scanId?: unknown};
    if (typeof params.scanId !== "string" || !params.scanId.trim()) {
      throw new PlatformError(400, "scan_id_required", "scanId is required.");
    }

    const claimed = await claimAeoScan(app.prisma, {
      accountId: request.accountContext.accountId,
      userId: request.authContext.userId,
      scanId: params.scanId.trim(),
    });

    reply.send(claimed);
  });

  app.get("/aeo/scans", {preHandler: authGuards}, async (request, reply) => {
    if (!request.accountContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const query = request.query as {limit?: unknown};
    const scans = await listAeoScans(app.prisma, {
      accountId: request.accountContext.accountId,
      limit: readPositiveInt(query?.limit, 20),
    });

    reply.send({scans});
  });

  app.get("/aeo/scans/:scanId", {preHandler: authGuards}, async (request, reply) => {
    if (!request.accountContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const params = request.params as {scanId?: unknown};
    if (typeof params.scanId !== "string" || !params.scanId.trim()) {
      throw new PlatformError(400, "scan_id_required", "scanId is required.");
    }

    const scan = await getAeoScanById(app.prisma, {
      accountId: request.accountContext.accountId,
      scanId: params.scanId.trim(),
    });

    reply.send(scan);
  });

  app.post("/aeo/scans/:scanId/generate-ai-tips", {preHandler: authGuards}, async (request, reply) => {
    if (!request.accountContext || !request.authContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const params = request.params as {scanId?: unknown};
    if (typeof params.scanId !== "string" || !params.scanId.trim()) {
      throw new PlatformError(400, "scan_id_required", "scanId is required.");
    }

    const body = request.body as {
      planCode?: unknown;
      idempotencyKey?: unknown;
    } | undefined;

    const scan = await getAeoScanById(app.prisma, {
      accountId: request.accountContext.accountId,
      scanId: params.scanId.trim(),
    });

    const planCode = body?.planCode === "starter" ? "starter" : "free";

    const generated = await aiTipsAdapter.generateTips({
      planCode,
      scanSummary: JSON.stringify({
        score: scan.publicScore,
        issues: scan.issues,
        extractedFacts: scan.extractedFacts,
      }),
    });

    const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    const operationKey = idempotencyKey ? `aeo_ai_tips:${scan.scanId}:${idempotencyKey}` : null;

    const saved = await saveAeoAiTips(app.prisma, {
      accountId: request.accountContext.accountId,
      userId: request.authContext.userId,
      scanId: scan.scanId,
      aiTipsJson: {
        mode: app.config.aeoAiTipsMode,
        generatedAt: new Date().toISOString(),
        tips: generated.tips,
      } as unknown as Prisma.InputJsonValue,
      providerCode: generated.providerCode,
      modelCode: generated.modelCode,
      creditsCharged: 1,
      internalCostMinor: generated.internalCostMinor,
      chargeOperationKey: operationKey,
    });

    reply.send({
      tips: generated.tips,
      chargedCredits: saved.chargedCredits,
      alreadyCharged: saved.alreadyCharged,
      wallet: saved.wallet,
      mode: app.config.aeoAiTipsMode,
    });
  });

  app.get("/aeo/sites", {preHandler: authGuards}, async (request, reply) => {
    if (!request.accountContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const sites = await listAeoSites(app.prisma, {
      accountId: request.accountContext.accountId,
    });

    reply.send({sites});
  });

  app.post("/aeo/sites", {preHandler: authGuards}, async (request, reply) => {
    if (!request.accountContext || !request.authContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const body = request.body as {
      rootUrl?: unknown;
      displayName?: unknown;
      siteTypeGuess?: unknown;
    } | undefined;

    if (typeof body?.rootUrl !== "string" || !body.rootUrl.trim()) {
      throw new PlatformError(400, "root_url_required", "rootUrl is required.");
    }

    const site = await createAeoSite(app.prisma, {
      accountId: request.accountContext.accountId,
      userId: request.authContext.userId,
      rootUrl: body.rootUrl,
      displayName: typeof body.displayName === "string" ? body.displayName.trim() || null : null,
      siteTypeGuess: typeof body.siteTypeGuess === "string" ? body.siteTypeGuess.trim().toLowerCase() || null : null,
    });

    reply.status(201).send(site);
  });

  app.get("/aeo/offers/starter", {preHandler: authGuards}, async (request, reply) => {
    if (!request.accountContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const offer = await getOrCreateAeoStarterOfferState(app.prisma, {
      accountId: request.accountContext.accountId,
    });

    reply.send({offer});
  });

  app.post("/aeo/offers/starter/consume", {preHandler: authGuards}, async (request, reply) => {
    if (!request.accountContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const offer = await consumeAeoStarterOfferState(app.prisma, {
      accountId: request.accountContext.accountId,
    });

    reply.send({offer});
  });

  app.get("/aeo/pricing/credit-packs", {preHandler: authGuards}, async (_request, reply) => {
    const packs = maskUnavailableCheckoutOffers(app.config, await listBillingCreditPackOffers(app.prisma, {
      productCode: "aeo",
    })).map(({providerCode: _providerCode, ...pack}) => pack);

    reply.send({packs});
  });

  app.get("/aeo/orders", {preHandler: authGuards}, async (request, reply) => {
    if (!request.accountContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const orders = await listBillingOrders(app.prisma, {
      accountId: request.accountContext.accountId,
      productCode: "aeo",
      limit: 30,
    });

    reply.send({orders});
  });

  app.post("/aeo/orders/checkout", {preHandler: authGuards}, async (request, reply) => {
    if (!request.accountContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const body = request.body as {
      priceId?: unknown;
      attribution?: unknown;
    } | undefined;

    if (typeof body?.priceId !== "string" || !body.priceId.trim()) {
      throw new PlatformError(400, "billing_price_required", "priceId is required.");
    }

    const order = await createBillingCheckoutResponse(app, {
      accountId: request.accountContext.accountId,
      productCode: "aeo",
      priceId: body.priceId.trim(),
      userId: request.authContext?.userId ?? null,
      firebaseUid: request.authContext?.firebaseUid ?? null,
      email: request.authContext?.email ?? null,
      attribution: normalizeCheckoutAttribution(body?.attribution),
    });

    reply.status(201).send(order);
  });

  app.post("/aeo/orders/:orderId/manual-fulfill", {
    preHandler: [requireAuth, requireAdminClaim],
  }, async (request, reply) => {
    if (!request.authContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const params = request.params as {orderId?: unknown};
    if (typeof params.orderId !== "string" || !params.orderId.trim()) {
      throw new PlatformError(400, "order_id_required", "orderId is required.");
    }

    const body = request.body as {
      note?: unknown;
    } | undefined;

    const result = await fulfillBillingOrderManually(app.prisma, {
      orderId: params.orderId.trim(),
      fulfilledByUserId: request.authContext.userId,
      note: typeof body?.note === "string" ? body.note.trim() || null : null,
    });

    reply.send(result);
  });

  app.get("/aeo/evidence/ga4", {preHandler: authGuards}, async (request, reply) => {
    if (!request.accountContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const query = request.query as {siteId?: unknown};
    const siteId = typeof query?.siteId === "string" ? query.siteId.trim() || null : null;

    const snapshot = await gaAdapter.getSnapshot({
      accountId: request.accountContext.accountId,
      siteId,
    });

    await upsertAeoMonitoringSnapshot(app.prisma, {
      accountId: request.accountContext.accountId,
      siteId,
      sourceCode: "ga4",
      dataJson: toInputJson(snapshot),
    });

    reply.send({snapshot});
  });

  app.get("/aeo/realtime/stream", {preHandler: authGuards}, async (request, reply) => {
    if (!request.accountContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const query = request.query as {siteId?: unknown};
    const siteId = typeof query?.siteId === "string" ? query.siteId.trim() || null : null;

    reply.hijack();
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");

    const sendEvent = (event: string, payload: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const heartbeat = setInterval(() => {
      reply.raw.write(": heartbeat\n\n");
    }, 15_000);

    const emitSnapshot = async () => {
      const realtime = await realtimeAdapter.getSnapshot({
        accountId: request.accountContext!.accountId,
        siteId,
      });
      const ga = await gaAdapter.getSnapshot({
        accountId: request.accountContext!.accountId,
        siteId,
      });

      await upsertAeoMonitoringSnapshot(app.prisma, {
        accountId: request.accountContext!.accountId,
        siteId,
        sourceCode: "realtime",
        dataJson: toInputJson(realtime),
      });

      await upsertAeoMonitoringSnapshot(app.prisma, {
        accountId: request.accountContext!.accountId,
        siteId,
        sourceCode: "ga4",
        dataJson: toInputJson(ga),
      });

      sendEvent("snapshot", {
        realtime,
        ga,
      });
    };

    try {
      sendEvent("ready", {
        mode: {
          realtime: app.config.aeoRealtimeMode,
          ga4: app.config.aeoGa4Mode,
        },
      });

      await emitSnapshot();
    } catch (error) {
      sendEvent("error", {
        message: error instanceof Error ? error.message : "snapshot_failed",
      });
    }

    const interval = setInterval(async () => {
      try {
        await emitSnapshot();
      } catch (error) {
        sendEvent("error", {
          message: error instanceof Error ? error.message : "snapshot_failed",
        });
      }
    }, app.config.aeoRealtimeIntervalMs);

    request.raw.on("close", () => {
      clearInterval(interval);
      clearInterval(heartbeat);
    });
  });
}
