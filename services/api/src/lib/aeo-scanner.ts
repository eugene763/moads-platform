import {PlatformError} from "@moads/db";

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
const DEFAULT_ACCEPT_LANGUAGE = "en-US,en;q=0.9";
const AI_BOTS = [
  {name: "GPTBot", agent: "GPTBot"},
  {name: "ClaudeBot", agent: "ClaudeBot"},
  {name: "Google-Extended", agent: "Google-Extended"},
  {name: "PerplexityBot", agent: "PerplexityBot"},
] as const;

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

interface CrawlabilityBotEvidence {
  allowed: boolean;
  explicitly: boolean;
  reachable: boolean | null;
  statusCode: number | null;
}

interface CrawlabilityEvidence {
  robotsUrl: string;
  robotsExists: boolean;
  allowsAll: boolean;
  sitemapUrl: string | null;
  sitemapExists: boolean;
  sitemapCandidates: string[];
  aiBots: Record<string, CrawlabilityBotEvidence>;
}

interface ProductPageSampleEvidence {
  sampled: boolean;
  source: "homepage_link" | "sitemap" | "none";
  url: string | null;
  title: string | null;
  aggregateRating: AggregateRatingEvidence | null;
  onPage: OnPageRatingEvidence | null;
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

function parseAIBotRules(robotsText: string): Record<string, {allowed: boolean; explicitly: boolean}> {
  const result: Record<string, {allowed: boolean; explicitly: boolean}> = {};
  let currentAgents: string[] = [];
  let previousWasUserAgent = false;

  for (const rawLine of robotsText.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    if (/^user-agent:/i.test(line)) {
      const agent = line.replace(/^user-agent:\s*/i, "").trim();
      currentAgents = previousWasUserAgent ? [...currentAgents, agent] : [agent];
      previousWasUserAgent = true;
      continue;
    }

    previousWasUserAgent = false;

    const directive = line.split(":")[0]?.trim().toLowerCase();
    const value = line.replace(/^[^:]+:/, "").trim();
    if (!directive || !currentAgents.length) {
      continue;
    }

    if (directive !== "allow" && directive !== "disallow") {
      continue;
    }

    for (const currentAgent of currentAgents) {
      for (const bot of AI_BOTS) {
        const matchesWildcard = currentAgent === "*";
        const matchesBot = currentAgent.toLowerCase() === bot.agent.toLowerCase();
        if (!matchesWildcard && !matchesBot) {
          continue;
        }

        const isAllowed = directive === "allow";
        if (matchesWildcard) {
          if (!result[bot.name]?.explicitly) {
            result[bot.name] = {
              allowed: isAllowed,
              explicitly: false,
            };
          }
          continue;
        }

        result[bot.name] = {
          allowed: isAllowed,
          explicitly: true,
        };
      }
    }
  }

  for (const bot of AI_BOTS) {
    if (!result[bot.name]) {
      result[bot.name] = {
        allowed: true,
        explicitly: false,
      };
    }
  }

  return result;
}

function extractSitemapUrls(robotsText: string): string[] {
  const matches = robotsText.match(/Sitemap:\s*(https?:\/\/[^\s]+)/gi) ?? [];
  return matches.map((value) => value.replace(/^Sitemap:\s*/i, "").trim());
}

function isRetryableStatus(status: number | null): boolean {
  return status == null || status === 408 || status === 425 || status === 429 || status >= 500;
}

function hasNonHtmlExtension(pathname: string): boolean {
  return /\.(xml|xsl|txt|json|rss|atom|pdf|csv|zip|jpg|jpeg|png|webp|gif|svg|ico|mp4|mp3|mov|webm)$/i.test(pathname);
}

function isTechnicalDiscoveryUrl(candidate: URL): boolean {
  const path = candidate.pathname.toLowerCase();
  return path.includes("sitemap")
    || path.endsWith("/feed")
    || path.includes("/feeds/")
    || path.includes("/rss")
    || path.includes("/robots.txt")
    || path.includes("/manifest")
    || path.includes("/api/")
    || hasNonHtmlExtension(path);
}

function isLikelyProductUrl(candidate: URL): boolean {
  const path = candidate.pathname.toLowerCase();
  if (isTechnicalDiscoveryUrl(candidate)) {
    return false;
  }
  return path.includes("/products/")
    || path.includes("/product/")
    || path.includes("/collections/")
    || path.includes("/shop/buy-")
    || path.includes("/shop/product/")
    || /\/p\/[^/]+/.test(path)
    || /\/dp\/[a-z0-9]{8,}/.test(path)
    || /product[^/]*\.html?$/.test(path)
    || /\/item\/[^/]+/.test(path);
}

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const url of urls) {
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    output.push(url);
  }

  return output;
}

