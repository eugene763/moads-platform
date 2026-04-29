import {isIP} from "node:net";

import {PlatformError} from "@moads/db";

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_SITE_SCAN_MAX_PAGES = 5;
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
const DEFAULT_ACCEPT_LANGUAGE = "en-US,en;q=0.9";
const AI_BOTS = [
  {name: "GPTBot", agent: "GPTBot"},
  {name: "ClaudeBot", agent: "ClaudeBot"},
  {name: "Google-Extended", agent: "Google-Extended"},
  {name: "PerplexityBot", agent: "PerplexityBot"},
] as const;

type ScoreDimension =
  | "ai_crawler_accessibility"
  | "answer_optimization"
  | "citation_readiness"
  | "technical_hygiene"
  | "access"
  | "basic_seo"
  | "ratings_schema";

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

export interface AeoFullSiteScanResult extends AeoDeterministicScanResult {
  scannedPages: AeoDeterministicScanResult[];
}

interface AeoSiteDiscoveryEvidence {
  robotsFound: boolean;
  sitemapsFound: string[];
  aiFilesFound: string[];
  candidateUrlsCount: number;
  selectedUrls: string[];
  selectionReasonByUrl: Record<string, string>;
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
  linkHeader: string | null;
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
  llmsTxtExists: boolean;
  llmGuidancePage: string | null;
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

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const a = parts[0] ?? -1;
  const b = parts[1] ?? -1;
  return a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0;
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:");
}

function isLikelyDomain(hostname: string): boolean {
  if (!hostname.includes(".")) {
    return false;
  }

  const labels = hostname.split(".");
  const tld = labels.at(-1) ?? "";
  return labels.every((label) => label.length > 0) &&
    tld.length >= 2 &&
    /[a-z]/i.test(tld);
}

function assertScannablePublicHost(parsed: URL): void {
  if (parsed.username || parsed.password || parsed.port) {
    throw new PlatformError(400, "aeo_site_url_invalid", "Enter a valid website URL, for example https://example.com");
  }

  const hostname = parsed.hostname.toLowerCase();
  const ipVersion = isIP(hostname);
  const isPrivateIp = ipVersion === 4 ? isPrivateIpv4(hostname) : ipVersion === 6 ? isPrivateIpv6(hostname) : false;
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    isPrivateIp ||
    (ipVersion === 0 && !isLikelyDomain(hostname))
  ) {
    throw new PlatformError(400, "aeo_site_url_invalid", "Enter a valid website URL, for example https://example.com");
  }
}

export function normalizeSiteUrl(input: string): {
  requestedUrl: string;
  normalizedUrl: string;
} {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new PlatformError(400, "aeo_site_url_required", "siteUrl is required.");
  }

  if (/[\s<>{}[\]|\\^`]/.test(trimmed)) {
    throw new PlatformError(400, "aeo_site_url_invalid", "Enter a valid website URL, for example https://example.com");
  }

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new PlatformError(400, "aeo_site_url_invalid", "Enter a valid website URL, for example https://example.com");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new PlatformError(400, "aeo_site_url_invalid", "Enter a valid website URL, for example https://example.com");
  }

  assertScannablePublicHost(parsed);

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

function hasAnySchemaType(nodes: Array<Record<string, unknown>>, types: string[]): boolean {
  return nodes.some((node) => types.some((type) => hasType(node, type)));
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

function extractTagAttribute(tag: string, attr: string): string | null {
  const quoted = new RegExp(`\\b${attr}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i").exec(tag);
  if (quoted?.[2]) {
    return asText(quoted[2]);
  }

  const unquoted = new RegExp("\\b" + attr + "\\s*=\\s*([^\\s\"'=<>`]+)", "i").exec(tag);
  return asText(unquoted?.[1] ?? null);
}

function extractCanonicalHref(html: string): string | null {
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];

  for (const tag of linkTags) {
    const rel = extractTagAttribute(tag, "rel");
    if (!rel?.split(/\s+/).some((value) => value.toLowerCase() === "canonical")) {
      continue;
    }

    const href = extractTagAttribute(tag, "href");
    if (href) {
      return href;
    }
  }

  return null;
}

function extractCanonicalFromLinkHeader(linkHeader: string | null, baseUrl: string): string | null {
  if (!linkHeader) {
    return null;
  }

  const segments = linkHeader
    .split(/,(?=\s*<)/g)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const targetMatch = /^<([^>]+)>/.exec(segment);
    const relMatch = /;\s*rel\s*=\s*("?)([^";,]+)\1/i.exec(segment);
    const target = asText(targetMatch?.[1] ?? null);
    const rel = asText(relMatch?.[2] ?? null);

    if (!target || !rel) {
      continue;
    }

    const relTokens = rel.split(/\s+/).map((token) => token.toLowerCase());
    if (!relTokens.includes("canonical")) {
      continue;
    }

    try {
      return new URL(target, baseUrl).toString();
    } catch {
      return target;
    }
  }

  return null;
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

interface AnswerOptimizationSignals {
  questionHeadingsCount: number;
  faqBlockDetected: boolean;
  qaPairsCount: number;
  directAnswerCount: number;
  directAnswerQualityCount: number;
  bulletsOrStepsOrTablesCount: number;
  howToHeadingCount: number;
  faqSchemaCount: number;
  visibleFaqSchemaMatch: boolean;
}

