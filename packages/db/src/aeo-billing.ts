export interface AeoCreditPackDefinition {
  code: string;
  name: string;
  creditsAmount: number;
  amountMinor: number;
  dodoProductId?: string;
}

export const DEFAULT_AEO_CREDIT_PACKS: AeoCreditPackDefinition[] = [
  {
    code: "aeo_pack_s",
    name: "Pack S",
    creditsAmount: 30,
    amountMinor: 499,
  },
  {
    code: "aeo_pack_m",
    name: "Pack M",
    creditsAmount: 80,
    amountMinor: 999,
  },
  {
    code: "aeo_pack_l",
    name: "Pack L",
    creditsAmount: 200,
    amountMinor: 1999,
  },
];
