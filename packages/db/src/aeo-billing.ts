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
    dodoProductId: "pdt_0NcVKMKum3pnZI0k9W9GP",
  },
  {
    code: "aeo_pack_m",
    name: "Pack M",
    creditsAmount: 80,
    amountMinor: 999,
    dodoProductId: "pdt_0NcVKTv8PCbSE5KplPmSI",
  },
  {
    code: "aeo_pack_l",
    name: "Pack L",
    creditsAmount: 200,
    amountMinor: 1999,
    dodoProductId: "pdt_0NcVKZ0msSsA9QJ8ZVzH6",
  },
];
