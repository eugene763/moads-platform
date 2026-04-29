export const DEV_AEO_HOST = "aeo-dev.moads.agency";
export const DEV_AEO_API_BASE_URL = "https://api-dev.moads.agency";
export const DEV_ROBOTS_HEADER = "noindex, nofollow, noarchive";

export function isDevAeoEnvironment(hostname?: string | null): boolean {
  const normalizedHost = hostname?.trim().toLowerCase().split(":")[0] ?? "";
  return normalizedHost === DEV_AEO_HOST ||
    process.env.NEXT_PUBLIC_API_BASE_URL === DEV_AEO_API_BASE_URL ||
    process.env.MOADS_ENV === "dev-cloud" ||
    process.env.NEXT_PUBLIC_MOADS_ENV === "dev-cloud";
}

