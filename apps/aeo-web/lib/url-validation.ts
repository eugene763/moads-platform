"use client";

export const WEBSITE_URL_ERROR = "Enter a valid website URL, for example https://example.com";

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  return a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0;
}

function isLikelyDomain(hostname: string): boolean {
  if (!hostname.includes(".")) {
    return false;
  }

  const labels = hostname.split(".");
  const tld = labels.at(-1) ?? "";
  return labels.every((label) => label.length > 0) &&
    tld.length >= 2 &&
    /[a-z]/i.test(tld);
}

export function normalizeWebsiteUrlInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || /[\s<>{}[\]|\\^`]/.test(trimmed)) {
    return null;
  }

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  if (parsed.username || parsed.password || parsed.port) {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    isPrivateIpv4(hostname) ||
    !isLikelyDomain(hostname)
  ) {
    return null;
  }

  parsed.hash = "";
  return parsed.toString();
}