function extractSitemapLocs(sitemapText: string, baseUrl: string): string[] {
  const host = new URL(baseUrl).host;
  const candidates: string[] = [];

  for (const match of sitemapText.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
    const rawUrl = decodeHtmlEntities(match[1] ?? "").trim();
    if (!rawUrl) {
      continue;
    }

    try {
      const candidate = new URL(rawUrl);
      if (candidate.host !== host) {
        continue;
      }
      candidates.push(candidate.toString());
    } catch {
      continue;
    }
  }

  return dedupeUrls(candidates);
}

function extractSitemapProductCandidates(sitemapText: string, baseUrl: string): string[] {
  return extractSitemapLocs(sitemapText, baseUrl)
    .filter((value) => {
      try {
        return isLikelyProductUrl(new URL(value));
      } catch {
        return false;
      }
    })
    .slice(0, 12);
}

function extractNestedSitemapCandidates(sitemapText: string, baseUrl: string): string[] {
  return extractSitemapLocs(sitemapText, baseUrl)
    .filter((value) => {
      try {
        return isTechnicalDiscoveryUrl(new URL(value));
      } catch {
        return false;
      }
    })
    .slice(0, 4);
}

function isLikelyHtmlContentType(contentType: string | null): boolean {
  if (!contentType) {
    return true;
  }
  return /text\/html|application\/xhtml\+xml/i.test(contentType);
}

async function collectSitemapProductCandidates(input: {
  sitemapUrl: string;
  sitemapText: string;
  baseUrl: string;
  fetchImpl: typeof fetch;
}): Promise<string[]> {
  const directCandidates = extractSitemapProductCandidates(input.sitemapText, input.baseUrl);
  if (directCandidates.length > 0 || !/<sitemapindex\b/i.test(input.sitemapText)) {
    return directCandidates.slice(0, 12);
  }

  const nestedSitemaps = extractNestedSitemapCandidates(input.sitemapText, input.baseUrl);
  if (!nestedSitemaps.length) {
    return [];
  }

  const nestedCandidates = await Promise.all(
    nestedSitemaps.map(async (url) => {
      const nestedResponse = await fetchTextDocument({
        url,
        fetchImpl: input.fetchImpl,
        timeoutMs: 4_000,
      });

      if (!nestedResponse.ok || !/<(urlset|sitemapindex)\b/i.test(nestedResponse.text)) {
        return [] as string[];
      }

      return extractSitemapProductCandidates(nestedResponse.text, input.baseUrl);
    }),
  );

  return dedupeUrls(nestedCandidates.flat()).slice(0, 12);
}

async function fetchTextDocument(input: {
  url: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
  userAgent?: string;
}): Promise<{
  ok: boolean;
  status: number | null;
  text: string;
  finalUrl: string | null;
  redirected: boolean;
  contentType: string | null;
}> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

    try {
      const response = await input.fetchImpl(input.url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": input.userAgent ?? DEFAULT_USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": DEFAULT_ACCEPT_LANGUAGE,
          "cache-control": "no-cache",
          pragma: "no-cache",
          "upgrade-insecure-requests": "1",
        },
      });

      const payload = {
        ok: response.ok,
        status: response.status,
        text: await response.text(),
        finalUrl: response.url || input.url,
        redirected: response.redirected,
        contentType: response.headers.get("content-type"),
      };

      if (attempt === 0 && isRetryableStatus(payload.status)) {
        continue;
      }

      return payload;
    } catch {
      if (attempt === 0) {
        continue;
      }
      return {
        ok: false,
        status: null,
        text: "",
        finalUrl: null,
        redirected: false,
        contentType: null,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    ok: false,
    status: null,
    text: "",
    finalUrl: null,
    redirected: false,
    contentType: null,
  };
}

