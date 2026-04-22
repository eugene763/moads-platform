"use client";

import {useRouter} from "next/navigation";
import {useEffect, useMemo, useState} from "react";

import {apiRequest} from "../lib/api";
import {scoreToneClass, statusToneClass, toSiteLabel} from "../lib/aeo-ui";
import {AgencySupportBlock} from "./agency-support-block";
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

function sortByDateDesc(scans: ScanItem[]): ScanItem[] {
  return [...scans].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function DashboardView() {
  const router = useRouter();
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [scans, setScans] = useState<ScanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [packsOpen, setPacksOpen] = useState(false);

  const scansCount = useMemo(() => scans.length, [scans]);

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
      setScans(sortByDateDesc(scanList.scans));
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Failed to load account.";
      if (!/session|membership required|product membership/i.test(message)) {
        setError(message);
      }
      setSession(null);
      setScans([]);
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

  async function onAuthSuccess(): Promise<void> {
    setAuthOpen(false);
    await loadDashboard();
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
        <h2>Account</h2>
        <p>Sign in to access your AEO scans, credits, and billing actions.</p>
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

  return (
    <div className="dashboard-grid">
      <section className="panel" id="billing">
        <div className="panel-header">
          <h2>Account</h2>
          <span className="badge badge-score">{walletBalance} credits</span>
        </div>
        <div className="summary-stack">
          <p>Email: {session.user.email ?? "unknown"}</p>
          <p>Account ID: {session.account.id}</p>
          <p className="tiny">Use credits for paid actions like AI tips and deeper report unlocks.</p>
        </div>
        <div className="account-actions-row">
          <button type="button" className="cta-primary" onClick={() => setPacksOpen(true)}>
            Buy more credits
          </button>
          <button type="button" className="cta-ghost" onClick={() => router.push("/scans")}>Open scans workspace</button>
        </div>
      </section>

      <section className="panel full">
        <div className="panel-header">
          <h2>Scan History</h2>
          <span className="badge badge-score">{scansCount} scans</span>
        </div>
        {scansCount ? (
          <ul className="list scan-history-list">
            {scans.map((scan) => (
              <li key={scan.scanId}>
                <button
                  type="button"
                  className="scan-item"
                  onClick={() => router.push(`/scans?scanId=${encodeURIComponent(scan.scanId)}`)}
                >
                  <div className="scan-item-main">
                    <p className="list-title">{toSiteLabel(scan.siteUrl)}</p>
                    <p className="tiny">{scan.siteUrl}</p>
                    <p className="tiny">{new Date(scan.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="scan-item-side">
                    <span className={`score-pill ${scoreToneClass(scan.publicScore)}`}>{scan.publicScore ?? "--"}/100</span>
                    <span className={`status-chip ${statusToneClass(scan.status)}`}>{scan.status.replace(/_/g, " ")}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="surface-card">
            <p className="list-title">No scans yet</p>
            <p className="tiny">Run your first scan from the checker and it will appear here.</p>
          </div>
        )}
      </section>

      <AgencySupportBlock className="dashboard-wide" />

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
