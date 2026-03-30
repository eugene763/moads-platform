"use client";

import {useRouter} from "next/navigation";
import {FormEvent, useMemo, useState} from "react";

import {apiRequest, PublicScanResponse} from "../lib/api";
import {trackGa4} from "../lib/analytics";

const categories = [
  "Fashion & Apparel",
  "Beauty & Skincare",
  "Health & Wellness",
  "Electronics & Gadgets",
  "Home & Garden",
  "Food & Beverages",
  "Sports & Outdoors",
  "Other",
];

const platforms = ["Shopify", "Amazon", "Walmart", "TikTok Shop", "eBay", "Etsy", "Shopee", "Temu", "Other"];

export function ScanForm() {
  const router = useRouter();
  const [siteUrl, setSiteUrl] = useState("");
  const [brandName, setBrandName] = useState("");
  const [category, setCategory] = useState(categories[0]);
  const [workEmail, setWorkEmail] = useState("");
  const [platform, setPlatform] = useState("Shopify");
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
      trackGa4("aeo_scan_submit", {
        category,
        platform,
      });

      const result = await apiRequest<PublicScanResponse>("/v1/aeo/public-scans", {
        method: "POST",
        body: JSON.stringify({
          siteUrl,
          brandName,
          category,
          workEmail,
          platform,
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
      <div className="scan-grid two">
        <label>
          Brand Name (optional)
          <input
            type="text"
            placeholder="e.g. GlowSkin"
            value={brandName}
            onChange={(event) => setBrandName(event.target.value)}
          />
        </label>
        <label>
          Category (optional)
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="scan-grid two">
        <label>
          Work Email (optional)
          <input
            type="email"
            placeholder="name@company.com"
            value={workEmail}
            onChange={(event) => setWorkEmail(event.target.value)}
          />
        </label>
        <label>
          Platform (optional)
          <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
            {platforms.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      <button className="cta-primary" type="submit" disabled={loading}>
        {loading ? "Scanning..." : "Get My AI Discovery Score"}
      </button>
      <p className="form-hint">{formHint}</p>
      {error ? <p className="error-text">{error}</p> : null}
    </form>
  );
}
