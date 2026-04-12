export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.moads.agency";

export interface PublicScanResponse {
  scanId: string;
  publicToken: string;
  resultUrl: string;
  status: string;
  cached: boolean;
}

export interface PublicScanReport {
  scanId: string;
  publicToken: string;
  publicScore: number | null;
  status: string;
  confidenceLevel: string | null;
  recommendationsLocked: boolean;
  lockedRecommendationsCount: number;
  report: {
    summary?: {
      ratingSchemaStatus?: string;
      scanModeNote?: string | null;
    };
    dimensions?: {
      access?: number;
      basicSeo?: number;
      ratingsSchema?: number;
    };
    evidence?: {
      structuredData?: {
        aggregateRating?: {
          ratingValue?: number;
          reviewCount?: number;
          ratingCount?: number;
        };
      };
      onPage?: {
        ratingValue?: number;
        reviewsCount?: number;
        snippet?: string | null;
      };
      crawlability?: {
        robotsExists?: boolean;
        sitemapExists?: boolean;
        aiBots?: Record<string, {allowed?: boolean; explicitly?: boolean; reachable?: boolean | null}>;
      };
      productPage?: {
        sampled?: boolean;
        source?: string;
        url?: string | null;
        title?: string | null;
        aggregateRating?: {
          ratingValue?: number;
          reviewCount?: number;
          ratingCount?: number;
        } | null;
        onPage?: {
          ratingValue?: number;
          reviewsCount?: number;
          snippet?: string | null;
        } | null;
      };
      notes?: string[];
    };
    actionPlan?: {
      topIssues?: Array<{
        code: string;
        message: string;
        severity: string;
        dimension: string;
        pointsLost: number;
      }>;
      fastestWin?: {
        id: string;
        title: string;
        description: string;
        impactScore: number;
        priority: string;
      } | null;
      priorityFixes?: Array<{
        id: string;
        title: string;
        description: string;
        impactScore: number;
        priority: string;
      }>;
    };
    promptKit?: {
      mode?: string;
      prompts?: Array<{
        id: string;
        title: string;
        engine: string;
        prompt: string;
      }>;
    };
  };
  recommendations: Array<{
    id: string;
    title: string;
    description: string;
    impactScore: number;
    priority: string;
  }>;
  issues: Array<{
    code: string;
    severity: string;
    message: string;
  }>;
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = (payload as {error?: {message?: string}}).error?.message ?? `Request failed (${response.status})`;
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return await response.json() as T;
}
