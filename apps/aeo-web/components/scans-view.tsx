"use client";

import {useRouter} from "next/navigation";
import {FormEvent, MouseEvent, useEffect, useMemo, useRef, useState} from "react";

import {ApiRequestError, apiRequest, PublicScanReport} from "../lib/api";
import {explainIssue, formatIssueTitle, issueAction, normalizeUrlForDisplay, scoreToneClass, statusToneClass, toSiteLabel, truncateSiteLabel} from "../lib/aeo-ui";
import {clearAeoAuthIntent, readAeoAuthIntent, saveAeoAuthIntent} from "../lib/auth-intent";
import {affectedPagesLabel, deriveCrawlerAccessibilityChecks, prepareCurrentIssues} from "../lib/current-issues";
import {buildReportSharePayload, buildTelegramShareUrl} from "../lib/report-share";
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

function scanCostLabel(scanId: string, firstScanId: string | null): string {
  return scanId === firstScanId ? "Free" : "1 credit";
}

function safeScanErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.code === "non_html_response") {
    return "This site could not be scanned because it did not return a readable HTML page. Try another URL or check if the site blocks crawlers.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Failed to run full check.";
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
  const scanSubmitButtonRef = useRef<HTMLButtonElement | null>(null);
  const selectedScoreCardRef = useRef<HTMLElement | null>(null);
  const deepScanButtonRef = useRef<HTMLButtonElement | null>(null);
  const currentIssuesRef = useRef<HTMLDivElement | null>(null);

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
  const sitesCount = groupedSites.length;

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

    if (scanId && scans.length) {
      const matched = scans.find((scan) => scan.scanId === scanId);
      if (matched) {
        const siteKey = toSiteLabel(matched.siteUrl);
        setSelectedSiteKey(siteKey);
        setSelectedScanId(matched.scanId);
        setTabOrder((previous) => [siteKey, ...previous.filter((key) => key !== siteKey)].slice(0, 6));
      }
    }

    if (prefill) {
      const normalizedPrefill = normalizeWebsiteUrlInput(prefill) ?? prefill;
      const prefillSiteKey = toSiteLabel(normalizedPrefill);
      const matchedSite = groupedSites.find((site) => site.key === prefillSiteKey);
      setNewSiteUrl(normalizeUrlForDisplay(normalizedPrefill));

      if (matchedSite) {
        setSelectedSiteKey(matchedSite.key);
        setSelectedScanId(matchedSite.scans[0]?.scanId ?? null);
        setTabOrder((previous) => [matchedSite.key, ...previous.filter((key) => key !== matchedSite.key)].slice(0, 6));
        setScanHint(null);
      } else {
        setScanHint("Enter a website URL to start a new scan.");
      }

      setHighlightScanForm(true);
      window.setTimeout(() => setHighlightScanForm(false), 1800);
      window.requestAnimationFrame(() => {
        scanFormRef.current?.scrollIntoView({behavior: "smooth", block: "start"});
        scanInputRef.current?.focus();
      });
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

    if (scanId || prefill || intent) {
      router.replace("/scans", {scroll: false});
    }

    setQueryApplied(true);
  }, [groupedSites, loading, queryApplied, queryIntent, queryScanId, querySiteUrl, router, scans, session]);

  function selectSite(siteKey: string): void {
    setError(null);
    setScanHint(null);
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
      const normalizedIntentUrl = normalizeWebsiteUrlInput(intent.siteUrl) ?? intent.siteUrl;
      setNewSiteUrl(normalizeUrlForDisplay(normalizedIntentUrl));
      setScanHint("Run a Deep Site Scan when you are ready.");
      setHighlightScanForm(true);
      window.setTimeout(() => setHighlightScanForm(false), 1800);
      window.requestAnimationFrame(() => {
        scanFormRef.current?.scrollIntoView({behavior: "smooth", block: "start"});
        scanInputRef.current?.focus();
      });
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

    setError(null);
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
      setError(null);

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
        setError(safeScanErrorMessage(requestError));
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
    const sourceUrl = selectedScanDetail?.siteUrl ?? selectedScan?.siteUrl ?? "";
    if (sourceUrl.trim()) {
      setNewSiteUrl(normalizeUrlForDisplay(sourceUrl));
    }
    setScanHint("Run a Deep Site Scan to unlock all diagnostics.");
    setHighlightDeepScanButton(true);
    setHighlightScanForm(true);
    window.setTimeout(() => setHighlightDeepScanButton(false), 1800);
    window.setTimeout(() => setHighlightScanForm(false), 1800);
    window.requestAnimationFrame(() => {
      scanFormRef.current?.scrollIntoView({behavior: "smooth", block: "start"});
      scanSubmitButtonRef.current?.focus();
    });
  }

  async function runDeepSiteScanForSelected(): Promise<void> {
    const sourceUrl = newSiteUrl.trim() || selectedScanDetail?.siteUrl || selectedScan?.siteUrl || "";
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

  function scrollToCurrentIssues(): void {
    currentIssuesRef.current?.scrollIntoView({behavior: "smooth", block: "start"});
  }

  function scrollToAgencySupport(): void {
    document.getElementById("agency-support")?.scrollIntoView({behavior: "smooth", block: "start"});
  }

  async function removeSelectedSiteFromWorkspace(): Promise<void> {
    if (deleteBusy) {
      return;
    }

    const siteToRemove = selectedSite;
    const scansToRemove = siteToRemove?.scans ?? [];
    if (!siteToRemove || !scansToRemove.length) {
      return;
    }

    const confirmed = window.confirm("Remove this site from workspace?\n\nThis will remove all scans for this site from your workspace. Public report links will remain available.");
    if (!confirmed) {
      return;
    }

    setDeleteBusy(true);
    setError(null);
    try {
      await Promise.all(scansToRemove.map((scan) => apiRequest<void | {scanId: string; removed: boolean}>(`/v1/aeo/scans/${scan.scanId}`, {
        method: "DELETE",
      })));

      const removedScanIds = new Set(scansToRemove.map((scan) => scan.scanId));
      const remainingScans = sortByDateDesc(scans.filter((scan) => !removedScanIds.has(scan.scanId)));
      const remainingSiteKeys = new Set(remainingScans.map((scan) => toSiteLabel(scan.siteUrl)));
      const nextSiteKey = visibleTabs.find((site) => site.key !== siteToRemove.key && remainingSiteKeys.has(site.key))?.key ??
        (remainingScans[0] ? toSiteLabel(remainingScans[0].siteUrl) : null);
      const nextScan = nextSiteKey ? remainingScans.find((scan) => toSiteLabel(scan.siteUrl) === nextSiteKey) ?? null : null;

      setScans(remainingScans);
      setSelectedScanDetail(null);
      setError(null);
      if (nextScan && nextSiteKey) {
        setSelectedSiteKey(nextSiteKey);
        setSelectedScanId(nextScan.scanId);
        setTabOrder((previous) => [nextSiteKey, ...previous.filter((key) => key !== siteToRemove.key && key !== nextSiteKey && remainingSiteKeys.has(key))].slice(0, 6));
      } else {
        setTabOrder([]);
        focusNewScanInput();
      }
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Failed to remove site from workspace.";
      await loadWorkspace().catch(() => undefined);
      setError(message);
    } finally {
      setDeleteBusy(false);
    }
  }

  function handleRemoveSiteClick(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.stopPropagation();
    void removeSelectedSiteFromWorkspace();
  }

  function focusNewScanInput(): void {
    setError(null);
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
    await shareReportLink("Report link copied");
  }

  async function shareReportLink(successMessage: string): Promise<void> {
    const shareUrl = selectedScanDetail?.publicToken ?
      `${window.location.origin}/r/${selectedScanDetail.publicToken}` :
      (selectedUrl || window.location.href);
    const sharePayload = buildReportSharePayload({
      siteUrl: selectedScanDetail?.siteUrl ?? selectedScan?.siteUrl ?? selectedUrl,
      score: selectedScanDetail?.publicScore ?? selectedScan?.publicScore ?? null,
      reportUrl: shareUrl,
    });

    try {
      if (navigator.share) {
        await navigator.share({
          title: sharePayload.title,
          text: sharePayload.text,
          url: sharePayload.reportUrl,
        });
        setExportMessage(successMessage);
        return;
      }
    } catch {
      // Fall through to copy/open fallback.
    }

    try {
      await navigator.clipboard.writeText(sharePayload.text);
      setExportMessage(successMessage);
    } catch {
      window.open(buildTelegramShareUrl(sharePayload), "_blank", "noopener,noreferrer");
      setExportMessage("Share opened");
    }
  }

  function printSelectedReport(): void {
    window.print();
  }

  async function shareFixesWithDeveloper(): Promise<void> {
    await shareReportLink("Report link copied");
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

  const issues = selectedScanDetail ? prepareCurrentIssues(selectedScanDetail) : [];
  const rawIssuesCount = selectedScanDetail?.issues.length ?? 0;
  const issuesBadge = issues.length === rawIssuesCount ?
    `${issues.length} issues` :
    `${issues.length} issues · ${rawIssuesCount} findings`;
  const hasDeepSiteScanData = selectedScanDetail?.scanKind === "site_scan" || selectedScanDetail?.report.summary?.scope === "site";
  const issuesVisibleLimit = hasDeepSiteScanData ? issues.length : 5;
  const visibleIssues = issues.slice(0, issuesVisibleLimit);
  const issuesPreview = hasDeepSiteScanData ? null : issues[5] ?? null;
  const scoredNow = [
    ["AI Crawler Accessibility", selectedScanDetail?.report.dimensions?.aiCrawlerAccessibility],
    ["Answer Optimization", selectedScanDetail?.report.dimensions?.answerOptimization],
    ["Citation Readiness", selectedScanDetail?.report.dimensions?.citationReadiness],
    ["Technical Hygiene", selectedScanDetail?.report.dimensions?.technicalHygiene],
  ] as const;
  const crawlerChecks = selectedScanDetail ? deriveCrawlerAccessibilityChecks(selectedScanDetail, issues) : {visible: [], hidden: []};
  const visibleCrawlerRows = crawlerChecks.visible;
  const hiddenCrawlerRows = crawlerChecks.hidden;

  const selectedUrl = normalizeUrlForDisplay(selectedScanDetail?.siteUrl ?? selectedScan?.siteUrl ?? "");
  const selectedScore = selectedScan?.publicScore ?? 0;
  const selectedStatusLabel = (selectedScan?.status ?? "pending").replace(/_/g, " ");
  const selectedScanCost = selectedScan ? scanCostLabel(selectedScan.scanId, firstScanId) : "Free";

  return (
    <div className="dashboard-grid">
      <section className={`panel full scans-form-panel${highlightScanForm ? " input-highlight" : ""}`} ref={scanFormRef}>
        <div className="panel-header">
          <h2>AI DISCOVERY READINESS CHECK</h2>
          <button type="button" className="badge badge-score badge-button" onClick={() => setPacksOpen(true)}>
            {walletBalance} credits
          </button>
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
          <button ref={scanSubmitButtonRef} type="submit" className={`cta-primary${highlightDeepScanButton ? " cta-highlight" : ""}`} disabled={scanBusy}>
            {scanBusy ? "Scanning..." : "Run Deep Site Scan"}
          </button>
        </form>
        {scanHint ? <p className="scan-form-hint">{scanHint}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="panel full">
        <div className="panel-header">
          <h2>Scans</h2>
          <button type="button" className="badge badge-score badge-button" onClick={() => router.push("/dashboard#scan-history")}>
            {sitesCount} sites
          </button>
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
                onClick={handleRemoveSiteClick}
                disabled={deleteBusy}
                aria-label="Remove this site from workspace"
                title="Remove this site from workspace"
              >
                ×
              </button>
              <ScoreRing score={selectedScore} />
              <div className="score-text-block">
                <p className="score-kicker">AI DISCOVERY READINESS OF SITE</p>
                <h3 className="score-url-heading">{selectedUrl || "this site"}</h3>
                <p className={`score-heading ${scoreToneClass(selectedScan.publicScore)}`}>{selectedScan.publicScore ?? "--"}/100</p>
                <p className={`status-chip ${statusToneClass(selectedStatusLabel)}`}>{selectedStatusLabel}</p>
                {selectedScanCost !== "Free" ? <p className="tiny scan-cost-line">Scan cost: {selectedScanCost}</p> : null}
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
                    {scanBusy ? "Scanning..." : "Run Deep Site Scan"}
                  </button>
                ) : null}
                <button type="button" className="cta-ghost" onClick={() => void shareSelectedReport()}>Share</button>
                <button type="button" className="cta-ghost" onClick={printSelectedReport}>Print</button>
              </div>
            </article>

            <div className="surface-card selected-scan-card">
              <button type="button" className="panel-header compact clickable-panel-header" onClick={scrollToCurrentIssues}>
                <h3>AI Crawler Accessibility</h3>
                <span className="badge badge-score">Scored details</span>
              </button>
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
                      <p className="tiny">Run Deep Site Scan to unlock additional crawler checks.</p>
                      <ul className="meta-list locked-rows">
                        {hiddenCrawlerRows.map((row) => (
                          <li key={row.label}>
                            <span>{row.label}</span>
                            <strong>locked</strong>
                          </li>
                        ))}
                      </ul>
                      <button type="button" className="cta-ghost" onClick={handleCurrentIssuesDeepScanCta} disabled={scanBusy}>
                        Unlock hidden block
                      </button>
                    </div>
                  )}
                </article>
              </div>
              {!hasDeepSiteScanData ? (
                <div className="unlock-panel">
                  <p>Use 1 credit to run a Deep Site Scan for this site.</p>
                  <button type="button" className="cta-primary" onClick={() => void runDeepSiteScanForSelected()} disabled={scanBusy}>
                    {scanBusy ? "Scanning..." : "Run Deep Site Scan"}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="surface-card selected-scan-card" ref={currentIssuesRef}>
              <div className="panel-header compact">
                <h3>Current Issues</h3>
                <div className="panel-actions">
                  <button type="button" className="cta-ghost compact-button" onClick={() => void shareFixesWithDeveloper()}>
                    Send fixes to developer
                  </button>
                  <button type="button" className="badge badge-score badge-button" onClick={scrollToAgencySupport}>
                    {issuesBadge}
                  </button>
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
              {issuesPreview ? (
                <div className="unlock-panel">
                  <p>Use 1 credit to run a Deep Site Scan and unlock full issue diagnostics for this site.</p>
                  <button type="button" className="cta-primary" onClick={handleCurrentIssuesDeepScanCta} disabled={scanBusy}>
                    Run Deep Site Scan
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

      <AgencySupportBlock id="agency-support" className="dashboard-wide" />

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
