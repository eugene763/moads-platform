const ISSUE_EXPLANATIONS: Record<string, string> = {
  canonical_missing:
    "Search and AI systems can treat duplicate URLs as separate pages when canonical tags are missing. Add one stable canonical URL and keep it consistent across variants so indexing and summarization are cleaner.",
  aggregate_rating_missing:
    "Your page does not expose AggregateRating in JSON-LD, so trust and review signals are weaker for machine interpretation. Add valid rating fields and keep them aligned with visible on-page review data.",
  qa_pairs_low:
    "The page contains too few clear question-and-answer blocks for answer engines to extract structured responses. Add concise Q/A sections around real buyer questions and keep headings explicit.",
  direct_answer_quality_low:
    "Question headings are present, but immediate direct answers are weak or missing. Add short 40-80 word answer blocks right under each question before long-form details.",
  structured_answer_blocks_missing:
    "Answer sections are harder to parse without bullets, numbered steps, or simple tables. Use structured formatting to make key actions and facts machine-readable.",
  llm_guidance_missing:
    "No machine-guidance surface was detected, such as llms.txt or an AI guidance page. Add clear instructions for AI crawlers and include links in robots or site guidance docs.",
  meta_description_missing:
    "Missing meta descriptions reduce context quality for snippets and AI summaries. Add page-specific meta descriptions that describe the page intent in plain language.",
  robots_missing:
    "robots.txt was not found, so crawler directives are unclear. Publish robots.txt with consistent allow/disallow rules and a sitemap link.",
  sitemap_missing:
    "No sitemap was detected, which can slow discovery for deeper pages. Add and maintain a valid sitemap.xml so crawlers can map your content quickly.",
};

const ISSUE_ACTIONS: Record<string, string> = {
  canonical_missing: "Set one canonical URL for this page and keep it consistent across duplicate variants.",
  aggregate_rating_missing: "Add valid Product/AggregateRating JSON-LD with ratingValue and ratingCount or reviewCount.",
  qa_pairs_low: "Add at least 6 concise question-answer pairs that match real buyer intent.",
  direct_answer_quality_low: "Place a clear 40-80 word direct answer immediately under each question heading.",
  structured_answer_blocks_missing: "Use bullets, steps, or simple tables inside answer sections for clearer parsing.",
  llm_guidance_missing: "Publish llms.txt or a machine guidance page and reference it from robots or sitemap context.",
  meta_description_missing: "Write a specific meta description that states what the page offers and who it helps.",
  robots_missing: "Create robots.txt with User-agent rules and a sitemap URL for cleaner crawler guidance.",
  sitemap_missing: "Publish sitemap.xml and keep it updated so crawlers can discover key URLs faster.",
};

export function explainIssue(code: string, fallbackMessage: string): string {
  return ISSUE_EXPLANATIONS[code] ?? fallbackMessage;
}

export function issueAction(code: string): string {
  return ISSUE_ACTIONS[code] ?? "Apply the recommended fix in this block and rerun the scan to validate the improvement.";
}

export function toSiteLabel(siteUrl: string): string {
  const raw = siteUrl.trim();
  if (!raw) {
    return "site";
  }

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withScheme).hostname.replace(/^www\./i, "");
  } catch {
    return raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
  }
}

export function normalizeUrlForDisplay(siteUrl: string): string {
  return siteUrl.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

export function truncateSiteLabel(label: string, max = 28): string {
  if (label.length <= max) {
    return label;
  }
  return `${label.slice(0, max - 3)}...`;
}

export function statusToneClass(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized.includes("complete") || normalized.includes("success")) {
    return "status-ok";
  }
  if (normalized.includes("process") || normalized.includes("queue") || normalized.includes("pending")) {
    return "status-warn";
  }
  if (normalized.includes("fail") || normalized.includes("block") || normalized.includes("error")) {
    return "status-danger";
  }
  return "status-neutral";
}

export function scoreToneClass(score: number | null | undefined): string {
  const value = Number(score ?? 0);
  if (value >= 75) {
    return "score-good";
  }
  if (value >= 45) {
    return "score-med";
  }
  return "score-low";
}
