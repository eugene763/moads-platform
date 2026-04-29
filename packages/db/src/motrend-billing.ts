export interface MotrendCreditPackDefinition {
  code: string;
  name: string;
  creditsAmount: number;
  amountMinor: number;
  dodoProductId?: string;
}

export const DEFAULT_MOTREND_CREDIT_PACKS: MotrendCreditPackDefinition[] = [
  {
    code: "motrend_credits_starter",
    name: "Starter",
    creditsAmount: 30,
    amountMinor: 499,
    dodoProductId: "pdt_0NbveLQCLSD2Mooo7VM4P",
  },
  {
    code: "motrend_credits_creator",
    name: "Creator",
    creditsAmount: 80,
    amountMinor: 999,
    dodoProductId: "pdt_0NbveJet1CbAWPjsr6eRw",
  },
  {
    code: "motrend_credits_pro",
    name: "Pro",
    creditsAmount: 200,
    amountMinor: 1999,
    dodoProductId: "pdt_0NbveKvRWgGzOx2H7hrdc",
  },
];
