"use client";

import {useEffect, useMemo, useRef, useState} from "react";

import {ApiRequestError, apiRequest, PublicScanReport} from "../lib/api";
import {trackGa4} from "../lib/analytics";
import {explainIssue, formatIssueTitle, issueAction, normalizeUrlForDisplay, scoreToneClass, statusToneClass} from "../lib/aeo-ui";
import {clearAeoAuthIntent, readAeoAuthIntent, saveAeoAuthIntent} from "../lib/auth-intent";
import {affectedPagesLabel, deriveCrawlerAccessibilityChecks, prepareCurrentIssues} from "../lib/current-issues";
import {AuthModal} from "./auth-modal";
import {CreditPacksModal} from "./credit-packs-modal";
import {ScoreRing} from "./score-ring";
import {AgencySupportBlock} from "./agency-support-block";

interface ScanDetail extends PublicScanReport {
  workspaceAccess?: {
    sharedFromAnotherWorkspace?: boolean;
  };
  aiTips?: {
    tips?: Array<{
      title: string;
      detail: string;
      priority: string;
      category: string;
    }>;
  };
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

function buildDeveloperIssueSummary(
  input: {
    siteUrl: string;
    score: number | null;
    issues: Array<{code: string; severity: string; message: string; affectedPages?: string[]}>;
  },
): string {
  const header = [
    "# AEO fixes for developer",
    "",
    `Site: ${input.siteUrl}`,
    `Score: ${input.score ?? "--"}/100`,
    "",
    "## Visible issues",
  ];

  const body = input.issues.map((issue, index) => [
    `${index + 1}. ${formatIssueTitle(issue.code)}`,
    `Severity: ${issue.severity}`,
    `Explanation: ${explainIssue(issue.code, issue.message)}`,
    `Action: ${issueAction(issue.code)}`,
    ...(issue.affectedPages?.length ? [`Affected pages: ${issue.affectedPages.join(", ")}`] : []),
  ].join("\n"));

  return [...header, ...body].join("\n\n");
}

export function ReportView({publicToken}: {publicToken: string}) {
  const [report, setReport] = useState<ScanDetail | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sharedWorkspaceReport, setSharedWorkspaceReport] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [packsOpen, setPacksOpen] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const [pendingSiteScanIntent, setPendingSiteScanIntent] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [deepScanHint, setDeepScanHint] = useState<string | null>(null);
  const [highlightDeepScanButton, setHighlightDeepScanButton] = useState(false);
  const scoreCardRef = useRef<HTMLElement | null>(null);
  const deepScanButtonRef = useRef<HTMLButtonElement | null>(null);

  const publicScore = report?.publicScore ?? 0;

  function isCrossAccountClaimError(error: unknown): boolean {
    return error instanceof ApiRequestError && error.code === "aeo_scan_claim_forbidden";
  }

