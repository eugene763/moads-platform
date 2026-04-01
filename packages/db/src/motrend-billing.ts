export interface MotrendCreditPackDefinition {
  code: string;
  name: string;
  creditsAmount: number;
  amountMinor: number;
  creemProductId?: string;
  fastspringProductPath?: string;
}

export const DEFAULT_MOTREND_CREDIT_PACKS: MotrendCreditPackDefinition[] = [
  {
    code: "motrend_credits_starter",
    name: "Starter",
    creditsAmount: 30,
    amountMinor: 499,
    fastspringProductPath: "motrend-credits-30",
  },
  {
    code: "motrend_credits_creator",
    name: "Creator",
    creditsAmount: 80,
    amountMinor: 999,
    fastspringProductPath: "motrend-credits-80",
  },
  {
    code: "motrend_credits_pro",
    name: "Pro",
    creditsAmount: 200,
    amountMinor: 1999,
    fastspringProductPath: "motrend-credits-200",
  },
];
