"use client";

import Link from "next/link";
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

  const ratingStatus = report?.report.summary?.ratingSchemaStatus ?? "unknown";
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
      return "Loading";
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
      trackGa4("aeo_auth_success");
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
      // error is already handled above
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

  return (
    <div className="report-shell">
      <section className="panel score-card">
        <ScoreRing score={publicScore} />
        <div className="score-text-block">
          <p className="score-kicker">AI Discovery Score (Beta)</p>
          <h1 className="score-heading">{publicScore}/100</h1>
          <p className="score-summary">
            Deterministic score from raw page evidence. Current page status:
            {" "}
            <strong>{statusLabel}</strong>
            .
          </p>
          <div className="score-badges">
            <span className="badge badge-score">Schema {ratingStatus}</span>
            <span className="badge badge-score">Confidence {report.confidenceLevel ?? "unknown"}</span>
            <span className="badge badge-score">{report.recommendationsLocked ? "Locked report" : "Unlocked report"}</span>
          </div>
        </div>
        <div className="score-actions">
          <button type="button" className="cta-ghost" onClick={() => window.print()}>Print</button>
          <button type="button" className="cta-ghost" onClick={() => void copyLink()}>Copy Link</button>
          <Link className="cta-primary" href="/dashboard">Open Dashboard</Link>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Evidence</h2>
          <span className="badge badge-score">Raw HTML mode</span>
        </div>
        <div className="evidence-grid">
          <article className="surface-card">
            <h3>Structured Data</h3>
            <p>ratingValue: {aggregate?.ratingValue ?? "not found"}</p>
            <p>reviewCount: {aggregate?.reviewCount ?? aggregate?.ratingCount ?? "not found"}</p>
            <p className="tiny">Schema visibility is validated against public page evidence only.</p>
          </article>
          <article className="surface-card">
            <h3>On-page Evidence</h3>
            <p>Visible rating: {onPage?.ratingValue ?? "not found"}</p>
            <p>Visible reviews: {onPage?.reviewsCount ?? "not found"}</p>
            <p className="tiny">{onPage?.snippet ?? "No matching snippet found in raw HTML."}</p>
          </article>
        </div>
        <p className="tiny">Structured data validity still does not guarantee rich-result display in search surfaces.</p>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Top Fixes</h2>
          <span className="badge badge-score">{report.recommendations.length} visible</span>
        </div>
        <ul className="list">
          {report.recommendations.map((recommendation) => (
            <li key={recommendation.id}>
              <div>
                <p className="list-title">{recommendation.title}</p>
                <p className="tiny">{recommendation.description}</p>
              </div>
              <span className={`badge ${impactBadgeClass(recommendation.impactScore)}`}>
                +{recommendation.impactScore}
              </span>
            </li>
          ))}
        </ul>

        {report.recommendationsLocked ? (
          <div className="lock-panel">
            <p>{report.lockedRecommendationsCount} more fixes unlock after sign-in and scan claim.</p>
            <button type="button" className="cta-primary" onClick={handleClaim} disabled={authBusy || claimBusy}>
              {authBusy || claimBusy ? "Unlocking..." : "Sign In and Unlock"}
            </button>
          </div>
        ) : (
          <div className="unlock-panel">
            <p>Full report unlocked. AI tips stay explicit and cost 1 credit per run.</p>
            <button type="button" className="cta-primary" onClick={handleGenerateTips} disabled={tipsBusy}>
              {tipsBusy ? "Generating..." : "Generate AI Tips (1 Credit)"}
            </button>
            <p className="tiny">
              Need more credits?
              {" "}
              <a href="https://lab.moads.agency/center" target="_blank" rel="noreferrer">Open the billing center</a>
              .
            </p>
          </div>
        )}
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
