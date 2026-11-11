import { formatMoney, pluralRu } from "@/lib/format";
import type { PriceList, PricingTier } from "@/lib/types";

export type PriceMatch =
  | { kind: "empty" }
  | { kind: "below"; min: number }
  | { kind: "above"; max: number }
  | { kind: "tier"; tier: PricingTier };

/** Диапазоны включительные, на границе берётся нижний — как при заключении договора. */
export function matchPriceTier(list: PriceList, debt: number | null): PriceMatch {
  if (!debt || debt <= 0) return { kind: "empty" };
  const min = Number(list.min_debt_amount);
  if (debt < min) return { kind: "below", min };
  const tier = list.tiers.find(
    (item) => Number(item.min_amount) <= debt && debt <= Number(item.max_amount),
  );
  if (tier) return { kind: "tier", tier };
  const max = Math.max(...list.tiers.map((item) => Number(item.max_amount)));
  return { kind: "above", max };
}

export function paymentSchedule(tier: PricingTier): { month: number; amount: number }[] {
  return [
    Number(tier.first_month_payment),
    Number(tier.second_month_payment),
    ...Array.from({ length: tier.remaining_months_count }, () => Number(tier.remaining_month_payment)),
  ].map((amount, index) => ({ month: index + 1, amount }));
}

export function tierRangeLabel(tier: PricingTier): string {
  return `${formatMoney(tier.min_amount)} – ${formatMoney(tier.max_amount)}`;
}

export function monthsLabel(count: number): string {
  return pluralRu(count, ["месяц", "месяца", "месяцев"]);
}

/** Текст, который удалённый менеджер отправляет клиенту в мессенджер. */
export function clientPriceMessage(tier: PricingTier, documentCollectionTotal: string): string {
  const lines = [
    "Банкротство физического лица под ключ",
    `Стоимость: ${formatMoney(tier.total_cost)} в рассрочку на ${monthsLabel(tier.total_months)}`,
    `1-й месяц — ${formatMoney(tier.first_month_payment)}`,
    `2-й месяц — ${formatMoney(tier.second_month_payment)}`,
  ];
  if (tier.remaining_months_count > 0) {
    const from = 3;
    const to = tier.total_months;
    const period = from === to ? `${from}-й месяц` : `${from}–${to}-й месяцы`;
    lines.push(`${period} — по ${formatMoney(tier.remaining_month_payment)}`);
  }
  lines.push(`Сбор документов до договора — ${formatMoney(documentCollectionTotal)}`);
  return lines.join("\n");
}
