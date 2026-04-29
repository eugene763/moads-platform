"use client";

import {useRouter} from "next/navigation";
import {FormEvent, useEffect, useMemo, useRef, useState} from "react";

import {ApiRequestError, apiRequest, PublicScanReport} from "../lib/api";
import {explainIssue, issueAction, normalizeUrlForDisplay, scoreToneClass, statusToneClass, toSiteLabel, truncateSiteLabel} from "../lib/aeo-ui";
import {clearAeoAuthIntent, readAeoAuthIntent, saveAeoAuthIntent} from "../lib/auth-intent";
import {normalizeWebsiteUrlInput, WEBSITE_URL_ERROR} from "../lib/url-validation";
import {AgencySupportBlock} from "./agency-support-block";
import {AuthModal} from "./auth-modal";
import {CreditPacksModal} from "./credit-packs-modal";
import {ScoreRing} from "./score-ring";

type AuthMode = "signin" | "signup";

interface SessionSnapshot {
  account: {id: string};
  user: {email: string | null};
}

interface ScanItem {
  scanId: string;
  siteUrl: string;
  publicScore: number | null;
  status: string;
  createdAt: string;
  scanKind?: string;
}

interface ScanDetail extends PublicScanReport {
  siteUrl: string;
  aiTips?: {
    tips?: Array<{
      title: string;
      detail: string;
      priority: string;
      category: string;
    }>;
  };
}

function sortByDateDesc(scans: ScanItem[]): ScanItem[] {
  return [...scans].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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

function sortIssuesByPriority<T extends {severity?: string | null}>(issues: T[]): T[] {
  return issues
    .map((issue, index) => ({issue, index}))
    .sort((a, b) => {
      const priorityDelta = issuePriorityRank(a.issue.severity) - issuePriorityRank(b.issue.severity);
      return priorityDelta || a.index - b.index;
    })
    .map(({issue}) => issue);
}

function scanCostLabel(scanId: string, firstScanId: string | null): string {
  return scanId === firstScanId ? "Free" : "1 credit";
}

function buildDeveloperIssueSummary(
  input: {
    siteUrl: string;
    score: number | null;
    issues: Array<{code: string; severity: string; message: string}>;
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
  ].join("\n"));

  return [...header, ...body].join("\n\n");
}

