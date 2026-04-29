import {explainIssue, issueAction, normalizeUrlForDisplay} from "./aeo-ui";
import type {PublicScanReport} from "./api";

export interface RenderedIssue {
  code: string;
  severity: string;
  message: string;
  affectedPages?: string[];
}

const TRAILING_PATH_MARKER = /\s+\((\/[^)]*|https?:\/\/[^)]+)\)\s*$/i;

function issuePriorityRank(severity: string | null | undefined): number {
  const normalized = severity?.trim().toLowerCase();
  if (normalized === "high") {
    return 0;
  }
  if (normalized === "medium" || normalized === "med") {
    return 1;
  }
  if (normalized === "low") {
    return 2;
  }
  return 3;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function stripTrailingPageMarker(value: string): string {
  return value.replace(TRAILING_PATH_MARKER, "").trim();
}

function affectedPageFromIssue(issue: {message: string; affectedPages?: string[]}): string[] {
  const pages = issue.affectedPages ?? [];
  const marker = issue.message.match(TRAILING_PATH_MARKER)?.[1];
  if (!marker) {
    return pages;
  }

  try {
    return [...pages, new URL(marker).pathname || "/"];
  } catch {
    return [...pages, marker || "/"];
  }
}

function isCommerceReport(report: Pick<PublicScanReport, "siteUrl" | "report" | "issues">): boolean {
  const pathFromUrl = (value: string | null | undefined): string => {
    if (!value) {
      return "";
    }
    try {
      return new URL(value).pathname.toLowerCase();
    } catch {
      return `/${normalizeUrlForDisplay(value).toLowerCase()}`;
    }
  };
  const commercePathPattern = /(?:\/|^)(product|products|shop|store|collections?|categor(?:y|ies)|pricing|prices|plans|offers?|deals?|cart|checkout|sku|item)(?:\/|$)/;
  const path = pathFromUrl(report.siteUrl);
  const productSamplePath = pathFromUrl(report.report.evidence?.productPage?.url ?? null);
  const evidence = report.report.evidence;
  return commercePathPattern.test(path) ||
    commercePathPattern.test(productSamplePath) ||
    Boolean(evidence?.productPage?.aggregateRating) ||
    Boolean(evidence?.structuredData?.aggregateRating) ||
    Boolean(evidence?.onPage?.ratingValue || evidence?.onPage?.reviewsCount) ||
    report.issues.some((issue) => ["aggregate_count_missing", "aggregate_scale_invalid", "aggregate_visible_mismatch"].includes(issue.code));
}

function shouldSuppressIssue(issue: {code: string}, report: Pick<PublicScanReport, "siteUrl" | "report" | "issues">): boolean {
  if (issue.code === "aggregate_count_missing" || issue.code === "aggregate_scale_invalid" || issue.code === "aggregate_visible_mismatch") {
    return !isCommerceReport(report);
  }

  if (issue.code === "product_page_schema_only") {
    return !isCommerceReport(report);
  }

  if (issue.code === "aggregate_rating_missing") {
    return !isCommerceReport(report);
  }

  return false;
}

function buildReplacementIssue(issue: {code: string; severity: string; message: string}, report: Pick<PublicScanReport, "siteUrl" | "report" | "issues">): RenderedIssue | null {
  if (issue.code !== "aggregate_rating_missing" || isCommerceReport(report)) {
    return null;
  }

  return {
    code: "trust_signals_missing",
    severity: "medium",
    message: "The page has limited machine-readable trust signals such as Organization, author, contact, testimonial, review, or credibility metadata.",
  };
}

export function prepareCurrentIssues(report: Pick<PublicScanReport, "siteUrl" | "report" | "issues">): RenderedIssue[] {
  const prepared: RenderedIssue[] = [];

  for (const issue of report.issues) {
    const replacement = buildReplacementIssue(issue, report);
    if (replacement) {
      prepared.push(replacement);
      continue;
    }

    if (!shouldSuppressIssue(issue, report)) {
      prepared.push(issue);
    }
  }

  const seen = new Map<string, RenderedIssue & {firstIndex: number}>();
  prepared.forEach((issue, index) => {
    const title = issue.code.replace(/_/g, " ");
    const key = [
      normalizeText(title),
      normalizeText(issue.severity ?? ""),
      normalizeText(issueAction(issue.code)),
      normalizeText(stripTrailingPageMarker(explainIssue(issue.code, issue.message))),
    ].join("|");
    const existing = seen.get(key);
    if (existing) {
      existing.affectedPages = [...(existing.affectedPages ?? []), ...affectedPageFromIssue(issue)];
      return;
    }
    seen.set(key, {
      ...issue,
      message: stripTrailingPageMarker(issue.message),
      affectedPages: affectedPageFromIssue(issue),
      firstIndex: index,
    });
  });

  return Array.from(seen.values())
    .sort((a, b) => {
      const priorityDelta = issuePriorityRank(a.severity) - issuePriorityRank(b.severity);
      return priorityDelta || a.firstIndex - b.firstIndex;
    })
    .map(({firstIndex: _firstIndex, affectedPages, ...issue}) => ({
      ...issue,
      ...(affectedPages?.length ? {affectedPages: Array.from(new Set(affectedPages))} : {}),
    }));
}

export function affectedPagesLabel(issue: RenderedIssue): string | null {
  const pages = issue.affectedPages;
  if (!pages?.length) {
    return null;
  }

  const visible = pages.slice(0, 3).join(", ");
  const extra = pages.length > 3 ? ` +${pages.length - 3} more` : "";
  return `Found on ${pages.length} pages: ${visible}${extra}`;
}
