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
      setError(requestError instanceof Error ? requestError.message : "Failed to load dashboard.");
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
    return <div className="state-card">Loading dashboard...</div>;
  }

  if (!session) {
    return (
      <div className="state-card">
        <h2>AEO Dashboard</h2>
        <p>Sign in to unlock history, wallet, connected evidence, and AI tips.</p>
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
        <h2>Account</h2>
        <p>Email: {session.user.email ?? "unknown"}</p>
        <p>Account: {session.account.id}</p>
        <p>Credits: <strong>{walletBalance ?? "--"}</strong></p>
        <Link className="cta-primary" href="https://lab.moads.agency/center">
          Open Billing Center
        </Link>
      </section>

      <section className="panel">
        <h2>Connected Evidence</h2>
        <p className="tiny">These widgets help tracking, but they do not change the AI Discovery Score.</p>
        <p>Mentions: {streamState?.mentionCount ?? "--"}</p>
        <p>Citations: {streamState?.citationCount ?? "--"}</p>
        <p>GA Sessions: {streamState?.gaSessions ?? "--"}</p>
        <p>AI-attributed Sessions: {streamState?.gaAiSessions ?? "--"}</p>
      </section>

      <section className="panel full">
        <h2>Scan History</h2>
        <ul className="list">
          {scans.map((scan) => (
            <li key={scan.scanId}>
              <button type="button" className="scan-item" onClick={() => setSelectedScanId(scan.scanId)}>
                <span>
                  <strong>{scan.publicScore ?? "--"}</strong> • {scan.siteUrl}
                </span>
                <span className="tiny">{new Date(scan.createdAt).toLocaleString()}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="cta-primary" onClick={generateTips} disabled={!selectedScan}>
          Generate AI Tips for Selected Scan (1 Credit)
        </button>
        <p className="tiny">Need more credits? Buy Pack S, Pack M, or Pack L in LAB.</p>
      </section>

      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}