function normalizeHeadingText(value: string): string {
  return stripHtml(value)
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(value: string): number {
  return normalizeHeadingText(value).split(/\s+/).filter(Boolean).length;
}

function isQuestionHeading(text: string): boolean {
  const normalized = text.toLowerCase();
  return normalized.endsWith("?")
    || /^(how|what|why|when|where|can|does|is|are|should|which)\b/.test(normalized);
}

function extractAnswerOptimizationSignals(input: {
  html: string;
  jsonLdNodes: Array<Record<string, unknown>>;
}): AnswerOptimizationSignals {
  const headingRegex = /<(h[2-4])\b[^>]*>([\s\S]*?)<\/\1>/gi;
  const headingMatches = Array.from(input.html.matchAll(headingRegex)).map((match) => ({
    heading: normalizeHeadingText(match[2] ?? ""),
    startIndex: match.index ?? 0,
    endIndex: (match.index ?? 0) + (match[0]?.length ?? 0),
  })).filter((entry) => Boolean(entry.heading));

  const questionHeadings = headingMatches.filter((entry) => isQuestionHeading(entry.heading));
  const faqBlockDetected = headingMatches.some((entry) => /\bfaq\b|\bq\s*&\s*a\b/i.test(entry.heading));
  const howToHeadingCount = headingMatches.filter((entry) => /\bhow\s*to\b/i.test(entry.heading)).length;

  let directAnswerCount = 0;
  let directAnswerQualityCount = 0;
  let bulletsOrStepsOrTablesCount = 0;

  for (let i = 0; i < questionHeadings.length; i += 1) {
    const current = questionHeadings[i];
    if (!current) {
      continue;
    }
    const nextQuestion = questionHeadings[i + 1];
    const segment = input.html.slice(
      current.endIndex,
      nextQuestion ? Math.max(current.endIndex, nextQuestion.startIndex) : undefined,
    );

    const firstParagraph = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(segment)?.[1] ?? "";
    const paragraphWords = countWords(firstParagraph);
    const listMatch = /<(ul|ol)\b[\s\S]*?<\/\1>/i.exec(segment)?.[0] ?? "";
    const tableMatch = /<table\b[\s\S]*?<\/table>/i.exec(segment)?.[0] ?? "";

    if (paragraphWords > 0 || listMatch || tableMatch) {
      directAnswerCount += 1;
    }

    if (paragraphWords >= 40 && paragraphWords <= 80) {
      directAnswerQualityCount += 1;
    }

    if (listMatch || tableMatch || /<ol\b[\s\S]*?<\/ol>/i.test(segment)) {
      bulletsOrStepsOrTablesCount += 1;
    }
  }

  const faqSchemaCount = input.jsonLdNodes.reduce((count, node) => {
    if (hasType(node, "FAQPage")) {
      const mainEntity = Array.isArray(node.mainEntity) ? node.mainEntity : [];
      return count + mainEntity.length;
    }
    return count;
  }, 0);

  const qaPairsCount = questionHeadings.length;
  const visibleFaqSchemaMatch = faqSchemaCount > 0 && qaPairsCount > 0;

  return {
    questionHeadingsCount: questionHeadings.length,
    faqBlockDetected,
    qaPairsCount,
    directAnswerCount,
    directAnswerQualityCount,
    bulletsOrStepsOrTablesCount,
    howToHeadingCount,
    faqSchemaCount,
    visibleFaqSchemaMatch,
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

function isLikelyCommerceUrl(candidate: URL): boolean {
  const path = candidate.pathname.toLowerCase();
  return isLikelyProductUrl(candidate)
    || /(?:\/|^)(shop|store|stores|collections|collection|category|categories|pricing|prices|plans|offers?|deals?|cart|checkout|sku|item)(?:\/|$)/.test(path);
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

function sameOriginPageUrl(candidate: URL, origin: string): string | null {
  if (candidate.origin !== origin || isTechnicalDiscoveryUrl(candidate)) {
    return null;
  }

  candidate.hash = "";
  candidate.search = "";
  return candidate.toString();
}

function findSameOriginPageCandidates(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const candidates: string[] = [];

  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const rawCandidate = match[1];
    if (!rawCandidate) {
      continue;
    }

    try {
      const candidate = new URL(decodeHtmlEntities(rawCandidate), baseUrl);
      const normalized = sameOriginPageUrl(candidate, base.origin);
      if (normalized) {
        candidates.push(normalized);
      }
    } catch {
      continue;
    }
  }

  return dedupeUrls(candidates);
}

function sameOriginSitemapUrl(candidate: string, origin: string): string | null {
  try {
    const parsed = new URL(candidate);
    if (parsed.origin !== origin || !isTechnicalDiscoveryUrl(parsed)) {
      return null;
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
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
  linkHeader: string | null;
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
        linkHeader: response.headers.get("link"),
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
        linkHeader: null,
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
    linkHeader: null,
  };
}

async function fetchLlmGuidanceEvidence(input: {
  baseUrl: string;
  fetchImpl: typeof fetch;
}): Promise<{llmsTxtExists: boolean; llmGuidancePage: string | null}> {
  const candidates = [
    new URL("/llms.txt", input.baseUrl).toString(),
    new URL("/llms", input.baseUrl).toString(),
    new URL("/llm", input.baseUrl).toString(),
    new URL("/ai", input.baseUrl).toString(),
  ];

  let llmsTxtExists = false;
  let llmGuidancePage: string | null = null;

  for (const candidate of candidates) {
    const response = await fetchTextDocument({
      url: candidate,
      fetchImpl: input.fetchImpl,
      timeoutMs: 4_000,
    });

    if (!response.ok || !response.text.trim()) {
      continue;
    }

    if (candidate.endsWith("/llms.txt")) {
      llmsTxtExists = true;
      continue;
    }

    if (!llmGuidancePage && isLikelyHtmlContentType(response.contentType)) {
      llmGuidancePage = response.finalUrl ?? candidate;
    }
  }

  return {
    llmsTxtExists,
    llmGuidancePage,
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

  const llmGuidance = await fetchLlmGuidanceEvidence({
    baseUrl: input.baseUrl,
    fetchImpl: input.fetchImpl,
  });

  return {
    robotsUrl,
    robotsExists,
    allowsAll: robotsExists ? !/Disallow:\s*\/\s*$/mi.test(robotsResponse.text) : true,
    sitemapUrl,
    sitemapExists,
    sitemapCandidates,
    llmsTxtExists: llmGuidance.llmsTxtExists,
    llmGuidancePage: llmGuidance.llmGuidancePage,
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
  blocked: boolean;
  responseMs: number;
  likelyJsHeavy: boolean;
  robotsExists: boolean;
  sitemapExists: boolean;
  llmsTxtExists: boolean;
  llmGuidancePage: boolean;
  limitedAIBotCount: number;
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
  answerSignals: AnswerOptimizationSignals;
}): {
  total: number;
  aiCrawlerAccessibility: number;
  answerOptimization: number;
  citationReadiness: number;
  technicalHygiene: number;
  access: number;
  basicSeo: number;
  ratingsSchema: number;
} {
  let aiCrawlerAccessibility = 0;
  if (input.httpStatus != null) {
    if (input.httpStatus >= 200 && input.httpStatus < 300) {
      aiCrawlerAccessibility += 16;
    } else if (input.httpStatus >= 300 && input.httpStatus < 400) {
      aiCrawlerAccessibility += 12;
    } else if (input.httpStatus >= 400 && input.httpStatus < 500) {
      aiCrawlerAccessibility += 5;
    }
  }
  if (!input.blocked) {
    aiCrawlerAccessibility += 4;
  }
  if (input.robotsExists) {
    aiCrawlerAccessibility += 4;
  }
  if (input.sitemapExists) {
    aiCrawlerAccessibility += 4;
  }
  if (input.hasCanonical) {
    aiCrawlerAccessibility += 3;
  }
  if (!input.likelyJsHeavy) {
    aiCrawlerAccessibility += 2;
  }
  if (input.llmsTxtExists || input.llmGuidancePage) {
    aiCrawlerAccessibility += 2;
  }
  if (input.limitedAIBotCount > 0) {
    aiCrawlerAccessibility -= Math.min(4, input.limitedAIBotCount);
  }
  aiCrawlerAccessibility = clamp(aiCrawlerAccessibility, 0, 35);

  let answerOptimization = 8;
  if (input.answerSignals.questionHeadingsCount > 0) {
    answerOptimization += Math.min(8, input.answerSignals.questionHeadingsCount * 2);
  }
  if (input.answerSignals.directAnswerCount > 0) {
    answerOptimization += Math.min(8, input.answerSignals.directAnswerCount * 2);
  }
  if (input.answerSignals.faqBlockDetected) {
    answerOptimization += 5;
  }
  if (input.answerSignals.qaPairsCount >= 6 && input.answerSignals.qaPairsCount <= 12) {
    answerOptimization += 5;
  } else if (input.answerSignals.qaPairsCount >= 3) {
    answerOptimization += 3;
  }
  if (input.answerSignals.directAnswerQualityCount > 0) {
    answerOptimization += Math.min(4, input.answerSignals.directAnswerQualityCount * 2);
  }
  if (input.answerSignals.bulletsOrStepsOrTablesCount > 0) {
    answerOptimization += 3;
  }
  if (input.answerSignals.howToHeadingCount > 0) {
    answerOptimization += 2;
  }
  if (input.answerSignals.visibleFaqSchemaMatch) {
    answerOptimization += 3;
  }
  if (input.likelyJsHeavy) {
    answerOptimization = Math.max(0, answerOptimization - 5);
  }
  answerOptimization = clamp(answerOptimization, 0, 35);

  let citationReadiness = 0;
  if (input.hasAggregate) {
    citationReadiness += 10;
  }
  if (input.hasCount) {
    citationReadiness += 5;
  }
  if (input.hasRatingValue && input.validScale) {
    citationReadiness += 4;
  }
  if (input.hasVisibleEvidence) {
    citationReadiness += 3;
  }
  if (input.consistentEvidence) {
    citationReadiness += 3;
  }
  if (input.hasTitle) {
    citationReadiness += 3;
  }
  if (input.hasDescription) {
    citationReadiness += 2;
  }
  citationReadiness = clamp(citationReadiness, 0, 25);

  let technicalHygiene = 0;
  if (input.hasTitle) {
    technicalHygiene += 2;
  }
  if (input.hasDescription) {
    technicalHygiene += 2;
  }
  if (input.hasCanonical) {
    technicalHygiene += 3;
  }
  if (input.hasOgTitle) {
    technicalHygiene += 1;
  }
  if (input.responseMs < 3500) {
    technicalHygiene += 1;
  }
  if (!input.blocked) {
    technicalHygiene += 1;
  }
  technicalHygiene = clamp(technicalHygiene, 0, 10);

  const total = clamp(aiCrawlerAccessibility + answerOptimization + citationReadiness + technicalHygiene, 0, 100);
  return {
    total,
    aiCrawlerAccessibility,
    answerOptimization,
    citationReadiness,
    technicalHygiene,
    access: aiCrawlerAccessibility,
    basicSeo: technicalHygiene,
    ratingsSchema: citationReadiness,
  };
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

  if (hasIssue("trust_signals_missing")) {
    recommendations.push({
      id: "add_general_trust_signals",
      title: "Add machine-readable trust signals",
      description: "Add relevant Organization schema, contact details, author/source information, testimonials, or review references where appropriate.",
      impactScore: 5,
      priority: "medium",
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

  if (hasIssue("question_headings_missing") || hasIssue("faq_block_missing")) {
    recommendations.push({
      id: "add_question_led_sections",
      title: "Add question-led answer sections",
      description: "Use clear H2/H3 question headings and visible FAQ blocks to improve answer extraction readiness.",
      impactScore: 8,
      priority: "high",
    });
  }

  if (hasIssue("qa_pairs_low") || hasIssue("direct_answer_quality_low")) {
    recommendations.push({
      id: "expand_qa_depth",
      title: "Expand Q/A depth and direct answers",
      description: "Aim for 6-12 Q/A pairs with concise direct answers (about 40-80 words) under each question heading.",
      impactScore: 7,
      priority: "high",
    });
  }

  if (hasIssue("structured_answer_blocks_missing")) {
    recommendations.push({
      id: "add_bullets_steps_tables",
      title: "Add bullets, steps, or tables",
      description: "Use structured blocks for key answers so machine parsers can extract implementation guidance reliably.",
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

  if (hasIssue("llm_guidance_missing")) {
    recommendations.push({
      id: "publish_llm_guidance",
      title: "Publish llms.txt or AI guidance page",
      description: "Add llms.txt or a clear machine guidance page and link it from robots/sitemap context as a positive signal.",
      impactScore: 4,
      priority: "low",
    });
  }

  if (hasIssue("product_page_schema_only")) {
    recommendations.push({
      id: "surface_schema_on_target_pages",
      title: "Keep product rating schema page-specific",
      description: "Keep Product/AggregateRating schema on product pages. Add ItemList/Product snippets to collection pages only if products are visibly listed there.",
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
  const canonical = extractCanonicalHref(input.html)
    ?? extractMetaContent(input.html, "canonical", "rel")
    ?? extractCanonicalFromLinkHeader(input.fetchMeta.linkHeader, input.finalUrl ?? input.requestedUrl);
  const ogTitle = extractMetaContent(input.html, "og:title", "property") ?? extractMetaContent(input.html, "twitter:title", "name");

  const jsonLdNodes = parseJsonLdScripts(input.html);
  const answerSignals = extractAnswerOptimizationSignals({
    html: input.html,
    jsonLdNodes,
  });
  const aggregate = extractAggregateRating(jsonLdNodes);
  const onPage = extractOnPageEvidence(input.html);
  const stripped = stripHtml(input.html);
  const scriptCount = (input.html.match(/<script\b/gi) ?? []).length;
  const likelyJsHeavy = stripped.length < 700 && scriptCount > 15;
  const limitedBots = Object.entries(input.crawlability?.aiBots ?? {}).filter(([, state]) => state.allowed === false || state.reachable === false);
  const rootLikeRequest = (() => {
    try {
      const requested = new URL(input.requestedUrl);
      return requested.pathname === "/" || requested.pathname === "";
    } catch {
      return false;
    }
  })();
  const requestedUrl = (() => {
    try {
      return new URL(input.finalUrl ?? input.requestedUrl);
    } catch {
      return null;
    }
  })();
  const commerceSchemaContext = hasAnySchemaType(jsonLdNodes, ["Product", "Offer", "AggregateRating", "Review", "ItemList"]);
  const commerceUrlContext = requestedUrl ? isLikelyCommerceUrl(requestedUrl) : false;
  const commerceHtmlContext = /\b(add to cart|add-to-cart|checkout|cart|sku|shopify|woocommerce|product-card|data-product|itemprop=["']offers?["']|price|pricing|buy now)\b/i.test(stripped) ||
    /[$€£]\s?\d{1,5}(?:[.,]\d{2})?/.test(stripped);
  // MVP heuristic. Replace with explicit page classification when crawl evidence is richer.
  const productRatingApplicable = commerceSchemaContext || commerceUrlContext || commerceHtmlContext;
  const weakGeneralTrustSignals = !hasAnySchemaType(jsonLdNodes, ["Organization", "LocalBusiness", "Person", "Article", "Review"]) &&
    !/\b(contact|about|author|testimonial|review|privacy|address|phone|email)\b/i.test(stripped);
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
    blocked: input.blocked,
    responseMs: input.fetchMeta.responseMs,
    likelyJsHeavy,
    robotsExists: input.crawlability?.robotsExists ?? false,
    sitemapExists: input.crawlability?.sitemapExists ?? false,
    llmsTxtExists: input.crawlability?.llmsTxtExists ?? false,
    llmGuidancePage: Boolean(input.crawlability?.llmGuidancePage),
    limitedAIBotCount: limitedBots.length,
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
    answerSignals,
  });

  const issues: AeoIssue[] = [];

  if (input.blocked) {
    issues.push(buildIssue(
      "fetch_blocked",
      "high",
      "ai_crawler_accessibility",
      30,
      "Page could not be fetched (blocked/challenge/timeout).",
    ));
  }

  if (!title) {
    issues.push(buildIssue("title_missing", "medium", "technical_hygiene", 8, "Missing <title> tag."));
  }

  if (!description) {
    issues.push(buildIssue("meta_description_missing", "medium", "technical_hygiene", 8, "Missing meta description."));
  }

  if (!canonical) {
    issues.push(buildIssue("canonical_missing", "low", "technical_hygiene", 7, "Missing canonical signal."));
  }

  if (!scoreAggregate && productRatingApplicable) {
    issues.push(buildIssue(
      "aggregate_rating_missing",
      "high",
      "citation_readiness",
      15,
      "AggregateRating data was not found in JSON-LD.",
    ));
  } else if (!scoreAggregate && weakGeneralTrustSignals) {
    issues.push(buildIssue(
      "trust_signals_missing",
      "medium",
      "citation_readiness",
      5,
      "The page has limited machine-readable trust signals such as Organization, author, contact, testimonial, review, or credibility metadata.",
    ));
  } else if (scoreAggregate && productRatingApplicable) {
    if (!hasCount) {
      issues.push(buildIssue(
        "aggregate_count_missing",
        "high",
        "citation_readiness",
        10,
        "AggregateRating has no reviewCount/ratingCount.",
      ));
    }

    if (!validScale) {
      issues.push(buildIssue(
        "aggregate_scale_invalid",
        "high",
        "citation_readiness",
        8,
        "ratingValue is missing or outside the declared rating scale.",
      ));
    }

    if (hasVisibleEvidence && !consistentEvidence) {
      issues.push(buildIssue(
        "aggregate_visible_mismatch",
        "high",
        "citation_readiness",
        6,
        "Structured rating evidence does not match visible page evidence.",
      ));
    }
  }

  if (likelyJsHeavy) {
    issues.push(buildIssue(
      "js_heavy_low_confidence",
      "medium",
      "ai_crawler_accessibility",
      3,
      "This page appears client-rendered; score is based on raw HTML snapshot only.",
    ));
  }

  if (answerSignals.questionHeadingsCount === 0) {
    issues.push(buildIssue(
      "question_headings_missing",
      "medium",
      "answer_optimization",
      8,
      "No question-style H2/H3/H4 headings were found.",
    ));
  }

  if (!answerSignals.faqBlockDetected) {
    issues.push(buildIssue(
      "faq_block_missing",
      "medium",
      "answer_optimization",
      6,
      "Visible FAQ block was not detected in raw HTML.",
    ));
  }

  if (answerSignals.qaPairsCount < 6) {
    issues.push(buildIssue(
      "qa_pairs_low",
      "medium",
      "answer_optimization",
      5,
      "Detected fewer than 6 clear Q/A pairs.",
    ));
  }

  if (answerSignals.directAnswerQualityCount === 0) {
    issues.push(buildIssue(
      "direct_answer_quality_low",
      "medium",
      "answer_optimization",
      4,
      "No 40-80 word direct answer block was found immediately under question headings.",
    ));
  }

  if (answerSignals.bulletsOrStepsOrTablesCount === 0) {
    issues.push(buildIssue(
      "structured_answer_blocks_missing",
      "low",
      "answer_optimization",
      2,
      "No bullet, step, or table structures were found under answer sections.",
    ));
  }

  if (!input.blocked && input.crawlability?.llmsTxtExists === false && !input.crawlability?.llmGuidancePage) {
    issues.push(buildIssue(
      "llm_guidance_missing",
      "low",
      "ai_crawler_accessibility",
      0,
      "No llms.txt or machine guidance page was detected.",
    ));
  }

  if (!input.blocked && input.crawlability) {
    if (!input.crawlability.robotsExists) {
      issues.push(buildIssue(
        "robots_txt_missing",
        "low",
        "ai_crawler_accessibility",
        0,
        "robots.txt was not found. Bots can still crawl, but crawl guidance is missing.",
      ));
    }

    if (!input.crawlability.sitemapExists) {
      issues.push(buildIssue(
        "sitemap_missing",
        "low",
        "ai_crawler_accessibility",
        0,
        "sitemap.xml was not detected. Discovery of deeper product URLs may be slower.",
      ));
    }

    if (limitedBots.length > 0) {
      issues.push(buildIssue(
        "ai_bot_crawl_limited",
        "medium",
        "ai_crawler_accessibility",
        0,
        `Some AI bots are blocked or unreachable: ${limitedBots.map(([name]) => name).join(", ")}.`,
      ));
    }
  }

  if (productRatingApplicable && !aggregate && input.productPage?.sampled && input.productPage.aggregateRating) {
    issues.push(buildIssue(
      "product_page_schema_only",
      "low",
      "citation_readiness",
      0,
      "Product rating schema appears only on product pages.",
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
      scoreVersion: "aeo_score_v2",
      scoreLabel: "AI Discovery Readiness of page",
      scope: "single_page",
      status: input.blocked ? "blocked" : "completed",
      ratingSchemaStatus: ratingStatus,
      confidenceLevel,
      scanModeNote: likelyJsHeavy ? "This page appears client-rendered; score is based on raw HTML snapshot only." : null,
    },
    dimensions: {
      aiCrawlerAccessibility: score.aiCrawlerAccessibility,
      answerOptimization: score.answerOptimization,
      citationReadiness: score.citationReadiness,
      technicalHygiene: score.technicalHygiene,
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
      answerOptimization: answerSignals,
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
    answerOptimization: answerSignals,
  } satisfies Record<string, unknown>;

  const signalBlocksJson = {
    ratingSchemaStatus: ratingStatus,
    likelyJsHeavy,
    hasJsonLd: jsonLdNodes.length > 0,
    scoreModel: "evidence_first_v2",
  } satisfies Record<string, unknown>;

  const rawFetchMetaJson = {
    responseMs: input.fetchMeta.responseMs,
    redirected: input.fetchMeta.redirected,
    contentType: input.fetchMeta.contentType,
    bytes: input.fetchMeta.bytes,
    linkHeader: input.fetchMeta.linkHeader,
    finalUrl: input.finalUrl,
    httpStatus: input.httpStatus,
    parserVersion: "aeo_parser_v4",
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
    rulesetVersion: "aeo_rules_v4",
    promptVersion: "deterministic_v4",
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
        linkHeader: null,
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
      linkHeader: primaryDocument.linkHeader,
    },
  });
}

function confidenceRank(value: AeoDeterministicScanResult["confidenceLevel"]): number {
  if (value === "high") {
    return 3;
  }
  if (value === "medium") {
    return 2;
  }
  return 1;
}

function lowestConfidence(results: AeoDeterministicScanResult[]): AeoDeterministicScanResult["confidenceLevel"] {
  return results.reduce<AeoDeterministicScanResult["confidenceLevel"]>((lowest, result) => (
    confidenceRank(result.confidenceLevel) < confidenceRank(lowest) ? result.confidenceLevel : lowest
  ), "high");
}

function uniqueBy<T>(items: T[], keyFor: (item: T) => string): T[] {
  const seen = new Set<string>();
  const output: T[] = [];

  for (const item of items) {
    const key = keyFor(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }

  return output;
}

function buildFullSiteResult(input: {
  requestedUrl: string;
  normalizedUrl: string;
  pages: AeoDeterministicScanResult[];
  maxPages: number;
  discovery: AeoSiteDiscoveryEvidence;
}): AeoFullSiteScanResult {
  const pages = input.pages.length ? input.pages : [runBlockedSiteFallback(input.requestedUrl, input.normalizedUrl)];
  const completedPages = pages.filter((page) => page.status === "completed");
  const averageScore = Math.round(pages.reduce((sum, page) => sum + page.publicScore, 0) / pages.length);
  const pageSummaries = pages.map((page) => ({
    url: page.finalUrl ?? page.requestedUrl,
    requestedUrl: page.requestedUrl,
    status: page.status,
    score: page.publicScore,
    confidenceLevel: page.confidenceLevel,
    issuesCount: page.issuesJson.length,
  }));
  const issues = uniqueBy(
    pages.flatMap((page) => page.issuesJson.map((issue) => ({
      ...issue,
      message: `${issue.message} (${new URL(page.finalUrl ?? page.requestedUrl).pathname || "/"})`,
    }))),
    (issue) => `${issue.code}:${issue.message}`,
  );
  const recommendations = uniqueBy(
    pages.flatMap((page) => page.recommendationsJson),
    (recommendation) => recommendation.id,
  ).slice(0, 8);
  const topFixes = recommendations.slice(0, 5);
  const representative = pages[0];

  return {
    requestedUrl: input.requestedUrl,
    normalizedUrl: input.normalizedUrl,
    finalUrl: representative?.finalUrl ?? input.requestedUrl,
    httpStatus: representative?.httpStatus ?? null,
    status: completedPages.length > 0 ? "completed" : "blocked",
    confidenceLevel: lowestConfidence(pages),
    publicScore: averageScore,
    rulesetVersion: "aeo_rules_v4",
    promptVersion: "deterministic_site_v1",
    reportJson: {
      summary: {
        score: averageScore,
        scoreVersion: "aeo_score_v2",
        scoreLabel: "AI Discovery Readiness of site",
        scope: "site",
        status: completedPages.length > 0 ? "completed" : "blocked",
        confidenceLevel: lowestConfidence(pages),
        scannedPages: pages.length,
        maxPages: input.maxPages,
        scanModeNote: `Deep Site Scan sampled ${pages.length} page${pages.length === 1 ? "" : "s"} in launch mode.`,
      },
      dimensions: representative?.reportJson.dimensions ?? {},
      discovery: input.discovery,
      evidence: {
        pages: pageSummaries,
        sampledUrls: pageSummaries.map((page) => page.url),
      },
      actionPlan: {
        topIssues: issues.slice(0, 5).map((issue) => ({
          code: issue.code,
          message: issue.message,
          severity: issue.severity,
          dimension: issue.dimension,
          pointsLost: issue.pointsLost,
        })),
        fastestWin: topFixes[0] ?? null,
        priorityFixes: topFixes.slice(0, 3),
      },
      promptKit: {
        mode: "manual",
        prompts: [],
      },
      topFixes,
    },
    recommendationsJson: recommendations,
    extractedFactsJson: {
      scope: "site",
      scannedPages: pageSummaries,
      discovery: input.discovery,
    },
    issuesJson: issues,
    signalBlocksJson: {
      scoreModel: "evidence_first_site_v1",
      sampledPages: pages.length,
      maxPages: input.maxPages,
    },
    rawFetchMetaJson: {
      parserVersion: "aeo_parser_v4",
      scope: "site",
      sampledUrls: pageSummaries.map((page) => page.url),
    },
    scannedPages: pages,
  };
}

function runBlockedSiteFallback(requestedUrl: string, normalizedUrl: string): AeoDeterministicScanResult {
  return {
    requestedUrl,
    normalizedUrl,
    finalUrl: null,
    httpStatus: null,
    status: "blocked",
    confidenceLevel: "low",
    publicScore: 0,
    rulesetVersion: "aeo_rules_v4",
    promptVersion: "deterministic_v4",
    reportJson: {},
    recommendationsJson: [],
    extractedFactsJson: {},
    issuesJson: [],
    signalBlocksJson: {},
    rawFetchMetaJson: {},
  };
}

async function discoverSitemapPageUrls(input: {
  baseUrl: string;
  robotsText: string | null;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<{sitemapsFound: string[]; candidateUrls: string[]}> {
  const base = new URL(input.baseUrl);
  const origin = base.origin;
  const sitemapSeeds = input.robotsText ?
    extractSitemapUrls(input.robotsText).map((url) => sameOriginSitemapUrl(url, origin)).filter((url): url is string => Boolean(url)) :
    [];
  const queue = (sitemapSeeds.length ? sitemapSeeds : [
    new URL("/sitemap.xml", origin).toString(),
    new URL("/sitemap_index.xml", origin).toString(),
  ]).map((url) => sameOriginSitemapUrl(url, origin)).filter((url): url is string => Boolean(url));
  const seenSitemaps = new Set<string>();
  const sitemapsFound: string[] = [];
  const candidateUrls: string[] = [];

  while (queue.length && seenSitemaps.size < 3 && candidateUrls.length < 200) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || seenSitemaps.has(sitemapUrl)) {
      continue;
    }
    seenSitemaps.add(sitemapUrl);

    const response = await fetchTextDocument({
      url: sitemapUrl,
      fetchImpl: input.fetchImpl,
      timeoutMs: Math.min(input.timeoutMs, 6_000),
    });
    if (!response.ok || !/<(urlset|sitemapindex)\b/i.test(response.text)) {
      continue;
    }

    sitemapsFound.push(sitemapUrl);
    const locs = extractSitemapLocs(response.text, origin);
    for (const loc of locs) {
      if (candidateUrls.length >= 200) {
        break;
      }
      const parsed = new URL(loc);
      if (isTechnicalDiscoveryUrl(parsed)) {
        const nested = sameOriginSitemapUrl(loc, origin);
        if (nested && !seenSitemaps.has(nested) && queue.length + seenSitemaps.size < 3) {
          queue.push(nested);
        }
        continue;
      }

      const normalized = sameOriginPageUrl(parsed, origin);
      if (normalized) {
        candidateUrls.push(normalized);
      }
    }
  }

  return {
    sitemapsFound,
    candidateUrls: dedupeUrls(candidateUrls).slice(0, 200),
  };
}

async function discoverAiFiles(input: {
  baseUrl: string;
  fetchImpl: typeof fetch;
}): Promise<string[]> {
  const origin = new URL(input.baseUrl).origin;
  const candidates = [
    "/llms.txt",
    "/llm.txt",
    "/ai.txt",
    "/agents.txt",
    "/llms",
    "/ai",
    "/agents",
  ].map((path) => new URL(path, origin).toString());
  const found: string[] = [];

  for (const url of candidates) {
    const response = await fetchTextDocument({
      url,
      fetchImpl: input.fetchImpl,
      timeoutMs: 3_000,
    });
    if (response.ok && response.text.trim()) {
      found.push(url);
    }
  }

  return found;
}

function pageSelectionScore(url: string, source: "homepage" | "sitemap" | "internal"): {score: number; reason: string} {
  const parsed = new URL(url);
  const path = parsed.pathname.toLowerCase();

  if (/(\/|^)(blog|news|tag|tags|author|login|signin|signup|register|cart|checkout|account|search|admin)(\/|$)/.test(path)
    || /[?&](q|s|filter|sort)=/i.test(parsed.search)
    || hasNonHtmlExtension(path)) {
    return {score: -1_000, reason: "Skipped low-value or non-content URL"};
  }

  let score = source === "sitemap" ? 15 : source === "homepage" ? 8 : 4;
  let reason = source === "sitemap" ? "Found in sitemap" : "Found from homepage links";

  if (/(\/|^)(pricing|prices|plans|tariff|tariffs)(\/|$)/.test(path)) {
    score += 100;
    reason = "Pricing or plans page";
  } else if (/(\/|^)(product|products|item|sku|shop|store)(\/|$)/.test(path) || isLikelyProductUrl(parsed)) {
    score += 90;
    reason = "Product or store page";
  } else if (/(\/|^)(category|categories|collection|collections)(\/|$)/.test(path)) {
    score += 80;
    reason = "Category or collection page";
  } else if (/(\/|^)(service|services)(\/|$)/.test(path)) {
    score += 70;
    reason = "Service page";
  } else if (/(\/|^)(shipping|delivery|returns|refund|payment|warranty|terms|privacy)(\/|$)/.test(path)) {
    score += 50;
    reason = "Commerce trust page";
  } else if (/(\/|^)(about|contact|company|reviews|testimonials|trust)(\/|$)/.test(path)) {
    score += 40;
    reason = "Trust or company page";
  }

  return {score, reason};
}

function selectKeySitePages(input: {
  homepageUrl: string;
  sitemapUrls: string[];
  internalUrls: string[];
  maxPages: number;
}): {selectedUrls: string[]; selectionReasonByUrl: Record<string, string>; candidateUrlsCount: number} {
  const sourceByUrl = new Map<string, "homepage" | "sitemap" | "internal">();
  for (const url of input.sitemapUrls) {
    sourceByUrl.set(url, "sitemap");
  }
  for (const url of input.internalUrls) {
    if (!sourceByUrl.has(url)) {
      sourceByUrl.set(url, "internal");
    }
  }

  sourceByUrl.delete(input.homepageUrl);
  const scored = Array.from(sourceByUrl.entries())
    .map(([url, source], index) => {
      const selected = pageSelectionScore(url, source);
      return {url, source, index, ...selected};
    })
    .filter((candidate) => candidate.score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const selectedUrls = [input.homepageUrl, ...scored.map((candidate) => candidate.url)].slice(0, input.maxPages);
  const selectionReasonByUrl: Record<string, string> = {
    [input.homepageUrl]: "Homepage is always included",
  };
  for (const candidate of scored) {
    if (selectedUrls.includes(candidate.url)) {
      selectionReasonByUrl[candidate.url] = candidate.reason;
    }
  }

  return {
    selectedUrls,
    selectionReasonByUrl,
    candidateUrlsCount: sourceByUrl.size + 1,
  };
}

export async function runAeoFullSiteScan(input: {
  siteUrl: string;
  maxPages?: number;
  timeoutMs?: number;
  userAgent?: string;
  fetchImpl?: typeof fetch;
}): Promise<AeoFullSiteScanResult> {
  const {requestedUrl, normalizedUrl} = normalizeSiteUrl(input.siteUrl);
  const requestedMaxPages = Math.floor(input.maxPages ?? DEFAULT_SITE_SCAN_MAX_PAGES);
  const maxPages = Number.isFinite(requestedMaxPages) ?
    Math.max(1, Math.min(DEFAULT_SITE_SCAN_MAX_PAGES, requestedMaxPages)) :
    DEFAULT_SITE_SCAN_MAX_PAGES;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = input.fetchImpl ?? fetch;

  const homepage = await fetchTextDocument({
    url: requestedUrl,
    fetchImpl,
    timeoutMs,
    ...(input.userAgent ? {userAgent: input.userAgent} : {}),
  });

  const discoveryBaseUrl = homepage.finalUrl ?? requestedUrl;
  const robotsUrl = new URL("/robots.txt", discoveryBaseUrl).toString();
  const robots = await fetchTextDocument({
    url: robotsUrl,
    fetchImpl,
    timeoutMs: Math.min(timeoutMs, 4_000),
  });
  const sitemapDiscovery = await discoverSitemapPageUrls({
    baseUrl: discoveryBaseUrl,
    robotsText: robots.ok ? robots.text : null,
    fetchImpl,
    timeoutMs,
  });
  const aiFilesFound = await discoverAiFiles({
    baseUrl: discoveryBaseUrl,
    fetchImpl,
  });
  const internalUrls = homepage.ok && isLikelyHtmlContentType(homepage.contentType) ?
    findSameOriginPageCandidates(homepage.text, discoveryBaseUrl) :
    [];
  const selected = selectKeySitePages({
    homepageUrl: discoveryBaseUrl,
    sitemapUrls: sitemapDiscovery.candidateUrls,
    internalUrls,
    maxPages,
  });
  const discovery: AeoSiteDiscoveryEvidence = {
    robotsFound: robots.ok,
    sitemapsFound: sitemapDiscovery.sitemapsFound,
    aiFilesFound,
    candidateUrlsCount: selected.candidateUrlsCount,
    selectedUrls: selected.selectedUrls,
    selectionReasonByUrl: selected.selectionReasonByUrl,
  };

  const pages: AeoDeterministicScanResult[] = [];
  for (const url of selected.selectedUrls) {
    pages.push(await runAeoDeterministicScan({
      siteUrl: url,
      timeoutMs,
      fetchImpl,
      ...(input.userAgent ? {userAgent: input.userAgent} : {}),
    }));
  }

  return buildFullSiteResult({
    requestedUrl,
    normalizedUrl,
    pages,
    maxPages,
    discovery,
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
