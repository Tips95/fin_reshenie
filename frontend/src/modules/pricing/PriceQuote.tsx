"use client";

import { CopyButton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import type { PriceList } from "@/lib/types";
import {
  clientPriceMessage,
  matchPriceTier,
  monthsLabel,
  paymentSchedule,
  tierRangeLabel,
} from "@/modules/pricing/price";

/** Расчёт по прайсу для конкретной суммы долга: стоимость и помесячный график. */
export function PriceQuote({
  list,
  debt,
  compact = false,
}: {
  list: PriceList;
  debt: number | null;
  compact?: boolean;
}) {
  const match = matchPriceTier(list, debt);

  if (match.kind === "empty") {
    return <p className="text-sm text-muted">Введите сумму долга клиента — покажем стоимость и график.</p>;
  }
  if (match.kind === "below") {
    return (
      <p className="alert-warning text-sm">
        Банкротство оформляется при долге от {formatMoney(match.min)}. С таким долгом клиенту лучше
        подойдут другие решения — уточните у куратора.
      </p>
    );
  }
  if (match.kind === "above") {
    return (
      <p className="alert-warning text-sm">
        Долг больше {formatMoney(match.max)} — стоимость рассчитывается индивидуально, уточните у куратора.
      </p>
    );
  }

  const { tier } = match;
  const schedule = paymentSchedule(tier);
  const peak = Math.max(...schedule.map((item) => item.amount));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Стоимость услуги · долг {tierRangeLabel(tier)}
          </p>
          <p className={cn("font-semibold tabular-nums tracking-tight text-foreground", compact ? "text-xl" : "text-3xl")}>
            {formatMoney(tier.total_cost)}
          </p>
          <p className="text-sm text-muted">
            Рассрочка на {monthsLabel(tier.total_months)} · сбор документов до договора —{" "}
            {formatMoney(list.document_collection_total)}
          </p>
        </div>
        <CopyButton
          text={clientPriceMessage(tier, list.document_collection_total)}
          label="Скопировать для клиента"
        />
      </div>

      <ol className="flex gap-1.5 overflow-x-auto pb-1" aria-label="График платежей">
        {schedule.map((item) => (
          <li
            key={item.month}
            className="flex min-w-[68px] flex-1 flex-col justify-end rounded-lg border border-border bg-surface-muted px-2 pb-1.5 pt-2 text-center"
          >
            <div
              className="mx-auto mb-1.5 w-full max-w-[36px] rounded-sm bg-brand-600"
              style={{ height: `${Math.max(12, Math.round((item.amount / peak) * (compact ? 32 : 56)))}px` }}
            />
            <p className="text-xs font-semibold tabular-nums text-foreground">{formatMoney(item.amount)}</p>
            <p className="text-[11px] text-muted">{item.month}-й мес.</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
