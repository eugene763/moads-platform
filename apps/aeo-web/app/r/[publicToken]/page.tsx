import type {Metadata} from "next";

import {AeoTopNav} from "../../../components/aeo-top-nav";
import {ReportView} from "../../../components/report-view";
import {API_BASE_URL, PublicScanReport} from "../../../lib/api";
import {reportDomain} from "../../../lib/report-share";

const fallbackMetadata = {
  title: "AI Discovery Readiness Report | MO AEO Checker",
  description: "View an AEO report with AI discovery readiness signals, visible issues, and recommended next steps.",
};

export async function generateMetadata({params}: {params: Promise<{publicToken: string}>}): Promise<Metadata> {
  const {publicToken} = await params;
  const reportUrl = `https://aeo.moads.agency/r/${encodeURIComponent(publicToken)}`;

  try {
    const response = await fetch(`${API_BASE_URL}/v1/aeo/public-scans/${encodeURIComponent(publicToken)}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("Report metadata fetch failed.");
    }

    const report = await response.json() as PublicScanReport;
    const domain = reportDomain(report.siteUrl || report.finalUrl || "site");
    const score = report.publicScore ?? 0;
    const title = `AI Discovery Readiness: ${score}/100 for ${domain}`;
    const description = `AEO report summary for ${domain}: AI discovery readiness score, visible checks, and prioritized issues.`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: reportUrl,
        type: "website",
      },
      twitter: {
        card: "summary",
        title,
        description,
      },
    };
  } catch {
    return {
      ...fallbackMetadata,
      openGraph: {
        ...fallbackMetadata,
        url: reportUrl,
        type: "website",
      },
      twitter: {
        card: "summary",
        ...fallbackMetadata,
      },
    };
  }
}

export default async function PublicReportPage({params}: {params: Promise<{publicToken: string}>}) {
  const resolved = await params;

  return (
    <main>
      <AeoTopNav />

      <div className="page-shell report-page">
        <ReportView publicToken={resolved.publicToken} />
      </div>
    </main>
  );
}
