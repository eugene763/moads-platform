import {PlatformError} from "@moads/db";

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_USER_AGENT = "MOADS-AEO-Scanner/1.0 (+https://moads.agency)";

type ScoreDimension = "access" | "basic_seo" | "ratings_schema";

export interface AeoIssue {
  code: string;
  severity: "low" | "medium" | "high";
  dimension: ScoreDimension;
  pointsLost: number;
  message: string;
}

export interface AeoRecommendation {
  id: string;
  title: string;
  description: string;
  impactScore: number;
  priority: "low" | "medium" | "high";
  locked?: boolean;
}

export interface AeoDeterministicScanResult {
  requestedUrl: string;
  normalizedUrl: string;
  finalUrl: string | null;
  httpStatus: number | null;
  status: "completed" | "blocked";
  confidenceLevel: "low" | "medium" | "high";
  publicScore: number;
  rulesetVersion: string;
  promptVersion: string;
  reportJson: Record<string, unknown>;
  recommendationsJson: AeoRecommendation[];
  extractedFactsJson: Record<string, unknown>;
  issuesJson: AeoIssue[];
  signalBlocksJson: Record<string, unknown>;
  rawFetchMetaJson: Record<string, unknown>;
}

interface AggregateRatingEvidence {
  source: "aggregateRating" | "aggregateNode";
  ratingValue: number | null;
  reviewCount: number | null;
  ratingCount: number | null;
  bestRating: number | null;
  worstRating: number | null;
  raw: Record<string, unknown> | null;
}

interface OnPageRatingEvidence {
  ratingValue: number | null;
  reviewsCount: number | null;
  snippet: string | null;
}

interface FetchMetadata {
  responseMs: number;
  redirected: boolean;
  contentType: string | null;
  bytes: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function sanitizeForJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/\u2028/g, "")
    .replace(/\u2029/g, "");
}

export function normalizeSiteUrl(input: string): {
  requestedUrl: string;
  normalizedUrl: string;
} {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new PlatformError(400, "aeo_site_url_required", "siteUrl is required.");
  }

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new PlatformError(400, "aeo_site_url_invalid", "siteUrl is invalid.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new PlatformError(400, "aeo_site_url_invalid", "Only http and https URLs are supported.");
  }

  parsed.hash = "";
  if (!parsed.pathname) {
    parsed.pathname = "/";
  }

  const normalized = new URL(parsed.toString());
  normalized.hostname = normalized.hostname.toLowerCase();
  if (normalized.pathname.endsWith("/") && normalized.pathname !== "/") {
    normalized.pathname = normalized.pathname.replace(/\/+$/, "");
  }

  return {
    requestedUrl: parsed.toString(),
    normalizedUrl: normalized.toString(),
  };
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#34;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseJsonLdScripts(html: string): Array<Record<string, unknown>> {
  const scripts: Array<Record<string, unknown>> = [];
  const regex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(regex)) {
    const raw = decodeHtmlEntities(match[1] ?? "").trim();
    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw);
      collectJsonNodes(parsed, scripts);
    } catch {
      continue;
    }
  }

  return scripts;
}

function collectJsonNodes(value: unknown, output: Array<Record<string, unknown>>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectJsonNodes(item, output);
    }
    return;
  }

  const record = toRecord(value);
  if (!record) {
    return;
  }

  if (Array.isArray(record["@graph"])) {
    for (const node of record["@graph"] as unknown[]) {
      collectJsonNodes(node, output);
    }
  }

  output.push(record);
}

function hasType(node: Record<string, unknown>, typeName: string): boolean {
  const typeField = node["@type"];
  if (typeof typeField === "string") {
    return typeField.toLowerCase() === typeName.toLowerCase();
  }

  if (Array.isArray(typeField)) {
    return typeField.some((entry) => typeof entry === "string" && entry.toLowerCase() === typeName.toLowerCase());
  }

  return false;
}

