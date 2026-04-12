"use client";

import Link from "next/link";
import {useEffect, useMemo, useState} from "react";

import {apiRequest} from "../lib/api";
import {trackGa4} from "../lib/analytics";
import {signInForAeoSession} from "../lib/firebase";

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

export function DashboardView() {
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [scans, setScans] = useState<ScanItem[]>([]);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);
  const [streamState, setStreamState] = useState<StreamState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signInBusy, setSignInBusy] = useState(false);

  const selectedScan = useMemo(() => scans.find((scan) => scan.scanId === selectedScanId) ?? scans[0] ?? null, [scans, selectedScanId]);

  async function loadDashboard(): Promise<void> {
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
      setScans(scanList.scans);
      setSelectedScanId(scanList.scans[0]?.scanId ?? null);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Failed to load dashboard.";
      if (/session|membership required|product membership/i.test(message)) {
        setError(null);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

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

  async function signIn(): Promise<void> {
    setSignInBusy(true);
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
      await loadDashboard();
      trackGa4("aeo_dashboard_signin");
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Sign in failed.");
    } finally {
      setSignInBusy(false);
    }
  }

  async function generateTips(): Promise<void> {
    if (!selectedScan) {
      return;
    }

    try {
      await apiRequest(`/v1/aeo/scans/${selectedScan.scanId}/generate-ai-tips`, {
        method: "POST",
        body: JSON.stringify({planCode: "free"}),
      });
      const wallet = await apiRequest<{wallet: {balance: number}}>("/v1/wallet/summary");
      setWalletBalance(wallet.wallet.balance);
      trackGa4("aeo_dashboard_ai_tips", {
        scan_id: selectedScan.scanId,
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to generate tips.");
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
        <p>Sign in to see saved scans, wallet balance, connected evidence, and AI tips. The score itself stays free.</p>
        <button type="button" className="cta-primary" onClick={signIn} disabled={signInBusy}>
          {signInBusy ? "Signing in..." : "Sign In with Google"}
        </button>
        {error ? <p className="error-text">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="dashboard-grid">
      <section className="panel">
        <div className="panel-header">
          <h2>Account</h2>
          <span className="badge badge-score">{walletBalance ?? "--"} credits</span>
        </div>
        <div className="summary-stack">
          <p>Email: {session.user.email ?? "unknown"}</p>
          <p>Account: {session.account.id}</p>
          <p className="tiny">Credits are the only live paid action in this launch phase.</p>
        </div>
        <a className="cta-primary" href="https://lab.moads.agency/center" target="_blank" rel="noreferrer">
          Open Billing Center
        </a>
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
        <p className="tiny">These widgets help tracking, but they do not change the AI Discovery Score.</p>
      </section>

      <section className="panel full">
        <div className="panel-header">
          <h2>Scan History</h2>
          <span className="badge badge-score">{scans.length} scans</span>
        </div>
        <ul className="list scan-list">
          {scans.map((scan) => (
            <li key={scan.scanId}>
              <button
                type="button"
                className={`scan-item${selectedScan?.scanId === scan.scanId ? " active" : ""}`}
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

        {selectedScan ? (
          <div className="surface-card selected-scan-card">
            <p className="list-title">Selected scan</p>
            <p className="tiny">
              {selectedScan.siteUrl}
              {" "}
              ·
              {" "}
              {selectedScan.status}
            </p>
          </div>
        ) : null}

        <button type="button" className="cta-primary" onClick={generateTips} disabled={!selectedScan}>
          Generate AI Tips for Selected Scan (1 Credit)
        </button>
        <p className="tiny">Need more credits? Buy Pack S, Pack M, or Pack L in LAB.</p>
      </section>

      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}
