"use client";

import {useRouter} from "next/navigation";
import {FormEvent, useEffect, useState} from "react";

import {apiRequest, PublicScanResponse} from "../lib/api";
import {trackGa4} from "../lib/analytics";
import {clearAeoAuthIntent, readAeoAuthIntent, saveAeoAuthIntent} from "../lib/auth-intent";
import {normalizeWebsiteUrlInput, WEBSITE_URL_ERROR} from "../lib/url-validation";
import {AuthModal} from "./auth-modal";

const SCAN_COUNT_KEY = "aeo_public_scan_count_v1";

function GlobeIcon() {
  return (
    <svg className="globe-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18" />
      <path d="M12 3a15 15 0 0 0 0 18" />
    </svg>
  );
}

export function ScanForm() {
  const router = useRouter();
  const [siteUrl, setSiteUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localScanCount, setLocalScanCount] = useState(0);

  async function refreshSession(): Promise<boolean> {
    try {
      await apiRequest("/v1/me");
      setIsAuthed(true);
      return true;
    } catch {
      setIsAuthed(false);
      return false;
    }
  }

  useEffect(() => {
    const count = Number(globalThis.localStorage?.getItem(SCAN_COUNT_KEY) ?? "0");
    setLocalScanCount(Number.isFinite(count) ? count : 0);
  }, []);

  useEffect(() => {
    void refreshSession();

    function onAuthChanged() {
      void refreshSession();
    }

    function onFocus() {
      void refreshSession();
    }

    window.addEventListener("aeo-auth-changed", onAuthChanged);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("aeo-auth-changed", onAuthChanged);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  async function onAuthSuccess(): Promise<void> {
    await refreshSession();
    setRequiresAuth(false);
    setAuthOpen(false);
    const intent = readAeoAuthIntent();
    if (intent?.type === "run_check") {
      clearAeoAuthIntent();
      router.push(`/scans?prefill=${encodeURIComponent(intent.siteUrl ?? siteUrl)}`);
    }
    trackGa4("aeo_auth_gate_success", {source: "scan_form"});
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const normalizedInput = normalizeWebsiteUrlInput(siteUrl);
    if (!normalizedInput) {
      setError(WEBSITE_URL_ERROR);
      return;
    }

    const currentCount = Number(globalThis.localStorage?.getItem(SCAN_COUNT_KEY) ?? "0");
    let authedNow = isAuthed;

    if (!authedNow && currentCount >= 1) {
      authedNow = await refreshSession();
    }

    if (!authedNow && currentCount >= 1) {
      saveAeoAuthIntent({
        type: "run_check",
        siteUrl: normalizedInput,
      });
      setRequiresAuth(true);
      setAuthOpen(true);
      trackGa4("aeo_scan_auth_gate_shown", {reason: "second_scan"});
      return;
    }

    setLoading(true);

    try {
      trackGa4("aeo_scan_submit", {
        has_url: Boolean(normalizedInput),
        authed: authedNow,
        scan_count: currentCount,
      });

      const result = await apiRequest<PublicScanResponse>("/v1/aeo/public-scans", {
        method: "POST",
        body: JSON.stringify({siteUrl: normalizedInput}),
      });

      if (!authedNow) {
        const nextCount = currentCount + 1;
        globalThis.localStorage?.setItem(SCAN_COUNT_KEY, String(nextCount));
        setLocalScanCount(nextCount);
      }

      router.push(`/r/${result.publicToken}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Scan failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="scan-form" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor="site-url-input">Enter URL</label>
      <div className="scan-pill-row">
        <GlobeIcon />
        <input
          id="site-url-input"
          required
          type="text"
          placeholder="yoursite.com"
          value={siteUrl}
          onChange={(event) => setSiteUrl(event.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <button className="cta-primary" type="submit" disabled={loading}>
          {loading ? "Scanning..." : (isAuthed || localScanCount > 0 ? "Run check" : "Run free check")}
        </button>
      </div>
      <div className="hero-trust" aria-label="Trust signals">
        <span>First scan free</span>
        <span>Real data-driven analysis</span>
        <span>Sign in to unlock deeper checks</span>
      </div>
      {requiresAuth ? (
        <div className="lock-panel compact-lock">
          <p>Free first scan used. Sign in to run the next scan and unlock hidden blocks.</p>
          <button type="button" className="cta-primary" onClick={() => setAuthOpen(true)}>
            Sign in to continue
          </button>
        </div>
      ) : null}
      {error ? <p className="error-text">{error}</p> : null}
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={onAuthSuccess}
        source="scan_form"
      />
    </form>
  );
}
