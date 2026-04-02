import type {DecodedIdToken} from "firebase-admin/auth";
import type {PrismaClient} from "@moads/db";
import type {Auth as FirebaseAuth} from "firebase-admin/auth";
import type {Storage as FirebaseStorage} from "firebase-admin/storage";
import type {FastifyReply, FastifyRequest} from "fastify";

export type RuntimeProfile = "local" | "dev-cloud" | "prod";
export type MotrendProviderMode = "manual" | "stub" | "kling";
export type TaskDispatchMode = "manual" | "internal-http" | "cloud-tasks";
export type AeoAdapterMode = "mock" | "live";
export type DodoEnvironment = "live_mode" | "test_mode";

export interface ApiConfig {
  runtimeProfile: RuntimeProfile;
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  sessionCookieName: string;
  sessionCookieDomain?: string | undefined;
  sessionCookieMaxAgeMs: number;
  sessionCookieSecret: string;
  apiBaseUrl?: string | undefined;
  defaultDevProductCode: string;
  allowedOrigins: string[];
  firebaseProjectId?: string | undefined;
  firebaseStorageBucket?: string | undefined;
  firebaseServiceAccountJson?: string | undefined;
  firebaseAuthEmulatorHost?: string | undefined;
  firebaseStorageEmulatorHost?: string | undefined;
  firebaseUseEmulators: boolean;
  internalApiKey?: string | undefined;
  taskDispatchMode: TaskDispatchMode;
  taskDispatchTimeoutMs: number;
  cloudTasksProjectId?: string | undefined;
  cloudTasksLocation?: string | undefined;
  cloudTasksMotrendSubmitQueue?: string | undefined;
  cloudTasksMotrendPollQueue?: string | undefined;
  cloudTasksMotrendDownloadQueue?: string | undefined;
  cloudTasksInvokerServiceAccountEmail?: string | undefined;
  fsApiUsername?: string | undefined;
  fsApiPassword?: string | undefined;
  fsStoreHost?: string | undefined;
  dodoApiKey?: string | undefined;
  dodoWebhookKey?: string | undefined;
  dodoEnvironment: DodoEnvironment;
  dodoBaseUrl?: string | undefined;
  motrendProviderMode: MotrendProviderMode;
  motrendProviderPollDelayMs: number;
  motrendStubOutputUrl?: string | undefined;
  klingAccessKey?: string | undefined;
  klingSecretKey?: string | undefined;
  klingBaseUrl?: string | undefined;
  klingHttpTimeoutMs: number;
  aeoPublicScanRateLimitPerHour: number;
  aeoPublicScanCacheTtlMs: number;
  aeoAiTipsMode: AeoAdapterMode;
  aeoGa4Mode: AeoAdapterMode;
  aeoRealtimeMode: AeoAdapterMode;
  aeoRealtimeIntervalMs: number;
  aeoOpenAiApiKey?: string | undefined;
  aeoAiTipsModel: string;
}

export interface FirebaseContext {
  auth: FirebaseAuth;
  bucket: ReturnType<FirebaseStorage["bucket"]>;
  bucketName: string;
}

export interface RequestAuthContext {
  userId: string;
  firebaseUid: string;
  email: string | null;
  claims: DecodedIdToken;
}

export interface RequestAccountContext {
  accountId: string;
  realmDefault: string;
}

export interface RequestProductContext {
  productId: string;
  productCode: string;
  realmCode: string;
  entryDomain: string;
}

declare module "fastify" {
  interface FastifyInstance {
    config: ApiConfig;
    prisma: PrismaClient;
    firebase: FirebaseContext;
  }

  interface FastifyRequest {
    authContext?: RequestAuthContext;
    accountContext?: RequestAccountContext;
    productContext?: RequestProductContext;
    rawBody?: string;
  }
}

export type RouteHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
