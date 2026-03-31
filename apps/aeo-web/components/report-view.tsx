"use client";

import Link from "next/link";
import {useEffect, useMemo, useState} from "react";

import {apiRequest, PublicScanReport} from "../lib/api";
import {trackGa4} from "../lib/analytics";
import {signInForAeoSession} from "../lib/firebase";

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

export function ReportView({publicToken}: {publicToken: string}) {
  const [report, setReport] = useState<ScanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const [tipsBusy, setTipsBusy] = useState(false);

  const ratingStatus = report?.report.summary?.ratingSchemaStatus ?? "unknown";

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

  const scoreLabel = useMemo(() => {
    if (!report?.publicScore && report?.publicScore !== 0) {
      return "--";
    }

    return String(report.publicScore);
  }, [report?.publicScore]);

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
      // error already set
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

  if (loading) {
    return <div className="state-card">Loading report...</div>;
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
      <section className="report-top">
        <div className="score-card">
          <p className="score-kicker">AI Discovery Score (Beta)</p>
          <p className="score-value">{scoreLabel}<span>/100</span></p>
          <p className="score-meta">Ratings schema status: <strong>{ratingStatus}</strong></p>
        </div>
        <div className="score-actions">
          <button type="button" className="cta-ghost" onClick={() => window.print()}>Print</button>
          <button type="button" className="cta-ghost" onClick={() => navigator.clipboard.writeText(window.location.href)}>Copy Link</button>
          <Link className="cta-primary" href="/dashboard">Open Dashboard</Link>
        </div>
      </section>

      <section className="panel">
        <h2>Evidence</h2>
        <div className="evidence-grid">
          <article>
            <h3>Structured Data</h3>
            <p>ratingValue: {aggregate?.ratingValue ?? "not found"}</p>
            <p>reviewCount: {aggregate?.reviewCount ?? aggregate?.ratingCount ?? "not found"}</p>
          </article>
          <article>
            <h3>On-page Evidence</h3>
            <p>Visible rating: {onPage?.ratingValue ?? "not found"}</p>
            <p>Visible reviews: {onPage?.reviewsCount ?? "not found"}</p>
            <p className="tiny">{onPage?.snippet ?? "No matching snippet found in raw HTML."}</p>
          </article>
        </div>
        <p className="tiny">Scanner mode: raw HTML only (rendered mode in next iteration).</p>
      </section>

      <section className="panel">
        <h2>Top Fixes</h2>
        <ul className="list">
          {report.recommendations.map((recommendation) => (
            <li key={recommendation.id}>
              <div>
                <p className="list-title">{recommendation.title}</p>
                <p className="tiny">{recommendation.description}</p>
              </div>
              <span className="badge">+{recommendation.impactScore}</span>
            </li>
          ))}
        </ul>

        {report.recommendationsLocked ? (
          <div className="lock-panel">
            <p>{report.lockedRecommendationsCount} fixes are locked. Sign in to unlock full breakdown.</p>
            <button type="button" className="cta-primary" onClick={handleClaim} disabled={authBusy || claimBusy}>
              {authBusy || claimBusy ? "Unlocking..." : "Sign In and Unlock"}
            </button>
          </div>
        ) : (
          <div className="unlock-panel">
            <p>Full report unlocked.</p>
            <button type="button" className="cta-primary" onClick={handleGenerateTips} disabled={tipsBusy}>
              {tipsBusy ? "Generating..." : "Generate AI Tips (1 Credit)"}
            </button>
            <p className="tiny">
              Need more credits? <Link href="https://lab.moads.agency/center">Open the billing center</Link>.
            </p>
          </div>
        )}
      </section>

      {report.aiTips?.tips?.length ? (
        <section className="panel">
          <h2>AI Tips</h2>
          <ul className="list">
            {report.aiTips.tips.map((tip, index) => (
              <li key={`${tip.title}-${index}`}>
                <div>
                  <p className="list-title">{tip.title}</p>
                  <p className="tiny">{tip.detail}</p>
                </div>
                <span className="badge">{tip.priority}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}
