export const PLATFORM_PRODUCT_CODES = ["motrend", "lab", "aeo", "ugc"] as const;

export type PlatformProductCode = (typeof PLATFORM_PRODUCT_CODES)[number];

export const REALM_CODES = ["consumer", "pro"] as const;

export type RealmCode = (typeof REALM_CODES)[number];

export const PRODUCT_REALM_DEFAULTS: Record<PlatformProductCode, RealmCode> = {
  motrend: "consumer",
  lab: "pro",
  aeo: "pro",
  ugc: "pro",
};