function extractAggregateRating(nodes: Array<Record<string, unknown>>): AggregateRatingEvidence | null {
  for (const node of nodes) {
    const aggregate = toRecord(node.aggregateRating);
    if (!aggregate) {
      continue;
    }

    return {
      source: "aggregateRating",
      ratingValue: asNumber(aggregate.ratingValue),
      reviewCount: asNumber(aggregate.reviewCount),
      ratingCount: asNumber(aggregate.ratingCount),
      bestRating: asNumber(aggregate.bestRating),
      worstRating: asNumber(aggregate.worstRating),
      raw: aggregate,
    };
  }

  for (const node of nodes) {
    if (!hasType(node, "AggregateRating")) {
      continue;
    }

    return {
      source: "aggregateNode",
      ratingValue: asNumber(node.ratingValue),
      reviewCount: asNumber(node.reviewCount),
      ratingCount: asNumber(node.ratingCount),
      bestRating: asNumber(node.bestRating),
      worstRating: asNumber(node.worstRating),
      raw: node,
    };
  }

  return null;
}

function extractTitle(html: string): string | null {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return asText(titleMatch?.[1]?.replace(/\s+/g, " ") ?? null);
}

function extractMetaContent(html: string, name: string, attr = "name"): string | null {
  const pattern = new RegExp(`<meta\\b[^>]*${attr}=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i");
  const match = html.match(pattern);
  return asText(match?.[1] ?? null);
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractOnPageEvidence(html: string): OnPageRatingEvidence {
  const text = stripHtml(html);
  const ratingMatch = text.match(/\b([0-5](?:[\.,]\d{1,2})?)\s*(?:\/\s*5|out of 5|stars?)\b/i)
    ?? text.match(/\b([0-5](?:[\.,]\d{1,2})?)\s*★/i);
  const reviewsMatch = text.match(/\b([0-9]{1,7})\s*(reviews?|ratings?|отзывов?|оценок?)\b/i);

  const ratingValue = ratingMatch ? asNumber(ratingMatch[1]) : null;
  const reviewsCount = reviewsMatch ? asNumber(reviewsMatch[1]) : null;
  const snippetStart = ratingMatch?.index ?? reviewsMatch?.index;

  let snippet: string | null = null;
  if (typeof snippetStart === "number" && snippetStart >= 0) {
    const from = clamp(snippetStart - 50, 0, text.length);
    const to = clamp(snippetStart + 120, 0, text.length);
    snippet = text.slice(from, to).trim();
  }

  return {
    ratingValue,
    reviewsCount,
    snippet,
  };
}

function calculateScore(input: {
  httpStatus: number | null;
  hasTitle: boolean;
  hasDescription: boolean;
  hasCanonical: boolean;
  hasOgTitle: boolean;
  hasAggregate: boolean;
  hasRatingValue: boolean;
  hasCount: boolean;
  validScale: boolean;
  hasVisibleEvidence: boolean;
  consistentEvidence: boolean;
}): {
  total: number;
  access: number;
  basicSeo: number;
  ratingsSchema: number;
} {
  let access = 0;
  if (input.httpStatus != null) {
    if (input.httpStatus >= 200 && input.httpStatus < 300) {
      access = 30;
    } else if (input.httpStatus >= 300 && input.httpStatus < 400) {
      access = 24;
    } else if (input.httpStatus >= 400 && input.httpStatus < 500) {
      access = 8;
    }
  }

  let basicSeo = 0;
  if (input.hasTitle) {
    basicSeo += 8;
  }
  if (input.hasDescription) {
    basicSeo += 8;
  }
  if (input.hasCanonical) {
    basicSeo += 7;
  }
  if (input.hasOgTitle) {
    basicSeo += 7;
  }

  let ratingsSchema = 0;
  if (input.hasAggregate) {
    ratingsSchema += 15;
  }
  if (input.hasCount) {
    ratingsSchema += 10;
  }
  if (input.hasRatingValue && input.validScale) {
    ratingsSchema += 8;
  }
  if (input.hasVisibleEvidence) {
    ratingsSchema += 4;
  }
  if (input.consistentEvidence) {
    ratingsSchema += 3;
  }

  const total = clamp(access + basicSeo + ratingsSchema, 0, 100);
  return {total, access, basicSeo, ratingsSchema};
}

function buildRecommendations(issues: AeoIssue[]): AeoRecommendation[] {
  const recommendations: AeoRecommendation[] = [];

  const hasIssue = (code: string) => issues.some((issue) => issue.code === code);

  if (hasIssue("aggregate_rating_missing")) {
    recommendations.push({
      id: "add_aggregate_rating",
      title: "Add Product/AggregateRating schema",
      description: "Publish JSON-LD with ratingValue and at least one of reviewCount/ratingCount on the same product page.",
      impactScore: 9,
      priority: "high",
    });
  }

  if (hasIssue("aggregate_count_missing")) {
    recommendations.push({
      id: "add_review_count",
      title: "Add reviewCount or ratingCount",
      description: "Google review snippets require a rating count signal. Add reviewCount or ratingCount in schema and keep it updated.",
      impactScore: 8,
      priority: "high",
    });
  }

  if (hasIssue("aggregate_visible_mismatch")) {
    recommendations.push({
      id: "align_visible_and_schema",
      title: "Align visible rating with schema",
      description: "Keep on-page rating/review totals in sync with structured data to reduce trust and eligibility risk.",
      impactScore: 8,
      priority: "high",
    });
  }

  if (hasIssue("meta_description_missing") || hasIssue("title_missing")) {
    recommendations.push({
      id: "improve_basic_meta",
      title: "Tighten title and description",
      description: "Add a clear page title and meta description to improve crawl interpretation and snippet quality.",
      impactScore: 6,
      priority: "medium",
    });
  }

  if (hasIssue("canonical_missing")) {
    recommendations.push({
      id: "set_canonical",
      title: "Set canonical URL",
      description: "Add a canonical tag so engines can unify duplicate variants and preserve page signals.",
      impactScore: 5,
      priority: "medium",
    });
  }

  if (hasIssue("js_heavy_low_confidence")) {
    recommendations.push({
      id: "server_render_core_facts",
      title: "Expose key facts in raw HTML",
      description: "Move core product facts and rating evidence into server-rendered HTML. JS-only data can be missed by lightweight crawlers.",
      impactScore: 5,
      priority: "medium",
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: "monitor_schema_consistency",
      title: "Monitor schema and on-page consistency",
      description: "Keep ratings markup and visible values synchronized after catalog/template updates.",
      impactScore: 3,
      priority: "low",
    });
  }

  return recommendations.sort((a, b) => b.impactScore - a.impactScore);
}

function buildIssue(
  code: string,
  severity: AeoIssue["severity"],
  dimension: ScoreDimension,
  pointsLost: number,
  message: string,
): AeoIssue {
  return {code, severity, dimension, pointsLost, message};
}

function evaluateAeoHtml(input: {
  requestedUrl: string;
  normalizedUrl: string;
  finalUrl: string | null;
  httpStatus: number | null;
  html: string;
  fetchMeta: FetchMetadata;
  blocked: boolean;
}): AeoDeterministicScanResult {
  const title = extractTitle(input.html);
  const description = extractMetaContent(input.html, "description");
  const canonical = extractMetaContent(input.html, "canonical", "rel");
  const ogTitle = extractMetaContent(input.html, "og:title", "property") ?? extractMetaContent(input.html, "twitter:title", "name");

  const jsonLdNodes = parseJsonLdScripts(input.html);
  const aggregate = extractAggregateRating(jsonLdNodes);
  const onPage = extractOnPageEvidence(input.html);

  const bestRating = aggregate?.bestRating ?? 5;
  const worstRating = aggregate?.worstRating ?? 1;
  const hasCount = (aggregate?.reviewCount ?? 0) > 0 || (aggregate?.ratingCount ?? 0) > 0;
  const hasVisibleEvidence = onPage.ratingValue != null || onPage.reviewsCount != null;

  const validScale = (() => {
    if (!aggregate?.ratingValue) {
      return false;
    }

    if (bestRating <= worstRating) {
      return false;
    }

    return aggregate.ratingValue >= worstRating && aggregate.ratingValue <= bestRating;
  })();

  const consistentEvidence = (() => {
    if (!aggregate?.ratingValue || !onPage.ratingValue) {
      return false;
    }

    const delta = Math.abs(aggregate.ratingValue - onPage.ratingValue);
    if (delta > 0.35) {
      return false;
    }

    if (aggregate.reviewCount && onPage.reviewsCount) {
      const gap = Math.abs(aggregate.reviewCount - onPage.reviewsCount);
      if (gap > Math.max(25, aggregate.reviewCount * 0.2)) {
        return false;
      }
    }

    return true;
  })();

  const score = calculateScore({
    httpStatus: input.httpStatus,
    hasTitle: Boolean(title),
    hasDescription: Boolean(description),
    hasCanonical: Boolean(canonical),
    hasOgTitle: Boolean(ogTitle),
    hasAggregate: Boolean(aggregate),
    hasRatingValue: Boolean(aggregate?.ratingValue),
    hasCount,
    validScale,
    hasVisibleEvidence,
    consistentEvidence,
  });

  const issues: AeoIssue[] = [];

  if (input.blocked) {
    issues.push(buildIssue(
      "fetch_blocked",
      "high",
      "access",
      30,
      "Page could not be fetched (blocked/challenge/timeout).",
    ));
  }

  if (!title) {
    issues.push(buildIssue("title_missing", "medium", "basic_seo", 8, "Missing <title> tag."));
  }

  if (!description) {
    issues.push(buildIssue("meta_description_missing", "medium", "basic_seo", 8, "Missing meta description."));
  }

  if (!canonical) {
    issues.push(buildIssue("canonical_missing", "low", "basic_seo", 7, "Missing canonical signal."));
  }

  if (!aggregate) {
    issues.push(buildIssue(
      "aggregate_rating_missing",
      "high",
      "ratings_schema",
      15,
      "AggregateRating data was not found in JSON-LD.",
    ));
  } else {
    if (!hasCount) {
      issues.push(buildIssue(
        "aggregate_count_missing",
        "high",
        "ratings_schema",
        10,
        "AggregateRating has no reviewCount/ratingCount.",
      ));
    }

    if (!validScale) {
      issues.push(buildIssue(
        "aggregate_scale_invalid",
        "high",
        "ratings_schema",
        8,
        "ratingValue is missing or outside the declared rating scale.",
      ));
    }

    if (hasVisibleEvidence && !consistentEvidence) {
      issues.push(buildIssue(
        "aggregate_visible_mismatch",
        "high",
        "ratings_schema",
        6,
        "Structured rating evidence does not match visible page evidence.",
      ));
    }
  }

  const stripped = stripHtml(input.html);
  const scriptCount = (input.html.match(/<script\b/gi) ?? []).length;
  const likelyJsHeavy = stripped.length < 500 && scriptCount > 15;

  if (likelyJsHeavy) {
    issues.push(buildIssue(
      "js_heavy_low_confidence",
      "medium",
      "access",
      3,
      "The page appears JS-heavy in raw HTML. Some facts may be missing without rendered mode.",
    ));
  }

  const recommendations = buildRecommendations(issues);

  const ratingStatus = input.blocked ?
    "blocked" :
    !aggregate ?
      "missing" :
      !hasCount || !validScale || (hasVisibleEvidence && !consistentEvidence) ?
        "risk" :
        "ok";

  const confidenceLevel: "low" | "medium" | "high" = input.blocked || likelyJsHeavy ?
    "low" :
    stripped.length > 2_000 ?
      "high" :
      "medium";

  const reportJson = {
    summary: {
      score: score.total,
      scoreVersion: "aeo_score_v1",
      status: input.blocked ? "blocked" : "completed",
      ratingSchemaStatus: ratingStatus,
      confidenceLevel,
    },
    dimensions: {
      access: score.access,
      basicSeo: score.basicSeo,
      ratingsSchema: score.ratingsSchema,
    },
    evidence: {
      structuredData: {
        aggregateRating: aggregate,
      },
      onPage,
      notes: [
        "raw_html_mode",
        "structured_data_validity_does_not_guarantee_rich_results",
      ],
    },
    topFixes: recommendations.slice(0, 5),
  } satisfies Record<string, unknown>;

  const extractedFactsJson = {
    title,
    description,
    canonical,
    ogTitle,
    aggregateRating: aggregate,
    onPage,
  } satisfies Record<string, unknown>;

  const signalBlocksJson = {
    ratingSchemaStatus: ratingStatus,
    likelyJsHeavy,
    hasJsonLd: jsonLdNodes.length > 0,
  } satisfies Record<string, unknown>;

  const rawFetchMetaJson = {
    responseMs: input.fetchMeta.responseMs,
    redirected: input.fetchMeta.redirected,
    contentType: input.fetchMeta.contentType,
    bytes: input.fetchMeta.bytes,
    finalUrl: input.finalUrl,
    httpStatus: input.httpStatus,
    parserVersion: "aeo_parser_v1",
  } satisfies Record<string, unknown>;

  return {
    requestedUrl: input.requestedUrl,
    normalizedUrl: input.normalizedUrl,
    finalUrl: input.finalUrl,
    httpStatus: input.httpStatus,
    status: input.blocked ? "blocked" : "completed",
    confidenceLevel,
    publicScore: score.total,
    rulesetVersion: "aeo_rules_v1",
    promptVersion: "deterministic_v1",
    reportJson,
    recommendationsJson: recommendations,
    extractedFactsJson,
    issuesJson: issues,
    signalBlocksJson,
    rawFetchMetaJson,
  };
}

export async function runAeoDeterministicScan(input: {
  siteUrl: string;
  timeoutMs?: number;
  userAgent?: string;
  fetchImpl?: typeof fetch;
}): Promise<AeoDeterministicScanResult> {
  const {requestedUrl, normalizedUrl} = normalizeSiteUrl(input.siteUrl);
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = input.fetchImpl ?? fetch;

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const startedAt = Date.now();
  let response: Response;
  let html = "";
  let blocked = false;
  try {
    response = await fetchImpl(requestedUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": input.userAgent ?? DEFAULT_USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
    });

    html = await response.text();
  } catch (error) {
    clearTimeout(timeout);
    const responseMs = Date.now() - startedAt;

    return evaluateAeoHtml({
      requestedUrl,
      normalizedUrl,
      finalUrl: null,
      httpStatus: null,
      html: "",
      blocked: true,
      fetchMeta: {
        responseMs,
        redirected: false,
        contentType: null,
        bytes: 0,
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  const responseMs = Date.now() - startedAt;
  const httpStatus = response.status;
  const contentType = response.headers.get("content-type");

  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429 || httpStatus >= 500) {
    blocked = true;
  }

  const finalUrl = response.url || requestedUrl;

  return evaluateAeoHtml({
    requestedUrl,
    normalizedUrl,
    finalUrl,
    httpStatus,
    html,
    blocked,
    fetchMeta: {
      responseMs,
      redirected: response.redirected,
      contentType,
      bytes: Buffer.byteLength(html),
    },
  });
}

export function serializeAeoResultForPrompt(result: AeoDeterministicScanResult): string {
  return sanitizeForJson({
    summary: {
      score: result.publicScore,
      status: result.status,
      confidenceLevel: result.confidenceLevel,
    },
    extractedFacts: result.extractedFactsJson,
    issues: result.issuesJson,
    recommendations: result.recommendationsJson,
  });
}
