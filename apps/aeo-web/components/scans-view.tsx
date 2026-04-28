"use client";

import {useRouter} from "next/navigation";
import {FormEvent, useEffect, useMemo, useState} from "react";

import {ApiRequestError, apiRequest, PublicScanReport} from "../lib/api";
import {explainIssue, issueAction, normalizeUrlForDisplay, scoreToneClass, statusToneClass, toSiteLabel, truncateSiteLabel} from "../lib/aeo-ui";
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

const AUTO_UNLOCK_KEY_PREFIX = "aeo_auto_unlock_tips_v1";

function autoUnlockStorageKey(accountId: string): string {
  return `${AUTO_UNLOCK_KEY_PREFIX}:${accountId}`;
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

function scanCostLabel(scanId: string, firstScanId: string | null): string {
  return scanId === firstScanId ? "Free" : "1 credit";
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
  const [tipsBusy, setTipsBusy] = useState(false);

  const [tabOrder, setTabOrder] = useState<string[]>([]);
  const [selectedSiteKey, setSelectedSiteKey] = useState<string | null>(null);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);
  const [selectedScanDetail, setSelectedScanDetail] = useState<ScanDetail | null>(null);
  const [queryApplied, setQueryApplied] = useState(false);
  const [autoUnlockEnabled, setAutoUnlockEnabled] = useState(false);

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
      if (typeof window !== "undefined") {
        const enabled = window.localStorage.getItem(autoUnlockStorageKey(sessionSnapshot.account.id)) === "1";
        setAutoUnlockEnabled(enabled);
      }
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
      setAutoUnlockEnabled(false);
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
        if (detail.aiTips?.tips?.length && session && typeof window !== "undefined") {
          window.localStorage.setItem(autoUnlockStorageKey(session.account.id), "1");
          setAutoUnlockEnabled(true);
        }
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
      setAuthMode("signin");
      setAuthOpen(true);
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
    if (pendingPacksAfterAuth) {
      setPacksOpen(true);
      setPendingPacksAfterAuth(false);
    }
  }

  async function runFullCheckByUrl(candidateRaw: string): Promise<void> {
    const candidate = candidateRaw.trim();
    if (!candidate) {
      setError("Enter URL first.");
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

  function openPacks(): void {
    if (!session) {
      setPendingPacksAfterAuth(true);
      setAuthMode("signup");
      setAuthOpen(true);
      return;
    }

    setPacksOpen(true);
  }

  async function unlockTipsForScan(scanId: string): Promise<void> {
    if (!session) {
      return;
    }

    if (walletBalance <= 0) {
      setPacksOpen(true);
      return;
    }

    setTipsBusy(true);
    setError(null);

    try {
      await apiRequest(`/v1/aeo/scans/${scanId}/generate-ai-tips`, {
        method: "POST",
        body: JSON.stringify({planCode: "free"}),
      });

      const [wallet, detail] = await Promise.all([
        apiRequest<{wallet: {balance: number}}>("/v1/wallet/summary"),
        apiRequest<ScanDetail>(`/v1/aeo/scans/${scanId}`),
      ]);

      setWalletBalance(wallet.wallet.balance);
      setSelectedScanDetail(detail);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(autoUnlockStorageKey(session.account.id), "1");
      }
      setAutoUnlockEnabled(true);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Failed to generate tips.";
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
    if (!selectedScan) {
      openPacks();
      return;
    }

    await unlockTipsForScan(selectedScan.scanId);
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

  const reportTopFixes = selectedScanDetail?.report?.topFixes ?? [];
  const legacyRecommendations = selectedScanDetail?.recommendations ?? [];
  const topFixes = reportTopFixes.length ? reportTopFixes : legacyRecommendations;

  const tipsUnlocked = Boolean(session);
  const topFixesVisibleLimit = tipsUnlocked ? topFixes.length : 5;
  const visibleTopFixes = topFixes.slice(0, topFixesVisibleLimit);
  const topFixesPreview = tipsUnlocked ? null : topFixes[5] ?? null;

  const issues = selectedScanDetail?.issues ?? [];
  const issuesVisibleLimit = tipsUnlocked ? issues.length : 5;
  const visibleIssues = issues.slice(0, issuesVisibleLimit);
  const issuesPreview = tipsUnlocked ? null : issues[5] ?? null;

  const selectedUrl = normalizeUrlForDisplay(selectedScanDetail?.siteUrl ?? selectedScan?.siteUrl ?? "");
  const selectedScore = selectedScan?.publicScore ?? 0;
  const selectedStatusLabel = (selectedScan?.status ?? "pending").replace(/_/g, " ");
  const selectedScanCost = selectedScan ? scanCostLabel(selectedScan.scanId, firstScanId) : "Free";

  return (
    <div className="dashboard-grid">
      <section className="panel full scans-form-panel">
        <div className="panel-header">
          <h2>AI DISCOVERY READINESS CHECK</h2>
          <span className="badge badge-score">{walletBalance} credits</span>
        </div>
        <form className="inline-scan-form" onSubmit={(event) => void runFullCheck(event)}>
          <input
            type="text"
            placeholder="yoursite.com"
            value={newSiteUrl}
            onChange={(event) => setNewSiteUrl(event.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="submit" className="cta-primary" disabled={scanBusy}>
            {scanBusy ? "Scanning..." : "Run key-page site scan"}
          </button>
        </form>
        <p className="tiny">Scans the homepage and key discovery pages selected from sitemap, robots.txt and internal links.</p>
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
              setSelectedSiteKey(null);
              setSelectedScanId(null);
              setNewSiteUrl("");
            }}
            aria-label="Add report tab"
          >
            +
          </button>
        </div>

        {selectedScan ? (
          <>
            <article className="surface-card selected-scan-card score-card site-score-card">
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
                <button type="button" className="cta-ghost" onClick={() => void shareSelectedReport()}>Share</button>
                <button type="button" className="cta-ghost" onClick={printSelectedReport}>Print</button>
              </div>
            </article>

            <div className="surface-card selected-scan-card">
              <div className="panel-header compact">
                <h3>Top Fixes</h3>
                <span className="badge badge-score">{topFixes.length} total</span>
              </div>
              <ul className="list compact">
                {visibleTopFixes.map((item) => (
                  <li key={item.id}>
                    <div>
                      <p className="list-title">{item.title}</p>
                      <p className="tiny">{item.description}</p>
                    </div>
                    <span className={`badge ${priorityBadgeClass(item.priority)}`}>{item.priority}</span>
                  </li>
                ))}
                {topFixesPreview ? (
                  <li className="blur-preview">
                    <div>
                      <p className="list-title">{topFixesPreview.title}</p>
                      <p className="tiny">{topFixesPreview.description}</p>
                    </div>
                    <span className={`badge ${priorityBadgeClass(topFixesPreview.priority)}`}>{topFixesPreview.priority}</span>
                  </li>
                ) : null}
              </ul>
              {topFixesPreview ? (
                <div className="unlock-panel">
                  <p>1 credit unlocks full report depth for this site.</p>
                  <button type="button" className="cta-primary" onClick={() => void handleUnblockAllTips()} disabled={tipsBusy}>
                    {tipsBusy ? "Unblocking..." : "Unblock all tips"}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="surface-card selected-scan-card">
              <div className="panel-header compact">
                <h3>Current Issues</h3>
                <span className="badge badge-score">{issues.length} total</span>
              </div>
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
                  <p>1 credit unlocks full issue diagnostics for this site.</p>
                  <button type="button" className="cta-primary" onClick={() => void handleUnblockAllTips()} disabled={tipsBusy}>
                    {tipsBusy ? "Unblocking..." : "Unblock all tips"}
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
