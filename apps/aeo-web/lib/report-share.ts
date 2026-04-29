export interface ReportSharePayload {
  domain: string;
  reportUrl: string;
  score: number | null;
  text: string;
  title: string;
}

export function reportDomain(siteUrl: string): string {
  try {
    return new URL(siteUrl).hostname.replace(/^www\./i, "");
  } catch {
    return siteUrl.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0] || "site";
  }
}

export function buildReportSharePayload(input: {
  siteUrl: string;
  score: number | null;
  reportUrl: string;
}): ReportSharePayload {
  const domain = reportDomain(input.siteUrl);
  const score = input.score ?? 0;
  const text = `AEO score for ${domain} is ${score}/100: ${input.reportUrl}`;

  return {
    domain,
    reportUrl: input.reportUrl,
    score: input.score,
    text,
    title: `AEO score for ${domain}`,
  };
}

export function buildTelegramShareUrl(payload: ReportSharePayload): string {
  const textWithoutUrl = `AEO score for ${payload.domain} is ${payload.score ?? 0}/100:`;
  return `https://t.me/share/url?url=${encodeURIComponent(payload.reportUrl)}&text=${encodeURIComponent(textWithoutUrl)}`;
}

export function buildEmailShareHref(payload: ReportSharePayload): string {
  return `mailto:?subject=${encodeURIComponent(payload.title)}&body=${encodeURIComponent(payload.text)}`;
}
