"use client";

import {useRouter} from "next/navigation";
import {FormEvent, useMemo, useState} from "react";

import {apiRequest, PublicScanResponse} from "../lib/api";
import {trackGa4} from "../lib/analytics";

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
        body: JSON.stringify({
          siteUrl,
        }),
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
      <label>
        Store URL *
        <input
          required
          type="url"
          placeholder="https://yourstore.com"
          value={siteUrl}
          onChange={(event) => setSiteUrl(event.target.value)}
        />
      </label>
      <button className="cta-primary" type="submit" disabled={loading}>
        {loading ? "Scanning..." : "Get My AI Discovery Score"}
      </button>
      <p className="form-hint">{formHint}</p>
      {error ? <p className="error-text">{error}</p> : null}
    </form>
  );
}
