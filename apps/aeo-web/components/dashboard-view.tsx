"use client";

import {FormEvent, useEffect, useMemo, useState} from "react";

import {apiRequest, PublicScanReport} from "../lib/api";
import {trackGa4} from "../lib/analytics";
import {AuthModal} from "./auth-modal";
import {CreditPacksModal} from "./credit-packs-modal";

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

interface StreamState {
  mentionCount: number;
  citationCount: number;
  gaSessions: number;
  gaAiSessions: number;
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

function toSiteLabel(siteUrl: string): string {
  const raw = siteUrl.trim();
  if (!raw) {
    return "site";
  }

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withScheme).hostname.replace(/^www\./i, "");
  } catch {
    return raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
  }
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

export function DashboardView() {
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [scans, setScans] = useState<ScanItem[]>([]);
  const [selectedSiteKey, setSelectedSiteKey] = useState<string | null>(null);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);
  const [selectedScanDetail, setSelectedScanDetail] = useState<ScanDetail | null>(null);
  const [streamState, setStreamState] = useState<StreamState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [packsOpen, setPacksOpen] = useState(false);
  const [tipsBusy, setTipsBusy] = useState(false);
  const [showNewSiteInput, setShowNewSiteInput] = useState(false);
  const [newSiteUrl, setNewSiteUrl] = useState("");
  const [scanBusy, setScanBusy] = useState(false);

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

  const selectedSite = useMemo(() => groupedSites.find((site) => site.key === selectedSiteKey) ?? groupedSites[0] ?? null, [groupedSites, selectedSiteKey]);
  const selectedSiteScans = selectedSite?.scans ?? [];

  const selectedScan = useMemo(() => {
    const fromCurrent = selectedSiteScans.find((scan) => scan.scanId === selectedScanId) ?? null;
    return fromCurrent ?? selectedSiteScans[0] ?? null;
  }, [selectedSiteScans, selectedScanId]);

  async function loadDashboard(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const [sessionSnapshot, wallet, scanList] = await Promise.all([
        apiRequest<SessionSnapshot>("/v1/me"),
        apiRequest<{wallet: {balance: number}}>("/v1/wallet/summary"),
        apiRequest<{scans: ScanItem[]}>("/v1/aeo/scans"),
      ]);

      const sortedScans = sortByDateDesc(scanList.scans);
      setSession(sessionSnapshot);
      setWalletBalance(wallet.wallet.balance);
      setScans(sortedScans);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Failed to load dashboard.";
      if (/session|membership required|product membership/i.test(message)) {
        setError(null);
      } else {
        setError(message);
      }
      setSession(null);
      setScans([]);
      setSelectedSiteKey(null);
      setSelectedScanId(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (window.location.hash === "#billing") {
      setPacksOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!groupedSites.length) {
      setSelectedSiteKey(null);
      setSelectedScanId(null);
      return;
    }

    if (!selectedSiteKey || !groupedSites.some((site) => site.key === selectedSiteKey)) {
      setSelectedSiteKey(groupedSites[0].key);
      setSelectedScanId(groupedSites[0].scans[0]?.scanId ?? null);
      return;
    }

    if (!selectedScanId || !selectedSiteScans.some((scan) => scan.scanId === selectedScanId)) {
      setSelectedScanId(selectedSiteScans[0]?.scanId ?? null);
    }
  }, [groupedSites, selectedSiteKey, selectedScanId, selectedSiteScans]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const url = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.moads.agency"}/v1/aeo/realtime/stream`;
    const stream = new EventSource(url, {withCredentials: true});

    stream.addEventListener("snapshot", (event) => {
      const message = JSON.parse((event as MessageEvent<string>).data) as {
        realtime: {mentionCount: number; citationCount: number};
        ga: {sessions: number; aiAttributedSessions: number};
      };
      setStreamState({
        mentionCount: message.realtime.mentionCount,
        citationCount: message.realtime.citationCount,
        gaSessions: message.ga.sessions,
        gaAiSessions: message.ga.aiAttributedSessions,
      });
    });

    return () => {
      stream.close();
    };
  }, [session]);

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

  async function onAuthSuccess(): Promise<void> {
    setAuthOpen(false);
    await loadDashboard();
    trackGa4("aeo_dashboard_signin");
  }

  async function handleGenerateTips(): Promise<void> {
    if (!selectedScan) {
      return;
    }

    if (walletBalance <= 0) {
      setPacksOpen(true);
      return;
    }

    setTipsBusy(true);
    setError(null);

    try {
      await apiRequest(`/v1/aeo/scans/${selectedScan.scanId}/generate-ai-tips`, {
        method: "POST",
        body: JSON.stringify({planCode: "free"}),
      });

      const [wallet, detail] = await Promise.all([
        apiRequest<{wallet: {balance: number}}>("/v1/wallet/summary"),
        apiRequest<ScanDetail>(`/v1/aeo/scans/${selectedScan.scanId}`),
      ]);

      setWalletBalance(wallet.wallet.balance);
      setSelectedScanDetail(detail);
      trackGa4("aeo_dashboard_ai_tips", {
        scan_id: selectedScan.scanId,
      });
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

  async function runNewSiteScan(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const candidate = newSiteUrl.trim();
    if (!candidate) {
      setError("Enter URL first.");
      return;
    }

    setScanBusy(true);
    setError(null);

    try {
      const created = await apiRequest<{scanId: string; publicToken: string}>("/v1/aeo/public-scans", {
        method: "POST",
        body: JSON.stringify({
          siteUrl: candidate,
        }),
      });

      await apiRequest(`/v1/aeo/scans/${created.scanId}/claim`, {method: "POST"});
      await loadDashboard();
      const siteKey = toSiteLabel(candidate);
      setSelectedSiteKey(siteKey);
      setSelectedScanId(created.scanId);
      setShowNewSiteInput(false);
      setNewSiteUrl("");
      trackGa4("aeo_dashboard_scan_another_site", {site_key: siteKey});
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to scan this site.");
    } finally {
      setScanBusy(false);
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
        <h2>AEO Dashboard</h2>
        <p>Sign in to unlock history, wallet, connected evidence, and AI tips.</p>
        <button type="button" className="cta-primary" onClick={() => setAuthOpen(true)}>
          Sign In / Create Account
        </button>
        {error ? <p className="error-text">{error}</p> : null}
        <AuthModal
          open={authOpen}
          onClose={() => setAuthOpen(false)}
          onSuccess={onAuthSuccess}
          source="dashboard_gate"
        />
      </div>
    );
  }

  const topFixes = selectedScanDetail?.report.topFixes?.length ?
    selectedScanDetail.report.topFixes :
    selectedScanDetail?.recommendations ?? [];

  const aiTips = selectedScanDetail?.aiTips?.tips ?? [];

  return (
    <div className="dashboard-grid">
      <section className="panel" id="billing">
        <div className="panel-header">
          <h2>Account</h2>
          <span className="badge badge-score">{walletBalance} credits</span>
        </div>
        <div className="summary-stack">
          <p>Email: {session.user.email ?? "unknown"}</p>
          <p>Account: {session.account.id}</p>
          <p className="tiny">Credits power usage actions. First scan remains free.</p>
        </div>
        <div className="surface-card" style={{marginBottom: "12px"}}>
          <p className="list-title">Account menu</p>
          <ul className="meta-list">
            <li>
              <span>Billing</span>
              <strong><button type="button" className="linkish" onClick={() => setPacksOpen(true)}>Open packs</button></strong>
            </li>
            <li>
              <span>Security</span>
              <strong><a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer">Open</a></strong>
            </li>
            <li>
              <span>Personal data</span>
              <strong><a href="https://moads.agency/privacy" target="_blank" rel="noreferrer">Policy</a></strong>
            </li>
          </ul>
        </div>
        <button type="button" className="cta-primary" onClick={() => setPacksOpen(true)}>
          Buy credits
        </button>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Connected Evidence</h2>
          <span className="badge badge-score">Not in score</span>
        </div>
        <div className="stat-grid">
          <div className="stat-panel tone-brand">
            <span className="stat-label">Mentions</span>
            <strong>{streamState?.mentionCount ?? "--"}</strong>
          </div>
          <div className="stat-panel tone-accent">
            <span className="stat-label">Citations</span>
            <strong>{streamState?.citationCount ?? "--"}</strong>
          </div>
          <div className="stat-panel tone-warning">
            <span className="stat-label">GA Sessions</span>
            <strong>{streamState?.gaSessions ?? "--"}</strong>
          </div>
          <div className="stat-panel tone-brand-soft">
            <span className="stat-label">AI Sessions</span>
            <strong>{streamState?.gaAiSessions ?? "--"}</strong>
          </div>
        </div>
        <p className="tiny">These widgets help tracking, but they do not change the AEO score.</p>
      </section>

      <section className="panel full">
        <div className="panel-header">
          <h2>Site workspace</h2>
          <span className="badge badge-score">{scans.length} scans</span>
        </div>

        <div className="site-tabs">
          {groupedSites.map((site) => (
            <button
              key={site.key}
              type="button"
              className={`site-tab${selectedSite?.key === site.key ? " active" : ""}`}
              onClick={() => {
                setSelectedSiteKey(site.key);
                setSelectedScanId(site.scans[0]?.scanId ?? null);
              }}
            >
              {site.label}
            </button>
          ))}
          <button type="button" className={`site-tab add${showNewSiteInput ? " active" : ""}`} onClick={() => setShowNewSiteInput((prev) => !prev)}>
            +
          </button>
        </div>

        {showNewSiteInput ? (
          <form className="inline-scan-form" onSubmit={(event) => void runNewSiteScan(event)}>
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
              {scanBusy ? "Scanning..." : "Scan another site"}
            </button>
          </form>
        ) : null}

        {selectedScan ? (
          <>
            <div className="surface-card selected-scan-card">
              <p className="list-title">Selected scan</p>
              <p className="tiny">
                <strong>{selectedScan.publicScore ?? "--"}/100</strong>
                {" · "}
                {selectedScan.siteUrl}
                {" · "}
                {selectedScan.status}
              </p>
            </div>

            <ul className="list scan-list">
              {selectedSiteScans.map((scan) => (
                <li key={scan.scanId}>
                  <button
                    type="button"
                    className={`scan-item${selectedScan.scanId === scan.scanId ? " active" : ""}`}
                    onClick={() => setSelectedScanId(scan.scanId)}
                  >
                    <span className="scan-item-title">
                      <strong>{scan.publicScore ?? "--"}</strong>
                      {" "}
                      {scan.siteUrl}
                    </span>
                    <span className="tiny">{new Date(scan.createdAt).toLocaleString()}</span>
                  </button>
                </li>
              ))}
            </ul>

            {topFixes.length ? (
              <div className="surface-card selected-scan-card">
                <p className="list-title">Top fixes for this site</p>
                <ul className="list compact">
                  {topFixes.slice(0, 6).map((item) => (
                    <li key={item.id}>
                      <div>
                        <p className="list-title">{item.title}</p>
                        <p className="tiny">{item.description}</p>
                      </div>
                      <span className={`badge ${priorityBadgeClass(item.priority)}`}>{item.priority}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <button type="button" className="cta-primary" onClick={() => void handleGenerateTips()} disabled={tipsBusy}>
              {tipsBusy ? "Generating..." : "Get Tips to Boost Your AEO (1 credit)"}
            </button>
            <p className="tiny">If credits are empty, you will see the pack popup before checkout.</p>

            {aiTips.length ? (
              <div className="surface-card selected-scan-card">
                <p className="list-title">Generated AI tips</p>
                <ul className="list compact">
                  {aiTips.map((tip, index) => (
                    <li key={`${tip.title}-${index}`}>
                      <div>
                        <p className="list-title">{tip.title}</p>
                        <p className="tiny">{tip.detail}</p>
                      </div>
                      <span className={`badge ${priorityBadgeClass(tip.priority)}`}>{tip.priority}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <div className="surface-card">
            <p className="list-title">No scans yet</p>
            <p className="tiny">Use + to scan your first site in this workspace.</p>
          </div>
        )}
      </section>

      {error ? <p className="error-text">{error}</p> : null}
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={onAuthSuccess}
        source="dashboard_auth"
      />
      <CreditPacksModal
        open={packsOpen}
        onClose={() => setPacksOpen(false)}
        source="dashboard_packs"
      />
    </div>
  );
}
