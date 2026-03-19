import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify from "fastify";

import {getPrismaClient} from "@moads/db";

import {loadConfig} from "./config.js";
import {getFirebaseContext} from "./firebase.js";
import {sendError} from "./lib/http-error.js";
import {registerAdminRoutes} from "./routes/admin.js";
import {registerAnalyticsRoutes} from "./routes/analytics.js";
import {registerAuthRoutes} from "./routes/auth.js";
import {registerHealthRoutes} from "./routes/health.js";
import {registerInternalRoutes} from "./routes/internal.js";
import {registerMotrendRoutes} from "./routes/motrend.js";
import {ApiConfig, FirebaseContext} from "./types.js";

export interface BuildAppOptions {
  config?: ApiConfig;
  firebase?: FirebaseContext;
}

export function isAllowedOrigin(origin: string | undefined, config: Pick<ApiConfig, "allowedOrigins">): boolean {
  if (!origin) {
    return true;
  }

  return config.allowedOrigins.includes(origin);
}

export async function buildApp(options: BuildAppOptions = {}) {
  const config = options.config ?? loadConfig();
  const prisma = getPrismaClient();
  const firebase = options.firebase ?? getFirebaseContext(config);

  const app = Fastify({
    logger: true,
  });

  app.decorate("config", config);
  app.decorate("prisma", prisma);
  app.decorate("firebase", firebase);

  await app.register(cookie, {
    secret: config.sessionCookieSecret,
  });

  await app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      if (isAllowedOrigin(origin, config)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed"), false);
    },
  });

  app.setErrorHandler((error, request, reply) => {
    sendError(error, request, reply);
  });

  await registerHealthRoutes(app);
  await registerInternalRoutes(app);
  await registerAuthRoutes(app);
  await registerAdminRoutes(app);
  await registerAnalyticsRoutes(app);
  await registerMotrendRoutes(app);

  return app;
}