async function fetchCrawlabilityEvidence(input: {
  baseUrl: string;
  fetchImpl: typeof fetch;
}): Promise<CrawlabilityEvidence> {
  const robotsUrl = new URL("/robots.txt", input.baseUrl).toString();
  const robotsResponse = await fetchTextDocument({
    url: robotsUrl,
    fetchImpl: input.fetchImpl,
    timeoutMs: 5_000,
  });

  const robotsExists = robotsResponse.ok && robotsResponse.text.trim().length > 0;
  const aiBotRules = robotsExists ? parseAIBotRules(robotsResponse.text) : {};
  const sitemapUrl = robotsExists ?
    extractSitemapUrls(robotsResponse.text)[0] ?? new URL("/sitemap.xml", input.baseUrl).toString() :
    new URL("/sitemap.xml", input.baseUrl).toString();

  const sitemapResponse = await fetchTextDocument({
    url: sitemapUrl,
    fetchImpl: input.fetchImpl,
    timeoutMs: 5_000,
  });
  const sitemapExists = sitemapResponse.ok && /<(urlset|sitemapindex)\b/i.test(sitemapResponse.text);
  const sitemapCandidates = sitemapExists ? await collectSitemapProductCandidates({
    sitemapUrl,
    sitemapText: sitemapResponse.text,
    baseUrl: input.baseUrl,
    fetchImpl: input.fetchImpl,
  }) : [];

  const botEntries = await Promise.all(
    AI_BOTS.map(async (bot) => {
      const rule = aiBotRules[bot.name] ?? {allowed: true, explicitly: false};
      const reachableResponse = await fetchTextDocument({
        url: input.baseUrl,
        fetchImpl: input.fetchImpl,
        timeoutMs: 5_000,
        userAgent: `${bot.agent}/1.0`,
      });

      return [
        bot.name,
        {
          allowed: rule.allowed,
          explicitly: rule.explicitly,
          reachable: reachableResponse.status == null ? null : reachableResponse.ok,
          statusCode: reachableResponse.status,
        } satisfies CrawlabilityBotEvidence,
      ] as const;
    }),
  );

  return {
    robotsUrl,
    robotsExists,
    allowsAll: robotsExists ? !/Disallow:\s*\/\s*$/mi.test(robotsResponse.text) : true,
    sitemapUrl,
    sitemapExists,
    sitemapCandidates,
    aiBots: Object.fromEntries(botEntries),
  };
}

