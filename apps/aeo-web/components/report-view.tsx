"use client";

import {useEffect, useMemo, useState} from "react";

import {apiRequest, PublicScanReport} from "../lib/api";
import {trackGa4} from "../lib/analytics";
import {signInForAeoSession} from "../lib/firebase";
import {ScoreRing} from "./score-ring";

interface ScanDetail extends PublicScanReport {
  aiTips?: {
    tips?: Array<{
      title: string;
      detail: string;
      priority: string;
      category: string;
    }>;
  };
}

function impactBadgeClass(impactScore: number): string {
  if (impactScore >= 7) {
    return "badge-high";
  }
  if (impactScore >= 4) {
    return "badge-med";
  }
  return "badge-low";
}

function priorityBadgeClass(priority: string): string {
  const normalized = priority.trim().toLowerCase();
  if (normalized === "high") {
    return "badge-high";
  }
  if (normalized === "medium" || normalized === "med") {
    return "badge-med";
  }
  return "badge-low";
}

export function ReportView({publicToken}: {publicToken: string}) {
  const [report, setReport] = useState<ScanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const [tipsBusy, setTipsBusy] = useState(false);

  const publicScore = report?.publicScore ?? 0;

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await apiRequest<ScanDetail>(`/v1/aeo/public-scans/${publicToken}`);
        setReport(data);
        trackGa4("aeo_report_view", {
          status: data.status,
          score: data.publicScore,
        });
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Failed to load report.");
      } finally {
        setLoading(false);
      }
    })();
  }, [publicToken]);

  const statusLabel = useMemo(() => {
    if (!report) {
      return "loading";
    }
    return report.status.replace(/_/g, " ");
  }, [report]);

  async function loginAndCreateSession(): Promise<void> {
    setAuthBusy(true);
    setError(null);

    try {
      const idToken = await signInForAeoSession();
      await apiRequest("/v1/auth/session-login", {
        method: "POST",
        body: JSON.stringify({
          idToken,
          productCode: "aeo",
        }),
      });
      trackGa4("aeo_auth_success", {source: "report"});
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Sign in failed.");
      throw authError;
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleClaim(): Promise<void> {
    if (!report) {
      return;
    }

    setClaimBusy(true);
    setError(null);

    try {
      await loginAndCreateSession();
      const claimed = await apiRequest<ScanDetail>(`/v1/aeo/scans/${report.scanId}/claim`, {
        method: "POST",
      });
      setReport(claimed);
      trackGa4("aeo_scan_claimed", {
        scan_id: report.scanId,
      });
    } catch {
      // handled above
    } finally {
      setClaimBusy(false);
    }
  }

  async function handleGenerateTips(): Promise<void> {
    if (!report) {
      return;
    }

    setTipsBusy(true);
    setError(null);

    try {
      const result = await apiRequest<{tips: Array<{title: string; detail: string; priority: string; category: string}>}>(
        `/v1/aeo/scans/${report.scanId}/generate-ai-tips`,
        {
          method: "POST",
          body: JSON.stringify({
            planCode: "free",
          }),
        },
      );

      setReport((prev) => prev ? {
        ...prev,
        aiTips: {tips: result.tips},
      } : prev);

      trackGa4("aeo_ai_tips_generated", {
        scan_id: report.scanId,
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "AI tips failed.");
    } finally {
      setTipsBusy(false);
    }
  }

  async function handleFullSiteIntent(): Promise<void> {
    if (!report) {
      return;
    }

    if (report.recommendationsLocked) {
      await handleClaim();
      return;
    }

    window.location.href = `/dashboard?intent=site-scan&scanId=${encodeURIComponent(report.scanId)}`;
  }

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // noop
    }
  }

  if (loading) {
    return (
      <div className="panel">
        <div className="skeleton-pulse" />
      </div>
    );
  }

  if (error && !report) {
    return <div className="state-card error-text">{error}</div>;
  }

  if (!report) {
    return <div className="state-card">Report not found.</div>;
  }

  const aggregate = report.report.evidence?.structuredData?.aggregateRating;
  const onPage = report.report.evidence?.onPage;
  const crawlability = report.report.evidence?.crawlability;
  const productPage = report.report.evidence?.productPage;
  const actionPlan = report.report.actionPlan;
  const scanModeNote = report.report.summary?.scanModeNote;

  const scoredNow = [
    ["AI Crawler Accessibility", report.report.dimensions?.aiCrawlerAccessibility],
    ["Answer Optimization", report.report.dimensions?.answerOptimization],
    ["Citation Readiness", report.report.dimensions?.citationReadiness],
    ["Technical Hygiene", report.report.dimensions?.technicalHygiene],
  ] as const;

  const visibleCrawlerRows: Array<{label: string; value: string}> = [
    {label: "Sitemap", value: crawlability?.sitemapExists ? "found" : "not found"},
    {label: "Robots.txt", value: crawlability?.robotsExists ? "found" : "not found"},
    {
      label: "Pre-rendered text",
      value: report.confidenceLevel === "low" ? "limited" : "detected",
    },
  ];

  const hiddenCrawlerRows: Array<{label: string; value: string}> = [
    {
      label: "llms.txt",
      value: crawlability?.llmsTxtExists ? "found" : "not found",
    },
    {
      label: "LLM guidance page",
      value: crawlability?.llmGuidancePage ? "found" : "not found",
    },
    {
      label: "Canonical stability",
      value: report.issues.some((issue) => issue.code === "canonical_missing") ? "needs fix" : "stable",
    },
    {
      label: "Blocked content",
      value: report.status === "blocked" ? "risk" : "clear",
    },
  ];

  const topFixes = (report.report.topFixes?.length ? report.report.topFixes : report.recommendations).slice(0, 5);

  return (
    <div className="report-shell">
      <section className="panel score-card">
        <ScoreRing score={publicScore} />
        <div className="score-text-block">
          <p className="score-kicker">AI Discovery Readiness of page</p>
          <h1 className="score-heading">{publicScore}/100</h1>
          <p className="score-summary">
            Objective readiness snapshot for one page based on server-side parsing.
            Current page status: <strong>{statusLabel}</strong>.
          </p>
          <p className="tiny">This result covers one scanned page only, not full site readiness.</p>
          {scanModeNote ? <p className="tiny note-banner">{scanModeNote}</p> : null}
        </div>
        <div className="score-actions">
          <button type="button" className="cta-ghost" onClick={() => window.print()}>Print</button>
          <button type="button" className="cta-ghost" onClick={() => void copyLink()}>Copy Link</button>
          <button type="button" className="cta-primary" onClick={() => void handleFullSiteIntent()} disabled={authBusy || claimBusy}>
            {authBusy || claimBusy ? "Unlocking..." : "Scan whole site"}
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Top Fixes</h2>
          <span className="badge badge-score">{topFixes.length} visible</span>
        </div>
        {actionPlan?.fastestWin ? (
          <article className="surface-card" style={{marginBottom: "14px"}}>
            <h3>Fastest win</h3>
            <p className="list-title">{actionPlan.fastestWin.title}</p>
            <p className="tiny">{actionPlan.fastestWin.description}</p>
          </article>
        ) : null}
        <ul className="list">
          {topFixes.map((recommendation) => (
            <li key={recommendation.id}>
              <div>
                <p className="list-title">{recommendation.title}</p>
                <p className="tiny">{recommendation.description}</p>
              </div>
              <span className={`badge ${impactBadgeClass(recommendation.impactScore)}`}>+{recommendation.impactScore}</span>
            </li>
          ))}
        </ul>

        {report.recommendationsLocked ? (
          <div className="lock-panel">
            <p>{report.lockedRecommendationsCount} more fixes and deeper diagnostics unlock after sign-in.</p>
            <button type="button" className="cta-primary" onClick={handleClaim} disabled={authBusy || claimBusy}>
              {authBusy || claimBusy ? "Unlocking..." : "Sign in and unlock"}
            </button>
          </div>
        ) : (
          <div className="unlock-panel">
            <p>Expanded report unlocked. You can now run full-site actions and credit-powered AI tips.</p>
            <button type="button" className="cta-primary" onClick={handleGenerateTips} disabled={tipsBusy}>
              {tipsBusy ? "Generating..." : "Generate AI Tips (1 Credit)"}
            </button>
            <p className="tiny">
              Need more credits? {" "}
              <a href="https://lab.moads.agency/center" target="_blank" rel="noreferrer">Open the billing center</a>.
            </p>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>AI Crawler Accessibility</h2>
          <span className="badge badge-score">Scored + locked details</span>
        </div>
        <div className="evidence-grid">
          <article className="surface-card">
            <h3>Scored now</h3>
            <ul className="meta-list">
              {scoredNow.map(([label, value]) => (
                <li key={label}>
                  <span>{label}</span>
                  <strong>{value ?? "--"}</strong>
                </li>
              ))}
            </ul>
          </article>
          <article className="surface-card">
            <h3>Visible checks</h3>
            <ul className="meta-list">
              {visibleCrawlerRows.map((row) => (
                <li key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </li>
              ))}
            </ul>
            {report.recommendationsLocked ? (
              <div className="locked-subset">
                <p className="tiny">Sign in to unlock additional crawler checks.</p>
                <ul className="meta-list locked-rows">
                  {hiddenCrawlerRows.map((row) => (
                    <li key={row.label}>
                      <span>{row.label}</span>
                      <strong>locked</strong>
                    </li>
                  ))}
                </ul>
                <button type="button" className="cta-ghost" onClick={handleClaim} disabled={authBusy || claimBusy}>
                  {authBusy || claimBusy ? "Unlocking..." : "Unlock hidden block"}
                </button>
              </div>
            ) : (
              <ul className="meta-list" style={{marginTop: "10px"}}>
                {hiddenCrawlerRows.map((row) => (
                  <li key={row.label}>
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>
        <p className="tiny">Extra evidence supports prioritization. It does not claim live multi-engine visibility measurement.</p>
      </section>

      {report.issues.length ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Current Issues</h2>
            <span className="badge badge-score">{report.issues.length} signals</span>
          </div>
          <ul className="list">
            {report.issues.map((issue) => (
              <li key={issue.code}>
                <div>
                  <p className="list-title">{issue.code}</p>
                  <p className="tiny">{issue.message}</p>
                </div>
                <span className={`badge ${priorityBadgeClass(issue.severity)}`}>{issue.severity}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {report.aiTips?.tips?.length ? (
        <section className="panel">
          <div className="panel-header">
            <h2>AI Tips</h2>
            <span className="badge badge-score">{report.aiTips.tips.length} generated</span>
          </div>
          <ul className="list">
            {report.aiTips.tips.map((tip, index) => (
              <li key={`${tip.title}-${index}`}>
                <div>
                  <p className="list-title">{tip.title}</p>
                  <p className="tiny">{tip.detail}</p>
                </div>
                <span className={`badge ${priorityBadgeClass(tip.priority)}`}>{tip.priority}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}
