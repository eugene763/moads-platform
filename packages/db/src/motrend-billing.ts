export interface MotrendCreditPackDefinition {
  code: string;
  name: string;
  creditsAmount: number;
  amountMinor: number;
  dodoProductId?: string;
}

export type MotrendDodoEnvironment = "live_mode" | "test_mode";

export const MOTREND_LIVE_DODO_PRODUCT_IDS = {
  starter: "pdt_0NbveLQCLSD2Mooo7VM4P",
  creator: "pdt_0NbveJet1CbAWPjsr6eRw",
  pro: "pdt_0NbveKvRWgGzOx2H7hrdc",
} as const;

export const MOTREND_TEST_DODO_PRODUCT_IDS = {
  starter: "pdt_0Nbn3AengyfOHAGPiGibQ",
  creator: "pdt_0Nbn3kZhICn5HGrxLBvSx",
  pro: "pdt_0Nbn40LuSVJ47oKbWRsSd",
} as const;

type MotrendDodoProductIdMap = {
  starter: string;
  creator: string;
  pro: string;
};

function buildDefaultMotrendCreditPacks(
  dodoProductIds: MotrendDodoProductIdMap,
): MotrendCreditPackDefinition[] {
  return [
    {
      code: "motrend_credits_starter",
      name: "Starter",
      creditsAmount: 30,
      amountMinor: 499,
      dodoProductId: dodoProductIds.starter,
    },
    {
      code: "motrend_credits_creator",
      name: "Creator",
      creditsAmount: 80,
      amountMinor: 999,
      dodoProductId: dodoProductIds.creator,
    },
    {
      code: "motrend_credits_pro",
      name: "Pro",
      creditsAmount: 200,
      amountMinor: 1999,
      dodoProductId: dodoProductIds.pro,
    },
  ];
}

export function getDefaultMotrendCreditPacks(
  dodoEnvironment: MotrendDodoEnvironment = "live_mode",
): MotrendCreditPackDefinition[] {
  return dodoEnvironment === "test_mode" ?
    buildDefaultMotrendCreditPacks(MOTREND_TEST_DODO_PRODUCT_IDS) :
    buildDefaultMotrendCreditPacks(MOTREND_LIVE_DODO_PRODUCT_IDS);
}

export const DEFAULT_MOTREND_CREDIT_PACKS: MotrendCreditPackDefinition[] = getDefaultMotrendCreditPacks();

export const DEFAULT_TEST_MOTREND_CREDIT_PACKS: MotrendCreditPackDefinition[] = getDefaultMotrendCreditPacks(
  "test_mode",
);
