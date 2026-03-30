export interface MotrendCreditPackDefinition {
  code: string;
  name: string;
  creditsAmount: number;
  amountMinor: number;
}

export const DEFAULT_MOTREND_CREDIT_PACKS: MotrendCreditPackDefinition[] = [
  {
    code: "motrend_credits_starter",
    name: "Starter",
    creditsAmount: 30,
    amountMinor: 499,
  },
  {
    code: "motrend_credits_creator",
    name: "Creator",
    creditsAmount: 80,
    amountMinor: 999,
  },
  {
    code: "motrend_credits_pro",
    name: "Pro",
    creditsAmount: 200,
    amountMinor: 1999,
  },
];
