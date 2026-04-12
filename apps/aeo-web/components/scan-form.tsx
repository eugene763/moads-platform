"use client";

import {useRouter} from "next/navigation";
import {FormEvent, useMemo, useState} from "react";

import {apiRequest, PublicScanResponse} from "../lib/api";
import {trackGa4} from "../lib/analytics";

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
  const [error, setError] = useState<string | null>(null);

  const formHint = useMemo(() => {
    if (!siteUrl.trim()) {
      return "No credit card. Deterministic score in under 60 seconds.";
    }

    return "Score is free. Full breakdown unlocks after sign-in.";
  }, [siteUrl]);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      trackGa4("aeo_scan_submit", {has_url: Boolean(siteUrl.trim())});

      const result = await apiRequest<PublicScanResponse>("/v1/aeo/public-scans", {
        method: "POST",
        body: JSON.stringify({siteUrl}),
      });

      router.push(`/r/${result.publicToken}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Scan failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="scan-form" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor="site-url-input">Store URL</label>
      <div className="scan-pill-row">
        <GlobeIcon />
        <input
          id="site-url-input"
          required
          type="url"
          placeholder="Enter your store URL"
          value={siteUrl}
          onChange={(event) => setSiteUrl(event.target.value)}
        />
        <button className="cta-primary" type="submit" disabled={loading}>
          {loading ? "Scanning..." : "Get Score"}
        </button>
      </div>
      <div className="hero-trust" aria-label="Trust signals">
        <span>Free score</span>
        <span>Scored now: 3 blocks</span>
        <span>Evidence layer included</span>
      </div>
      <p className="form-hint">{formHint}</p>
      {error ? <p className="error-text">{error}</p> : null}
    </form>
  );
}