  function showSharedWorkspaceNotice(): void {
    setSharedWorkspaceReport(true);
    setError(null);
    setAuthOpen(false);
    setPendingSiteScanIntent(false);
  }

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await apiRequest<ScanDetail>(`/v1/aeo/public-scans/${publicToken}`);
        setReport(data);
        setSharedWorkspaceReport(Boolean(data.workspaceAccess?.sharedFromAnotherWorkspace));
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
      setSharedWorkspaceReport(false);
    } finally {
      setClaimBusy(false);
    }
  }

  async function handleAuthSuccess(): Promise<void> {
    try {
      await refreshSessionAndWallet();
      await claimScanIfNeeded();

      const intent = readAeoAuthIntent();
      if ((pendingSiteScanIntent || intent?.type === "deep_site_scan") && report) {
        clearAeoAuthIntent();
        const destination = `/scans?intent=site-scan&siteUrl=${encodeURIComponent(report.siteUrl)}&scanId=${encodeURIComponent(report.scanId)}`;
        window.location.href = destination;
        return;
      }

      if (intent?.type === "unlock_report" && report) {
        clearAeoAuthIntent();
        window.location.href = `/scans?scanId=${encodeURIComponent(report.scanId)}`;
        return;
      }

      setAuthOpen(false);
      setPendingSiteScanIntent(false);
    } catch (requestError) {
      if (isCrossAccountClaimError(requestError)) {
        showSharedWorkspaceNotice();
      } else {
        setError(requestError instanceof Error ? requestError.message : "Failed to unlock report.");
      }
    }
  }

  async function handleClaim(): Promise<void> {
    if (!report) {
      return;
    }

    if (!isAuthed) {
      saveAeoAuthIntent({
        type: "unlock_report",
        publicToken,
        scanId: report.scanId,
        siteUrl: report.siteUrl,
      });
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
      setSharedWorkspaceReport(false);
      await refreshSessionAndWallet();
      trackGa4("aeo_scan_claimed", {
        scan_id: report.scanId,
      });
    } catch (requestError) {
      if (isCrossAccountClaimError(requestError)) {
        showSharedWorkspaceNotice();
      } else {
        setError(requestError instanceof Error ? requestError.message : "Failed to unlock report.");
      }
    } finally {
      setClaimBusy(false);
    }
  }

  function runOwnScan(): void {
    if (!report) {
      return;
    }

    if (!isAuthed) {
      saveAeoAuthIntent({
        type: "deep_site_scan",
        publicToken,
        scanId: report.scanId,
        siteUrl: report.siteUrl,
      });
      setPendingSiteScanIntent(true);
      setAuthOpen(true);
      return;
    }

    window.location.href = `/scans?intent=site-scan&siteUrl=${encodeURIComponent(report.siteUrl)}&scanId=${encodeURIComponent(report.scanId)}`;
  }

  function handleDeepSiteScanIntent(): void {
    if (!report) {
      return;
    }

    if (!isAuthed) {
      saveAeoAuthIntent({
        type: "deep_site_scan",
        publicToken,
        scanId: report.scanId,
        siteUrl: report.siteUrl,
      });
      setPendingSiteScanIntent(true);
      setAuthOpen(true);
      return;
    }

    if ((walletBalance ?? 0) <= 0) {
      setPacksOpen(true);
      return;
    }

    window.location.href = `/scans?intent=site-scan&siteUrl=${encodeURIComponent(report.siteUrl)}&scanId=${encodeURIComponent(report.scanId)}`;
  }

  function guideToDeepScanButton(): void {
    setDeepScanHint("Run a Deep Site Scan to unlock all diagnostics.");
    setHighlightDeepScanButton(true);
    window.setTimeout(() => setHighlightDeepScanButton(false), 1800);
    window.requestAnimationFrame(() => {
      scoreCardRef.current?.scrollIntoView({behavior: "smooth", block: "start"});
      deepScanButtonRef.current?.focus();
    });
  }

  function handleCurrentIssuesDeepScanCta(): void {
    if (!report) {
      return;
    }

    if (!isAuthed) {
      handleDeepSiteScanIntent();
      return;
    }

    if ((walletBalance ?? 0) <= 0) {
      setPacksOpen(true);
      return;
    }

    guideToDeepScanButton();
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

  async function copyVisibleIssuesForDeveloper(issues: Array<{code: string; severity: string; message: string; affectedPages?: string[]}>): Promise<void> {
    if (!report) {
      return;
    }

    const summary = buildDeveloperIssueSummary({
      siteUrl: report.siteUrl || displayUrl,
      score: report.publicScore,
      issues,
    });

    try {
      await navigator.clipboard.writeText(summary);
      setExportMessage("Fix list copied for developer");
    } catch {
      setExportMessage("Could not copy automatically. Select and copy the visible issue list manually.");
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

  const scanModeNote = report.report.summary?.scanModeNote?.replace(
    /Deep Site Scan sampled \d+ pages in launch mode\./,
    "Deep Site Scan sampled key pages in launch mode.",
  );
  const displayUrl = normalizeUrlForDisplay(report.siteUrl || report.finalUrl || "");

  const scoredNow = [
    ["AI Crawler Accessibility", report.report.dimensions?.aiCrawlerAccessibility],
    ["Answer Optimization", report.report.dimensions?.answerOptimization],
    ["Citation Readiness", report.report.dimensions?.citationReadiness],
    ["Technical Hygiene", report.report.dimensions?.technicalHygiene],
  ] as const;

  const currentIssues = prepareCurrentIssues(report);
  const crawlerChecks = deriveCrawlerAccessibilityChecks(report, currentIssues);
  const visibleCrawlerRows = crawlerChecks.visible;
  const hiddenCrawlerRows = crawlerChecks.hidden;
  const issuesVisibleLimit = report.recommendationsLocked ? 3 : 5;
  const visibleIssues = currentIssues.slice(0, issuesVisibleLimit);
  const issuesPreview = currentIssues[issuesVisibleLimit] ?? null;
  const currentIssuesBadge = currentIssues.length === report.issues.length ?
    `${currentIssues.length} issues` :
    `${currentIssues.length} issues · ${report.issues.length} findings`;

  return (
    <div className="report-shell">
      <section className="panel score-card" ref={scoreCardRef}>
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
          <button
            ref={deepScanButtonRef}
            type="button"
            className={`cta-primary${highlightDeepScanButton ? " cta-highlight" : ""}`}
            onClick={handleDeepSiteScanIntent}
            disabled={claimBusy}
          >
            {claimBusy ? "Unlocking..." : "Run Deep Site Scan"}
          </button>
          <button type="button" className="cta-ghost" onClick={() => void shareResult()}>Share</button>
          <button type="button" className="cta-ghost" onClick={printReport}>Print</button>
        </div>
        {deepScanHint ? <p className="scan-form-hint">{deepScanHint}</p> : null}
      </section>

      {sharedWorkspaceReport ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Shared report</h2>
            <span className="badge badge-score">View only</span>
          </div>
          <p className="tiny">This is a shared report from another workspace.</p>
          <p className="tiny">Run your own scan to save results to your account and unlock deeper checks.</p>
          <button type="button" className="cta-primary" onClick={runOwnScan}>
            Run my own scan
          </button>
        </section>
      ) : null}

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
                <button type="button" className="cta-ghost" onClick={handleDeepSiteScanIntent} disabled={claimBusy}>
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

      {currentIssues.length ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Current Issues</h2>
            <div className="panel-actions">
              <button type="button" className="cta-ghost compact-button" onClick={() => void copyVisibleIssuesForDeveloper(visibleIssues)}>
                Send fixes to developer
              </button>
              <span className="badge badge-score">{currentIssuesBadge}</span>
            </div>
          </div>
          {exportMessage ? <p className="toast-message">{exportMessage}</p> : null}
          <ul className="list">
            {visibleIssues.map((issue) => (
              <li key={issue.code}>
                <div>
                  <p className="list-title">{formatIssueTitle(issue.code)}</p>
                  <p className="tiny">{explainIssue(issue.code, issue.message)}</p>
                  <p className="tiny issue-action"><strong>Action:</strong> {issueAction(issue.code)}</p>
                  {affectedPagesLabel(issue) ? <p className="tiny">{affectedPagesLabel(issue)}</p> : null}
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
                  {affectedPagesLabel(issuesPreview) ? <p className="tiny">{affectedPagesLabel(issuesPreview)}</p> : null}
                </div>
                <span className={`badge ${priorityBadgeClass(issuesPreview.severity)}`}>{issuesPreview.severity}</span>
              </li>
            ) : null}
          </ul>
          {report.recommendationsLocked ? (
            <div className="lock-panel">
              <p>{Math.max(0, currentIssues.length - visibleIssues.length)} more issue diagnostics unlock after sign-in.</p>
              <button type="button" className="cta-primary" onClick={handleCurrentIssuesDeepScanCta}>
                Unlock all fixes
              </button>
            </div>
          ) : currentIssues.length > visibleIssues.length ? (
            <div className="unlock-panel">
              <p>Use 1 credit to unlock full issue diagnostics for this site and priority actions.</p>
              <button type="button" className="cta-primary" onClick={handleCurrentIssuesDeepScanCta}>
                Run Deep Site Scan
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
        }}
        onSuccess={handleAuthSuccess}
        source="report_unlock"
      />
      <CreditPacksModal
        open={packsOpen && isAuthed}
        onClose={() => setPacksOpen(false)}
        source="report_deep_site_scan"
      />
    </div>
  );
}
