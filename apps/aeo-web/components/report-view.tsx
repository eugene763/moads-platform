"use client";

import {useEffect, useMemo, useState} from "react";

import {apiRequest, PublicScanReport} from "../lib/api";
import {trackGa4} from "../lib/analytics";
import {explainIssue, issueAction, normalizeUrlForDisplay, scoreToneClass, statusToneClass} from "../lib/aeo-ui";
import {AuthModal} from "./auth-modal";
import {CreditPacksModal} from "./credit-packs-modal";
import {ScoreRing} from "./score-ring";
import {AgencySupportBlock} from "./agency-support-block";

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

function formatIssueTitle(code: string): string {
  return code
    .replace(/_/g, " ")
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

export function ReportView({publicToken}: {publicToken: string}) {
  const [report, setReport] = useState<ScanDetail | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [packsOpen, setPacksOpen] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const [tipsBusy, setTipsBusy] = useState(false);
  const [pendingSiteScanIntent, setPendingSiteScanIntent] = useState(false);
  const [pendingPacksAfterAuth, setPendingPacksAfterAuth] = useState(false);

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

  async function refreshSessionAndWallet(): Promise<void> {
    try {
      await apiRequest("/v1/me");
      setIsAuthed(true);
      const wallet = await apiRequest<{wallet: {balance: number}}>("/v1/wallet/summary");
      setWalletBalance(wallet.wallet.balance);
    } catch {
      setIsAuthed(false);
      setWalletBalance(null);
    }
  }

  useEffect(() => {
    void refreshSessionAndWallet();
  }, []);

  const statusLabel = useMemo(() => {
    if (!report) {
      return "loading";
    }
    return report.status.replace(/_/g, " ");
  }, [report]);

  async function claimScanIfNeeded(): Promise<void> {
    if (!report || !report.recommendationsLocked) {
      return;
    }

    setClaimBusy(true);
    try {
      const claimed = await apiRequest<ScanDetail>(`/v1/aeo/scans/${report.scanId}/claim`, {
        method: "POST",
      });
      setReport(claimed);
    } finally {
      setClaimBusy(false);
    }
  }

  async function handleAuthSuccess(): Promise<void> {
    try {
      await refreshSessionAndWallet();
      await claimScanIfNeeded();

      if (pendingPacksAfterAuth) {
        setPacksOpen(true);
      }

      if (pendingSiteScanIntent && report) {
        const destination = `/scans?intent=site-scan&siteUrl=${encodeURIComponent(report.siteUrl)}&scanId=${encodeURIComponent(report.scanId)}`;
        window.location.href = destination;
        return;
      }

      setAuthOpen(false);
      setPendingSiteScanIntent(false);
      setPendingPacksAfterAuth(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to unlock report.");
    }
  }

  async function handleClaim(): Promise<void> {
    if (!report) {
      return;
    }

    if (!isAuthed) {
      setAuthOpen(true);
      return;
    }

    setClaimBusy(true);
    setError(null);

    try {
      const claimed = await apiRequest<ScanDetail>(`/v1/aeo/scans/${report.scanId}/claim`, {
        method: "POST",
      });
      setReport(claimed);
      await refreshSessionAndWallet();
      trackGa4("aeo_scan_claimed", {
        scan_id: report.scanId,
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to unlock report.");
    } finally {
      setClaimBusy(false);
    }
  }

  async function handleGenerateTips(): Promise<void> {
    if (!report) {
      return;
    }

    if (!isAuthed) {
      setPendingPacksAfterAuth(true);
      setAuthOpen(true);
      return;
    }

    if (report.recommendationsLocked) {
      await handleClaim();
      return;
    }

    if ((walletBalance ?? 0) <= 0) {
      setPacksOpen(true);
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

      setReport((previous) => previous ? {
        ...previous,
        aiTips: {tips: result.tips},
      } : previous);
      await refreshSessionAndWallet();

      trackGa4("aeo_ai_tips_generated", {
        scan_id: report.scanId,
      });
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "AI tips failed.";
      if (/insufficient|credit/i.test(message)) {
        setPacksOpen(true);
      } else {
        setError(message);
      }
    } finally {
      setTipsBusy(false);
    }
  }

  async function handleUnblockAllTips(): Promise<void> {
    if (!report) {
      return;
    }

    await handleGenerateTips();
  }

  function handleFullSiteIntent(): void {
    if (!report) {
      return;
    }

    if (!isAuthed) {
      setPendingSiteScanIntent(true);
      setAuthOpen(true);
      return;
    }

    window.location.href = `/scans?intent=site-scan&siteUrl=${encodeURIComponent(report.siteUrl)}&scanId=${encodeURIComponent(report.scanId)}`;
  }

  function printReport(): void {
    window.print();
  }

  async function shareResult(): Promise<void> {
    if (!report) {
      return;
    }

    const sharePayload = {
      title: "MO AEO CHECKER report",
      text: `AI Discovery Readiness: ${report.publicScore ?? "--"}/100 for ${normalizeUrlForDisplay(report.siteUrl)}`,
      url: window.location.href,
    };

    if (navigator.share) {
      await navigator.share(sharePayload).catch(() => undefined);
      return;
    }

    await navigator.clipboard.writeText(window.location.href).catch(() => undefined);
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

  const crawlability = report.report.evidence?.crawlability;
  const actionPlan = report.report.actionPlan;
  const scanModeNote = report.report.summary?.scanModeNote;
  const displayUrl = normalizeUrlForDisplay(report.siteUrl || report.finalUrl || "");

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

  const topFixes = report.report.topFixes?.length ? report.report.topFixes : report.recommendations;
  const topFixesVisibleLimit = report.recommendationsLocked ? 3 : 5;
  const visibleTopFixes = topFixes.slice(0, topFixesVisibleLimit);
  const topFixesPreview = topFixes[topFixesVisibleLimit] ?? null;

  const issuesVisibleLimit = report.recommendationsLocked ? 3 : 5;
  const visibleIssues = report.issues.slice(0, issuesVisibleLimit);
  const issuesPreview = report.issues[issuesVisibleLimit] ?? null;

  return (
    <div className="report-shell">
      <section className="panel score-card">
        <ScoreRing score={publicScore} />
        <div className="score-text-block">
          <p className="score-kicker">AI DISCOVERY READINESS OF</p>
          <h1 className="score-url-heading">{displayUrl || "this page"}</h1>
          <p className={`score-heading ${scoreToneClass(publicScore)}`}>{publicScore}/100</p>
          <p className={`status-chip ${statusToneClass(statusLabel)}`}>{statusLabel}</p>
          <p className="warning-line">⚠️ This result covers one scanned page only, not full site readiness.</p>
          {scanModeNote ? <p className="tiny note-banner">{scanModeNote}</p> : null}
        </div>
        <div className="score-actions">
          <button type="button" className="cta-primary" onClick={handleFullSiteIntent} disabled={claimBusy || tipsBusy}>
            {claimBusy ? "Unlocking..." : "Run key-page site scan"}
          </button>
          <button type="button" className="cta-ghost" onClick={() => void shareResult()}>Share</button>
          <button type="button" className="cta-ghost" onClick={printReport}>Print</button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Top Fixes</h2>
          <span className="badge badge-score">{visibleTopFixes.length} visible</span>
        </div>
        {actionPlan?.fastestWin ? (
          <article className="surface-card" style={{marginBottom: "14px"}}>
            <h3>Fastest win</h3>
            <p className="list-title">{actionPlan.fastestWin.title}</p>
            <p className="tiny">{actionPlan.fastestWin.description}</p>
          </article>
        ) : null}
        <ul className="list">
          {visibleTopFixes.map((recommendation) => (
            <li key={recommendation.id}>
              <div>
                <p className="list-title">{recommendation.title}</p>
                <p className="tiny">{recommendation.description}</p>
              </div>
              <span className={`badge ${impactBadgeClass(recommendation.impactScore)}`}>+{recommendation.impactScore}</span>
            </li>
          ))}
          {topFixesPreview ? (
            <li className="blur-preview">
              <div>
                <p className="list-title">{topFixesPreview.title}</p>
                <p className="tiny">{topFixesPreview.description}</p>
              </div>
              <span className={`badge ${impactBadgeClass(topFixesPreview.impactScore)}`}>+{topFixesPreview.impactScore}</span>
            </li>
          ) : null}
        </ul>

        {report.recommendationsLocked ? (
          <div className="lock-panel">
            <p>{report.lockedRecommendationsCount} more fixes and deeper diagnostics unlock after sign-in.</p>
            <button type="button" className="cta-primary" onClick={() => setAuthOpen(true)} disabled={claimBusy}>
              {claimBusy ? "Unlocking..." : "Unlock all fixes"}
            </button>
          </div>
        ) : (
          <div className="unlock-panel">
            <p>Need deeper recommendations for this URL? Use 1 credit to unlock extended report depth.</p>
            <button type="button" className="cta-primary" onClick={() => void handleUnblockAllTips()} disabled={tipsBusy}>
              {tipsBusy ? "Unblocking..." : "Unblock all tips"}
            </button>
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
                <button type="button" className="cta-ghost" onClick={() => setAuthOpen(true)} disabled={claimBusy}>
                  Unlock hidden block
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
      </section>

      {report.issues.length ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Current Issues</h2>
            <span className="badge badge-score">{report.issues.length} signals</span>
          </div>
          <ul className="list">
            {visibleIssues.map((issue) => (
              <li key={issue.code}>
                <div>
                  <p className="list-title">{formatIssueTitle(issue.code)}</p>
                  <p className="tiny">{explainIssue(issue.code, issue.message)}</p>
                  <p className="tiny issue-action"><strong>Action:</strong> {issueAction(issue.code)}</p>
                </div>
                <span className={`badge ${priorityBadgeClass(issue.severity)}`}>{issue.severity}</span>
              </li>
            ))}
            {issuesPreview ? (
              <li className="blur-preview">
                <div>
                  <p className="list-title">{formatIssueTitle(issuesPreview.code)}</p>
                  <p className="tiny">{explainIssue(issuesPreview.code, issuesPreview.message)}</p>
                  <p className="tiny issue-action"><strong>Action:</strong> {issueAction(issuesPreview.code)}</p>
                </div>
                <span className={`badge ${priorityBadgeClass(issuesPreview.severity)}`}>{issuesPreview.severity}</span>
              </li>
            ) : null}
          </ul>
          {report.recommendationsLocked ? (
            <div className="lock-panel">
              <p>{Math.max(0, report.issues.length - visibleIssues.length)} more issue diagnostics unlock after sign-in.</p>
              <button type="button" className="cta-primary" onClick={() => setAuthOpen(true)}>
                Sign in to unlock
              </button>
            </div>
          ) : report.issues.length > visibleIssues.length ? (
            <div className="unlock-panel">
              <p>Use 1 credit to unlock full issue diagnostics for this site and priority actions.</p>
              <button type="button" className="cta-primary" onClick={() => void handleUnblockAllTips()} disabled={tipsBusy}>
                {tipsBusy ? "Unblocking..." : "Unblock all tips"}
              </button>
            </div>
          ) : null}
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

      <AgencySupportBlock />

      {error ? <p className="error-text">{error}</p> : null}
      <AuthModal
        open={authOpen}
        onClose={() => {
          setAuthOpen(false);
          setPendingSiteScanIntent(false);
          setPendingPacksAfterAuth(false);
        }}
        onSuccess={handleAuthSuccess}
        source="report_unlock"
      />
      <CreditPacksModal
        open={packsOpen && isAuthed}
        onClose={() => setPacksOpen(false)}
        source="report_ai_tips"
      />
    </div>
  );
}
