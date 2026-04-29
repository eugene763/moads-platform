"use client";

const AUTH_INTENT_KEY = "aeo_post_auth_intent_v1";

export interface AeoAuthIntent {
  type: "run_check" | "deep_site_scan" | "unlock_report" | "buy_credits";
  publicToken?: string;
  scanId?: string;
  siteUrl?: string;
}

export function saveAeoAuthIntent(intent: AeoAuthIntent): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(AUTH_INTENT_KEY, JSON.stringify(intent));
}

export function readAeoAuthIntent(): AeoAuthIntent | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(AUTH_INTENT_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AeoAuthIntent;
  } catch {
    window.localStorage.removeItem(AUTH_INTENT_KEY);
    return null;
  }
}

export function clearAeoAuthIntent(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(AUTH_INTENT_KEY);
}