function findProductPageCandidates(html: string, baseUrl: string): string[] {
  const patterns = [
    /href=["'](\/products\/[^"'#?]+)/gi,
    /href=["'](\/collections\/[^"']+\/products\/[^"'#?]+)/gi,
    /href=["']([^"']*\/dp\/[A-Z0-9]{10}[^"'#?]*)/gi,
    /href=["'](\/p\/[^"'#?]+)/gi,
    /href=["']([^"']*product[^"']*\.html)/gi,
  ];

  const host = new URL(baseUrl).host;
  const candidates: string[] = [];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const rawCandidate = match[1];
      if (!rawCandidate) {
        continue;
      }

      try {
        const candidate = new URL(rawCandidate, baseUrl);
        if (candidate.host !== host) {
          continue;
        }
        if (!isLikelyProductUrl(candidate)) {
          continue;
        }
        candidates.push(candidate.toString());
      } catch {
        continue;
      }
    }
  }

  return dedupeUrls(candidates).slice(0, 6);
}

function scoreProductEvidence(sample: ProductPageSampleEvidence): number {
  let score = 0;

  if (sample.aggregateRating) {
    score += 20;
    if ((sample.aggregateRating.reviewCount ?? 0) > 0 || (sample.aggregateRating.ratingCount ?? 0) > 0) {
      score += 8;
    }
  }

  if (sample.onPage?.ratingValue != null) {
    score += 6;
  }

  if (sample.onPage?.reviewsCount != null) {
    score += 4;
  }

  if (sample.title) {
    score += 2;
  }

  if (sample.source === "homepage_link") {
    score += 1;
  }

  return score;
}

async function fetchProductPageEvidence(input: {
  html: string;
  requestedUrl: string;
  fetchImpl: typeof fetch;
  crawlability: CrawlabilityEvidence | null;
}): Promise<ProductPageSampleEvidence | null> {
  const requested = new URL(input.requestedUrl);
  if (requested.pathname !== "/" && requested.pathname !== "") {
    return null;
  }

  const homepageCandidates = findProductPageCandidates(input.html, input.requestedUrl);
  const sitemapCandidates = input.crawlability?.sitemapCandidates ?? [];
  const candidateEntries = dedupeUrls([...homepageCandidates, ...sitemapCandidates])
    .slice(0, 3)
    .map((url) => ({
      url,
      source: homepageCandidates.includes(url) ? "homepage_link" : "sitemap",
    })) as Array<{url: string; source: "homepage_link" | "sitemap"}>;

  if (!candidateEntries.length) {
    return {
      sampled: false,
      source: "none",
      url: null,
      title: null,
      aggregateRating: null,
      onPage: null,
    };
  }

  let bestSample: ProductPageSampleEvidence | null = null;
  let bestScore = -1;

  for (const candidate of candidateEntries) {
    const response = await fetchTextDocument({
      url: candidate.url,
      fetchImpl: input.fetchImpl,
      timeoutMs: 8_000,
    });

    const finalUrl = response.finalUrl ?? candidate.url;
    const finalCandidate = (() => {
      try {
        return new URL(finalUrl);
      } catch {
        return null;
      }
    })();
    const validHtmlDocument = response.ok
      && response.text.length >= 300
      && isLikelyHtmlContentType(response.contentType)
      && Boolean(finalCandidate && isLikelyProductUrl(finalCandidate));

    const sample: ProductPageSampleEvidence = (!validHtmlDocument) ? {
      sampled: false,
      source: candidate.source,
      url: finalUrl,
      title: null,
      aggregateRating: null,
      onPage: null,
    } : {
      sampled: true,
      source: candidate.source,
      url: finalUrl,
      title: extractTitle(response.text),
      aggregateRating: extractAggregateRating(parseJsonLdScripts(response.text)),
      onPage: extractOnPageEvidence(response.text),
    };

    const score = scoreProductEvidence(sample);
    if (score > bestScore) {
      bestSample = sample;
      bestScore = score;
    }
  }

  if (!bestSample || bestScore <= 0) {
    return {
      sampled: false,
      source: "none",
      url: null,
      title: null,
      aggregateRating: null,
      onPage: null,
    };
  }

  return bestSample;
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

  if (hasIssue("robots_txt_missing")) {
    recommendations.push({
      id: "publish_robots_txt",
      title: "Publish a crawl-friendly robots.txt",
      description: "Add robots.txt with explicit crawl rules and a sitemap reference so answer engines can discover site sections consistently.",
      impactScore: 5,
      priority: "medium",
    });
  }

  if (hasIssue("sitemap_missing")) {
    recommendations.push({
      id: "publish_sitemap",
      title: "Add an XML sitemap",
      description: "Expose sitemap.xml so search and answer engines can discover product and category URLs beyond the homepage.",
      impactScore: 5,
      priority: "medium",
    });
  }

  if (hasIssue("ai_bot_crawl_limited")) {
    recommendations.push({
      id: "allow_ai_bots",
      title: "Review AI bot crawl access",
      description: "Check robots.txt and CDN/WAF rules for GPTBot, ClaudeBot, Google-Extended, and PerplexityBot so they can reach key pages.",
      impactScore: 6,
      priority: "medium",
    });
  }

  if (hasIssue("product_page_schema_only")) {
    recommendations.push({
      id: "surface_schema_on_target_pages",
      title: "Surface schema on the URLs you share and rank",
      description: "A sampled product page has rating evidence, but the scanned page does not. Make sure target landing URLs expose schema and visible trust signals too.",
      impactScore: 4,
      priority: "low",
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
  crawlability: CrawlabilityEvidence | null;
  productPage: ProductPageSampleEvidence | null;
}): AeoDeterministicScanResult {
  const title = extractTitle(input.html);
  const description = extractMetaContent(input.html, "description");
  const canonical = extractMetaContent(input.html, "canonical", "rel");
  const ogTitle = extractMetaContent(input.html, "og:title", "property") ?? extractMetaContent(input.html, "twitter:title", "name");

  const jsonLdNodes = parseJsonLdScripts(input.html);
  const aggregate = extractAggregateRating(jsonLdNodes);
  const onPage = extractOnPageEvidence(input.html);
  const rootLikeRequest = (() => {
    try {
      const requested = new URL(input.requestedUrl);
      return requested.pathname === "/" || requested.pathname === "";
    } catch {
      return false;
    }
  })();
  const scoreAggregate = aggregate ?? (rootLikeRequest ? input.productPage?.aggregateRating ?? null : null);
  const scoreOnPage = (onPage.ratingValue != null || onPage.reviewsCount != null) ?
    onPage :
    rootLikeRequest ?
      input.productPage?.onPage ?? onPage :
      onPage;

  const bestRating = scoreAggregate?.bestRating ?? 5;
  const worstRating = scoreAggregate?.worstRating ?? 1;
  const hasCount = (scoreAggregate?.reviewCount ?? 0) > 0 || (scoreAggregate?.ratingCount ?? 0) > 0;
  const hasVisibleEvidence = scoreOnPage.ratingValue != null || scoreOnPage.reviewsCount != null;

  const validScale = (() => {
    if (!scoreAggregate?.ratingValue) {
      return false;
    }

    if (bestRating <= worstRating) {
      return false;
    }

    return scoreAggregate.ratingValue >= worstRating && scoreAggregate.ratingValue <= bestRating;
  })();

  const consistentEvidence = (() => {
    if (!scoreAggregate?.ratingValue || !scoreOnPage.ratingValue) {
      return false;
    }

    const delta = Math.abs(scoreAggregate.ratingValue - scoreOnPage.ratingValue);
    if (delta > 0.35) {
      return false;
    }

    if (scoreAggregate.reviewCount && scoreOnPage.reviewsCount) {
      const gap = Math.abs(scoreAggregate.reviewCount - scoreOnPage.reviewsCount);
      if (gap > Math.max(25, scoreAggregate.reviewCount * 0.2)) {
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
    hasAggregate: Boolean(scoreAggregate),
    hasRatingValue: Boolean(scoreAggregate?.ratingValue),
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

  if (!scoreAggregate) {
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
  const likelyJsHeavy = stripped.length < 700 && scriptCount > 15;

  if (likelyJsHeavy) {
    issues.push(buildIssue(
      "js_heavy_low_confidence",
      "medium",
      "access",
      3,
      "This page appears client-rendered; score is based on raw HTML snapshot only.",
    ));
  }

  if (!input.blocked && input.crawlability) {
    if (!input.crawlability.robotsExists) {
      issues.push(buildIssue(
        "robots_txt_missing",
        "low",
        "access",
        0,
        "robots.txt was not found. Bots can still crawl, but crawl guidance is missing.",
      ));
    }

    if (!input.crawlability.sitemapExists) {
      issues.push(buildIssue(
        "sitemap_missing",
        "low",
        "basic_seo",
        0,
        "sitemap.xml was not detected. Discovery of deeper product URLs may be slower.",
      ));
    }

    const limitedBots = Object.entries(input.crawlability.aiBots).filter(([, state]) => state.allowed === false || state.reachable === false);
    if (limitedBots.length > 0) {
      issues.push(buildIssue(
        "ai_bot_crawl_limited",
        "medium",
        "access",
        0,
        `Some AI bots are blocked or unreachable: ${limitedBots.map(([name]) => name).join(", ")}.`,
      ));
    }
  }

  if (!aggregate && input.productPage?.sampled && input.productPage.aggregateRating) {
    issues.push(buildIssue(
      "product_page_schema_only",
      "low",
      "ratings_schema",
      0,
      "A sampled product page has rating schema, but the scanned URL does not expose it directly.",
    ));
  }

  const recommendations = buildRecommendations(issues);
  const sortedIssues = [...issues].sort((left, right) => right.pointsLost - left.pointsLost);
  const fastestWin = recommendations.find((recommendation) => recommendation.priority !== "high") ?? recommendations[0] ?? null;
  const promptHost = (() => {
    try {
      return new URL(input.finalUrl ?? input.requestedUrl).hostname.replace(/^www\./, "");
    } catch {
      return input.normalizedUrl;
    }
  })();
  const promptKit = [
    {
      id: "prompt_visibility",
      title: "Brand visibility check",
      engine: "ChatGPT or Gemini",
      prompt: `You are evaluating ecommerce sites for AI readiness. Review ${promptHost} and explain whether this site is easy to trust, cite, and recommend in product-answer workflows. Focus on schema, visible review proof, content structure, and crawlability.`,
    },
    {
      id: "prompt_comparison",
      title: "Competitor comparison prompt",
      engine: "Perplexity or Claude",
      prompt: `Compare ${promptHost} with two stronger competitors in the same niche. Which site is more citation-ready for AI answers, and what technical or content gaps does ${promptHost} need to close first?`,
    },
    {
      id: "prompt_fix_plan",
      title: "90-day fix plan prompt",
      engine: "Any LLM",
      prompt: `Create a 90-day AI discovery improvement plan for ${promptHost}. Prioritize quick wins first, then structural fixes. Include schema, answer formatting, review proof, crawlability, and page metadata.`,
    },
  ];

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
      scanModeNote: likelyJsHeavy ? "This page appears client-rendered; score is based on raw HTML snapshot only." : null,
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
      crawlability: input.crawlability,
      productPage: input.productPage,
      notes: [
        "raw_html_mode",
        rootLikeRequest && input.productPage?.sampled ? "product_page_sample_used_for_enrichment" : null,
        "structured_data_validity_does_not_guarantee_rich_results",
      ].filter(Boolean),
    },
    actionPlan: {
      topIssues: sortedIssues.slice(0, 3).map((issue) => ({
        code: issue.code,
        message: issue.message,
        severity: issue.severity,
        dimension: issue.dimension,
        pointsLost: issue.pointsLost,
      })),
      fastestWin,
      priorityFixes: recommendations.slice(0, 3),
    },
    promptKit: {
      mode: "manual",
      prompts: promptKit,
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
    crawlability: input.crawlability,
    productPage: input.productPage,
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
    parserVersion: "aeo_parser_v3",
    usedProductPageEvidence: rootLikeRequest && Boolean(input.productPage?.sampled),
  } satisfies Record<string, unknown>;

  return {
    requestedUrl: input.requestedUrl,
    normalizedUrl: input.normalizedUrl,
    finalUrl: input.finalUrl,
    httpStatus: input.httpStatus,
    status: input.blocked ? "blocked" : "completed",
    confidenceLevel,
    publicScore: score.total,
    rulesetVersion: "aeo_rules_v3",
    promptVersion: "deterministic_v3",
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

  const startedAt = Date.now();
  let primaryDocument: Awaited<ReturnType<typeof fetchTextDocument>>;
  let html = "";
  let blocked = false;
  let crawlability: CrawlabilityEvidence | null = null;
  let productPage: ProductPageSampleEvidence | null = null;
  try {
    primaryDocument = await fetchTextDocument({
      url: requestedUrl,
      fetchImpl,
      timeoutMs,
      ...(input.userAgent ? {userAgent: input.userAgent} : {}),
    });
    html = primaryDocument.text;
  } catch (error) {
    const responseMs = Date.now() - startedAt;

    return evaluateAeoHtml({
      requestedUrl,
      normalizedUrl,
      finalUrl: null,
      httpStatus: null,
      html: "",
      blocked: true,
      crawlability: null,
      productPage: null,
      fetchMeta: {
        responseMs,
        redirected: false,
        contentType: null,
        bytes: 0,
      },
    });
  }

  const responseMs = Date.now() - startedAt;
  const httpStatus = primaryDocument.status;
  const contentType = primaryDocument.contentType;

  if (httpStatus != null && (httpStatus === 401 || httpStatus === 403 || httpStatus === 429 || httpStatus >= 500)) {
    blocked = true;
  }

  const finalUrl = primaryDocument.finalUrl ?? requestedUrl;

  if (!blocked) {
    crawlability = await fetchCrawlabilityEvidence({
      baseUrl: finalUrl,
      fetchImpl,
    });
    productPage = await fetchProductPageEvidence({
      html,
      requestedUrl: finalUrl,
      fetchImpl,
      crawlability,
    });
  }

  return evaluateAeoHtml({
    requestedUrl,
    normalizedUrl,
    finalUrl,
    httpStatus,
    html,
    blocked,
    crawlability,
    productPage,
    fetchMeta: {
      responseMs,
      redirected: primaryDocument.redirected,
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
    evidence: (result.reportJson as {evidence?: unknown}).evidence ?? null,
    actionPlan: (result.reportJson as {actionPlan?: unknown}).actionPlan ?? null,
    issues: result.issuesJson,
    recommendations: result.recommendationsJson,
  });
}
