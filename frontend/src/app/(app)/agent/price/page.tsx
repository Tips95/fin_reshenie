"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AmountInput, Card, FormField, LoadingState, PageHeader, SectionTitle } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { matchPriceTier, monthsLabel } from "@/modules/pricing/price";
import { PriceQuote } from "@/modules/pricing/PriceQuote";
import { usePriceList } from "@/modules/pricing/usePriceList";

const PRESETS = [350_000, 500_000, 800_000, 1_000_000, 1_500_000, 2_000_000];

export default function AgentPricePage() {
  const { data, error } = usePriceList();
  const [debt, setDebt] = useState("");

  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get("debt");
    if (fromLink && /^\d+$/.test(fromLink)) setDebt(fromLink);
  }, []);

  const debtNumber = debt ? Number(debt) : null;
  const matchedId = useMemo(() => {
    if (!data) return null;
    const match = matchPriceTier(data, debtNumber);
    return match.kind === "tier" ? match.tier.id : null;
  }, [data, debtNumber]);

  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = tableRef.current;
    const row = matchedId ? document.getElementById(`tier-${matchedId}`) : null;
    if (!box || !row) return;
    box.scrollTo({ top: row.offsetTop - box.clientHeight / 2, behavior: "smooth" });
  }, [matchedId]);

  if (error) return <p className="alert-danger">Не удалось загрузить прайс. Обновите страницу.</p>;
  if (!data) return <LoadingState text="Загрузка прайса..." />;

  return (
    <div className="page-stack">
      <PageHeader
        title="Прайс"
        subtitle="Стоимость банкротства зависит от суммы долга. Введите долг клиента — расчёт можно сразу отправить ему."
      />

      <Card>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
          <div className="space-y-3">
            <FormField label="Общий долг клиента, ₽">
              <AmountInput
                value={debt}
                onValueChange={setDebt}
                placeholder="Например, 750 000"
                autoFocus
                className="text-lg font-semibold"
              />
            </FormField>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setDebt(String(amount))}
                  className={cn(
                    "interactive rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums",
                    debtNumber === amount
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-border bg-surface text-muted hover:text-foreground",
                  )}
                >
                  {formatMoney(amount)}
                </button>
              ))}
            </div>
          </div>
          <PriceQuote list={data} debt={debtNumber} />
        </div>
      </Card>

      <Card>
        <SectionTitle
          title="Весь прайс"
          description={`Диапазоны включительно. Нажмите на строку, чтобы посчитать. Сбор документов до договора — ${formatMoney(data.document_collection_total)} для всех.`}
        />
        <div ref={tableRef} className="relative max-h-[60vh] overflow-auto rounded-lg border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="sticky top-0 z-10 bg-surface-muted text-left text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Долг клиента</th>
                <th className="px-3 py-2 text-right font-medium">Стоимость</th>
                <th className="px-3 py-2 text-right font-medium">1-й мес.</th>
                <th className="px-3 py-2 text-right font-medium">2-й мес.</th>
                <th className="px-3 py-2 text-right font-medium">Далее</th>
                <th className="px-3 py-2 text-right font-medium">Срок</th>
              </tr>
            </thead>
            <tbody>
              {data.tiers.map((tier) => {
                const active = tier.id === matchedId;
                return (
                  <tr
                    key={tier.id}
                    id={`tier-${tier.id}`}
                    onClick={() => setDebt(String(Math.round(Number(tier.min_amount))))}
                    className={cn(
                      "cursor-pointer border-t border-border tabular-nums transition-colors",
                      active ? "bg-brand-50 font-semibold text-brand-700" : "hover:bg-surface-muted",
                    )}
                  >
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatMoney(tier.min_amount)} – {formatMoney(tier.max_amount)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">
                      {formatMoney(tier.total_cost)}
                    </td>
                    <td className="px-3 py-2 text-right">{formatMoney(tier.first_month_payment)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(tier.second_month_payment)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {tier.remaining_months_count > 0
                        ? `${tier.remaining_months_count} × ${formatMoney(tier.remaining_month_payment)}`
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-muted">
                      {monthsLabel(tier.total_months)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