export function ScansView() {
  const router = useRouter();
  const [queryScanId, setQueryScanId] = useState<string | null>(null);
  const [querySiteUrl, setQuerySiteUrl] = useState<string | null>(null);
  const [queryIntent, setQueryIntent] = useState<string | null>(null);

  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [scans, setScans] = useState<ScanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [packsOpen, setPacksOpen] = useState(false);
  const [pendingPacksAfterAuth, setPendingPacksAfterAuth] = useState(false);

  const [newSiteUrl, setNewSiteUrl] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [scanHint, setScanHint] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [highlightScanForm, setHighlightScanForm] = useState(false);
  const [highlightDeepScanButton, setHighlightDeepScanButton] = useState(false);
  const scanFormRef = useRef<HTMLElement | null>(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const selectedScoreCardRef = useRef<HTMLElement | null>(null);
  const deepScanButtonRef = useRef<HTMLButtonElement | null>(null);

  const [tabOrder, setTabOrder] = useState<string[]>([]);
  const [selectedSiteKey, setSelectedSiteKey] = useState<string | null>(null);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);
  const [selectedScanDetail, setSelectedScanDetail] = useState<ScanDetail | null>(null);
  const [queryApplied, setQueryApplied] = useState(false);

  const groupedSites = useMemo(() => {
    const groups = new Map<string, {key: string; label: string; scans: ScanItem[]}>();
    for (const scan of sortByDateDesc(scans)) {
      const label = toSiteLabel(scan.siteUrl);
      if (!groups.has(label)) {
        groups.set(label, {key: label, label, scans: []});
      }
      groups.get(label)?.scans.push(scan);
    }

    return Array.from(groups.values());
  }, [scans]);

  const sitesByKey = useMemo(() => {
    return new Map(groupedSites.map((site) => [site.key, site]));
  }, [groupedSites]);

  const visibleTabs = useMemo(() => {
    return tabOrder
      .filter((key) => sitesByKey.has(key))
      .slice(0, 6)
      .map((key) => sitesByKey.get(key)!)
      .filter(Boolean);
  }, [sitesByKey, tabOrder]);

  const selectedSite = useMemo(() => {
    if (selectedSiteKey && sitesByKey.has(selectedSiteKey)) {
      return sitesByKey.get(selectedSiteKey) ?? null;
    }

    const first = visibleTabs[0];
    return first ?? null;
  }, [selectedSiteKey, sitesByKey, visibleTabs]);

  const selectedSiteScans = selectedSite?.scans ?? [];
  const firstScanId = scans.length ? scans[scans.length - 1]?.scanId ?? null : null;

  const selectedScan = useMemo(() => {
    const fromCurrent = selectedSiteScans.find((scan) => scan.scanId === selectedScanId) ?? null;
    return fromCurrent ?? selectedSiteScans[0] ?? null;
  }, [selectedSiteScans, selectedScanId]);

  async function loadWorkspace(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const [sessionSnapshot, wallet, scanList] = await Promise.all([
        apiRequest<SessionSnapshot>("/v1/me"),
        apiRequest<{wallet: {balance: number}}>("/v1/wallet/summary"),
        apiRequest<{scans: ScanItem[]}>("/v1/aeo/scans"),
      ]);

      setSession(sessionSnapshot);
      setWalletBalance(wallet.wallet.balance);
      setScans(sortByDateDesc(scanList.scans));
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Failed to load scans workspace.";
      if (!/session|membership required|product membership/i.test(message)) {
        setError(message);
      }
      setSession(null);
      setScans([]);
      setSelectedSiteKey(null);
      setSelectedScanId(null);
      setSelectedScanDetail(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkspace();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    setQueryScanId(params.get("scanId"));
    setQuerySiteUrl(params.get("siteUrl") ?? params.get("prefill"));
    setQueryIntent(params.get("intent"));
  }, []);

  useEffect(() => {
    if (!groupedSites.length) {
      setTabOrder([]);
      setSelectedSiteKey(null);
      setSelectedScanId(null);
      return;
    }

    const availableKeys = groupedSites.map((site) => site.key);
    setTabOrder((previous) => {
      const kept = previous.filter((key) => availableKeys.includes(key));
      const extras = availableKeys.filter((key) => !kept.includes(key));
      return [...kept, ...extras].slice(0, 6);
    });
  }, [groupedSites]);

  useEffect(() => {
    if (!visibleTabs.length) {
      return;
    }

    if (!selectedSiteKey || !sitesByKey.has(selectedSiteKey)) {
      setSelectedSiteKey(visibleTabs[0]?.key ?? null);
      setSelectedScanId(visibleTabs[0]?.scans[0]?.scanId ?? null);
      return;
    }

    if (!selectedScanId || !selectedSiteScans.some((scan) => scan.scanId === selectedScanId)) {
      setSelectedScanId(selectedSiteScans[0]?.scanId ?? null);
    }
  }, [visibleTabs, selectedSiteKey, selectedScanId, selectedSiteScans, sitesByKey]);

  useEffect(() => {
    if (!session || !selectedScan?.scanId) {
      setSelectedScanDetail(null);
      return;
    }

    void (async () => {
      try {
        const detail = await apiRequest<ScanDetail>(`/v1/aeo/scans/${selectedScan.scanId}`);
        setSelectedScanDetail(detail);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Failed to load selected scan.");
      }
    })();
  }, [session, selectedScan?.scanId]);

  useEffect(() => {
    if (queryApplied || loading) {
      return;
    }

    const scanId = queryScanId;
    const prefill = querySiteUrl;
    const intent = queryIntent;

    if (prefill) {
      setNewSiteUrl(normalizeUrlForDisplay(prefill));
    }

    if (scanId && scans.length) {
      const matched = scans.find((scan) => scan.scanId === scanId);
      if (matched) {
        const siteKey = toSiteLabel(matched.siteUrl);
        setSelectedSiteKey(siteKey);
        setSelectedScanId(matched.scanId);
        setTabOrder((previous) => [siteKey, ...previous.filter((key) => key !== siteKey)].slice(0, 6));
      }
    }

    if (intent === "buy-credits") {
      if (session) {
        setPacksOpen(true);
      } else {
        setPendingPacksAfterAuth(true);
        setAuthMode("signup");
        setAuthOpen(true);
      }
    }

    if (intent === "site-scan" && !session) {
      if (prefill) {
        saveAeoAuthIntent({
          type: "deep_site_scan",
          siteUrl: prefill,
          scanId: scanId ?? undefined,
        });
      }
      setAuthMode("signin");
      setAuthOpen(true);
    }

    if (intent === "site-scan" && session && prefill) {
      void runFullCheckByUrl(prefill);
    }

    if (scanId || prefill || intent) {
      router.replace("/scans", {scroll: false});
    }

    setQueryApplied(true);
  }, [loading, queryApplied, queryIntent, queryScanId, querySiteUrl, router, scans, session]);

  function selectSite(siteKey: string): void {
    setSelectedSiteKey(siteKey);
    setTabOrder((previous) => [siteKey, ...previous.filter((key) => key !== siteKey)].slice(0, 6));
    const site = sitesByKey.get(siteKey);
    setSelectedScanId(site?.scans[0]?.scanId ?? null);
  }

  async function onAuthSuccess(): Promise<void> {
    setAuthOpen(false);
    await loadWorkspace();
    const intent = readAeoAuthIntent();
    if (intent?.type === "deep_site_scan" && intent.siteUrl) {
      clearAeoAuthIntent();
      await runFullCheckByUrl(intent.siteUrl);
      return;
    }
    if (pendingPacksAfterAuth) {
      setPacksOpen(true);
      setPendingPacksAfterAuth(false);
    }
  }

  async function runFullCheckByUrl(candidateRaw: string): Promise<void> {
    const candidate = normalizeWebsiteUrlInput(candidateRaw);
    if (!candidate) {
      setError(WEBSITE_URL_ERROR);
      return;
    }

    const candidateSiteKey = toSiteLabel(candidate);
    const isKnownSite = tabOrder.includes(candidateSiteKey);
    if (!isKnownSite && tabOrder.length >= 6) {
      alert("You reached the maximum number of reports. Delete one old report first.");
      return;
    }

    setScanBusy(true);
    setError(null);

    try {
      const created = await apiRequest<{scanId: string; publicToken: string; wallet?: {balance: number}}>("/v1/aeo/site-scans", {
        method: "POST",
        body: JSON.stringify({siteUrl: candidate, maxPages: 5}),
      });
      if (created.wallet) {
        setWalletBalance(created.wallet.balance);
      }

      await loadWorkspace();

      setSelectedSiteKey(candidateSiteKey);
      setSelectedScanId(created.scanId);
      setTabOrder((previous) => {
        const next = [candidateSiteKey, ...previous.filter((key) => key !== candidateSiteKey)];
        return next.slice(0, 6);
      });
      setNewSiteUrl("");
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.code === "insufficient_credits") {
        setPacksOpen(true);
      } else {
        setError(requestError instanceof Error ? requestError.message : "Failed to run full check.");
      }
    } finally {
      setScanBusy(false);
    }
  }

  async function runFullCheck(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await runFullCheckByUrl(newSiteUrl);
  }

  async function repeatSelectedScan(): Promise<void> {
    const sourceUrl = selectedScanDetail?.siteUrl ?? selectedScan?.siteUrl ?? "";
    const candidate = sourceUrl.trim();
    if (!candidate) {
      setError("No selected site URL to rescan.");
      return;
    }
    setNewSiteUrl(normalizeUrlForDisplay(candidate));
    await runFullCheckByUrl(candidate);
  }

  function guideToDeepScanButton(): void {
    setScanHint("Run a Deep site scan to unlock all diagnostics.");
    setHighlightDeepScanButton(true);
    window.setTimeout(() => setHighlightDeepScanButton(false), 1800);
    window.requestAnimationFrame(() => {
      selectedScoreCardRef.current?.scrollIntoView({behavior: "smooth", block: "start"});
      deepScanButtonRef.current?.focus();
    });
  }

  async function runDeepSiteScanForSelected(): Promise<void> {
    const sourceUrl = selectedScanDetail?.siteUrl ?? selectedScan?.siteUrl ?? newSiteUrl;
    if (!sourceUrl.trim()) {
      focusNewScanInput();
      return;
    }

    if (walletBalance <= 0) {
      setPacksOpen(true);
      return;
    }

    await runFullCheckByUrl(sourceUrl);
  }

  function handleCurrentIssuesDeepScanCta(): void {
    if (hasDeepSiteScanData) {
      return;
    }

    if (walletBalance <= 0) {
      setPacksOpen(true);
      return;
    }

    guideToDeepScanButton();
  }

  async function deleteSelectedScan(): Promise<void> {
    if (!selectedScan) {
      return;
    }

    const confirmed = window.confirm("Delete this scan?\n\nThis will remove the scan from your workspace. This action cannot be undone.");
    if (!confirmed) {
      return;
    }

    setDeleteBusy(true);
    setError(null);
    try {
      await apiRequest(`/v1/aeo/scans/${selectedScan.scanId}`, {
        method: "DELETE",
      });
      setScans((previous) => previous.filter((scan) => scan.scanId !== selectedScan.scanId));
      setSelectedScanDetail(null);
      setSelectedScanId(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to delete scan.");
    } finally {
      setDeleteBusy(false);
    }
  }

  function focusNewScanInput(): void {
    setSelectedSiteKey(null);
    setSelectedScanId(null);
    setNewSiteUrl("");
    setScanHint("Enter a website URL to start a new scan.");
    setHighlightScanForm(true);
    window.setTimeout(() => setHighlightScanForm(false), 1800);
    window.requestAnimationFrame(() => {
      scanFormRef.current?.scrollIntoView({behavior: "smooth", block: "start"});
      scanInputRef.current?.focus();
    });
  }

  async function shareSelectedReport(): Promise<void> {
    const shareUrl = selectedScanDetail?.publicToken ?
      `${window.location.origin}/r/${selectedScanDetail.publicToken}` :
      (selectedUrl || window.location.href);

    try {
      if (navigator.share) {
        await navigator.share({
          title: "MO AEO CHECKER result",
          text: `AEO scan result for ${selectedUrl || "site"}`,
          url: shareUrl,
        });
        return;
      }
    } catch {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      alert("Share link copied.");
    } catch {
      alert("Share is not available in this browser.");
    }
  }

  function printSelectedReport(): void {
    window.print();
  }

  async function copyVisibleIssuesForDeveloper(issuesToCopy: Array<{code: string; severity: string; message: string}>): Promise<void> {
    const summary = buildDeveloperIssueSummary({
      siteUrl: selectedScanDetail?.siteUrl ?? selectedScan?.siteUrl ?? selectedUrl,
      score: selectedScanDetail?.publicScore ?? selectedScan?.publicScore ?? null,
      issues: issuesToCopy,
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

  if (!session) {
    return (
      <div className="state-card">
        <h2>Scans</h2>
        <p>Sign in to open your AEO scan tabs and run full checks.</p>
        <button type="button" className="cta-primary" onClick={() => setAuthOpen(true)}>
          Sign In / Create Account
        </button>
        {error ? <p className="error-text">{error}</p> : null}
        <AuthModal
          open={authOpen}
          onClose={() => setAuthOpen(false)}
          onSuccess={onAuthSuccess}
          source="scans_gate"
          initialMode={authMode}
        />
      </div>
    );
  }

  const issues = sortIssuesByPriority(selectedScanDetail?.issues ?? []);
  const hasDeepSiteScanData = selectedScanDetail?.scanKind === "site_scan" || selectedScanDetail?.report.summary?.scope === "site";
  const issuesVisibleLimit = hasDeepSiteScanData ? issues.length : 5;
  const visibleIssues = issues.slice(0, issuesVisibleLimit);
  const issuesPreview = hasDeepSiteScanData ? null : issues[5] ?? null;
  const crawlability = selectedScanDetail?.report.evidence?.crawlability;
  const scoredNow = [
    ["AI Crawler Accessibility", selectedScanDetail?.report.dimensions?.aiCrawlerAccessibility],
    ["Answer Optimization", selectedScanDetail?.report.dimensions?.answerOptimization],
    ["Citation Readiness", selectedScanDetail?.report.dimensions?.citationReadiness],
    ["Technical Hygiene", selectedScanDetail?.report.dimensions?.technicalHygiene],
  ] as const;
  const visibleCrawlerRows = [
    {label: "Sitemap", value: crawlability?.sitemapExists ? "found" : "not found"},
    {label: "Robots.txt", value: crawlability?.robotsExists ? "found" : "not found"},
    {label: "Pre-rendered text", value: selectedScanDetail?.confidenceLevel === "low" ? "limited" : "detected"},
  ];
  const hiddenCrawlerRows = [
    {label: "llms.txt", value: crawlability?.llmsTxtExists ? "found" : "not found"},
    {label: "LLM guidance page", value: crawlability?.llmGuidancePage ? "found" : "not found"},
    {label: "Canonical stability", value: selectedScanDetail?.issues.some((issue) => issue.code === "canonical_missing") ? "needs fix" : "stable"},
    {label: "Blocked content", value: selectedScanDetail?.status === "blocked" ? "risk" : "clear"},
  ];

  const selectedUrl = normalizeUrlForDisplay(selectedScanDetail?.siteUrl ?? selectedScan?.siteUrl ?? "");
  const selectedScore = selectedScan?.publicScore ?? 0;
  const selectedStatusLabel = (selectedScan?.status ?? "pending").replace(/_/g, " ");
  const selectedScanCost = selectedScan ? scanCostLabel(selectedScan.scanId, firstScanId) : "Free";

  return (
    <div className="dashboard-grid">
      <section className={`panel full scans-form-panel${highlightScanForm ? " input-highlight" : ""}`} ref={scanFormRef}>
        <div className="panel-header">
          <h2>AI DISCOVERY READINESS CHECK</h2>
          <span className="badge badge-score">{walletBalance} credits</span>
        </div>
        <form className="inline-scan-form" onSubmit={(event) => void runFullCheck(event)}>
          <input
            ref={scanInputRef}
            type="text"
            placeholder="yoursite.com"
            value={newSiteUrl}
            onChange={(event) => setNewSiteUrl(event.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="submit" className="cta-primary" disabled={scanBusy}>
            {scanBusy ? "Scanning..." : "Run Deep site scan"}
          </button>
        </form>
        <p className="tiny">Scans the homepage and key discovery pages selected from sitemap, robots.txt and internal links.</p>
        {scanHint ? <p className="scan-form-hint">{scanHint}</p> : null}
      </section>

      <section className="panel full">
        <div className="panel-header">
          <h2>Scans</h2>
          <span className="badge badge-score">{scans.length} scans</span>
        </div>

        <div className="site-tabs tabs-wrap-two-rows">
          {visibleTabs.map((site) => (
            <button
              key={site.key}
              type="button"
              className={`site-tab${selectedSite?.key === site.key ? " active" : ""}`}
              onClick={() => selectSite(site.key)}
              title={site.label}
            >
              {truncateSiteLabel(site.label, 24)}
            </button>
          ))}
          <button
            type="button"
            className="site-tab add"
            onClick={() => {
              if (visibleTabs.length >= 6) {
                alert("You reached the maximum number of reports. Delete one old report first.");
                return;
              }
              focusNewScanInput();
            }}
            aria-label="Add report tab"
          >
            +
          </button>
        </div>

        {selectedScan ? (
          <>
            <article className="surface-card selected-scan-card score-card site-score-card" ref={selectedScoreCardRef}>
              <button
                type="button"
                className="score-delete-button"
                onClick={() => void deleteSelectedScan()}
                disabled={deleteBusy}
                aria-label="Delete scan"
              >
                ×
              </button>
              <ScoreRing score={selectedScore} />
              <div className="score-text-block">
                <p className="score-kicker">AI DISCOVERY READINESS OF SITE</p>
                <h3 className="score-url-heading">{selectedUrl || "this site"}</h3>
                <p className={`score-heading ${scoreToneClass(selectedScan.publicScore)}`}>{selectedScan.publicScore ?? "--"}/100</p>
                <p className={`status-chip ${statusToneClass(selectedStatusLabel)}`}>{selectedStatusLabel}</p>
                <p className="tiny scan-cost-line">Scan cost: {selectedScanCost}</p>
              </div>
              <div className="score-actions">
                <button type="button" className="cta-ghost" onClick={() => void repeatSelectedScan()} disabled={scanBusy}>
                  {scanBusy ? "Scanning..." : "Repeat scanning"}
                </button>
                {!hasDeepSiteScanData ? (
                  <button
                    ref={deepScanButtonRef}
                    type="button"
                    className={`cta-primary${highlightDeepScanButton ? " cta-highlight" : ""}`}
                    onClick={() => void runDeepSiteScanForSelected()}
                    disabled={scanBusy}
                  >
                    {scanBusy ? "Scanning..." : "Run Deep site scan"}
                  </button>
                ) : null}
                <button type="button" className="cta-ghost" onClick={() => void shareSelectedReport()}>Share</button>
                <button type="button" className="cta-ghost" onClick={printSelectedReport}>Print</button>
              </div>
            </article>

            <div className="surface-card selected-scan-card">
              <div className="panel-header compact">
                <h3>AI Crawler Accessibility</h3>
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
                  {hasDeepSiteScanData ? (
                    <ul className="meta-list" style={{marginTop: "10px"}}>
                      {hiddenCrawlerRows.map((row) => (
                        <li key={row.label}>
                          <span>{row.label}</span>
                          <strong>{row.value}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="locked-subset">
                      <p className="tiny">Run Deep site scan to unlock additional crawler checks.</p>
                      <ul className="meta-list locked-rows">
                        {hiddenCrawlerRows.map((row) => (
                          <li key={row.label}>
                            <span>{row.label}</span>
                            <strong>locked</strong>
                          </li>
                        ))}
                      </ul>
                      <button type="button" className="cta-ghost" onClick={() => void runDeepSiteScanForSelected()} disabled={scanBusy}>
                        Unlock hidden block
                      </button>
                    </div>
                  )}
                </article>
              </div>
              {!hasDeepSiteScanData ? (
                <div className="unlock-panel">
                  <p>Use 1 credit to run a Deep site scan for this site.</p>
                  <button type="button" className="cta-primary" onClick={() => void runDeepSiteScanForSelected()} disabled={scanBusy}>
                    {scanBusy ? "Scanning..." : "Run Deep site scan"}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="surface-card selected-scan-card">
              <div className="panel-header compact">
                <h3>Current Issues</h3>
                <div className="panel-actions">
                  <button type="button" className="cta-ghost compact-button" onClick={() => void copyVisibleIssuesForDeveloper(visibleIssues)}>
                    Send fixes to developer
                  </button>
                  <span className="badge badge-score">{issues.length} total</span>
                </div>
              </div>
              {exportMessage ? <p className="toast-message">{exportMessage}</p> : null}
              <ul className="list compact">
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
              {issuesPreview ? (
                <div className="unlock-panel">
                  <p>Use 1 credit to run a Deep site scan and unlock full issue diagnostics for this site.</p>
                  <button type="button" className="cta-primary" onClick={handleCurrentIssuesDeepScanCta} disabled={scanBusy}>
                    Run Deep site scan
                  </button>
                </div>
              ) : null}
            </div>

          </>
        ) : (
          <div className="surface-card selected-scan-card">
            <p className="list-title">No report selected</p>
            <p className="tiny">Enter a URL above to create a new report tab.</p>
          </div>
        )}
      </section>

      <AgencySupportBlock className="dashboard-wide" />

      {error ? <p className="error-text">{error}</p> : null}
      <AuthModal
        open={authOpen}
        onClose={() => {
          setAuthOpen(false);
          setPendingPacksAfterAuth(false);
        }}
        onSuccess={onAuthSuccess}
        source="scans_auth"
        initialMode={authMode}
      />
      <CreditPacksModal open={packsOpen} onClose={() => setPacksOpen(false)} source="scans_packs" />
    </div>
  );
}
