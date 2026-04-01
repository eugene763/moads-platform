export interface AeoCreditPackDefinition {
  code: string;
  name: string;
  creditsAmount: number;
  amountMinor: number;
  fastspringProductPath?: string;
}

export const DEFAULT_AEO_CREDIT_PACKS: AeoCreditPackDefinition[] = [
  {
    code: "aeo_pack_s",
    name: "Pack S",
    creditsAmount: 30,
    amountMinor: 499,
    fastspringProductPath: "aeo-pack-s",
  },
  {
    code: "aeo_pack_m",
    name: "Pack M",
    creditsAmount: 80,
    amountMinor: 999,
    fastspringProductPath: "aeo-pack-m",
  },
  {
    code: "aeo_pack_l",
    name: "Pack L",
    creditsAmount: 200,
    amountMinor: 1999,
    fastspringProductPath: "aeo-pack-l",
  },
];
