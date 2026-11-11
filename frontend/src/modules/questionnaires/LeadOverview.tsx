"use client";

import Link from "next/link";

import { isRemoteAgent } from "@/lib/organization-features";
import { useAuth } from "@/modules/auth/AuthProvider";
import { PriceQuote } from "@/modules/pricing/PriceQuote";
import { usePriceList } from "@/modules/pricing/usePriceList";
import { MetricTile, SectionCard } from "@/modules/questionnaires/form-ui";
import { buildLeadOverview } from "@/modules/questionnaires/overview";
import type { QuestionnaireFormValue } from "@/modules/questionnaires/defaults";
import { formatDate, formatMoney, leadStatusLabel } from "@/lib/format";
import { matchPriceTier } from "@/modules/pricing/price";
import { formatPhoneDisplay } from "@/lib/phone";
import type { Questionnaire } from "@/lib/types";

export function LeadOverview({
  item,
  form,
}: {
  item: Questionnaire;
  form: QuestionnaireFormValue;
}) {
  const metrics = buildLeadOverview(form);
  const { user } = useAuth();
  const { data: priceList } = usePriceList();
  const match = priceList ? matchPriceTier(priceList, metrics.debtTotal) : null;
  const tierCost = match?.kind === "tier" ? Number(match.tier.total_cost) : null;
  const costMismatch =
    tierCost != null && metrics.serviceCost != null && Math.round(metrics.serviceCost) !== Math.round(tierCost);

  return (
    <SectionCard
      id="overview"
      title="Обзор"
      description="Краткая сводка по анкете — всё считается из уже заполненных полей."
    >
      <div className="mb-4 rounded-xl bg-surface-muted px-4 py-3">
        <p className="text-sm font-semibold text-foreground">
          {form.full_name.trim() || formatPhoneDisplay(form.phone) || "Без имени"}
        </p>
        <p className="mt-1 text-sm text-muted">
          Статус: {leadStatusLabel(item.lead_status)}
          {" · "}
          Регион: {metrics.regionLabel}
          {item.appointment_at ? ` · Приём: ${formatDate(item.appointment_at)}` : ""}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricTile label="Кредиторов" value={String(metrics.creditorsCount || "—")} />
        <MetricTile label="Общий долг" value={metrics.debtTotalLabel} />
        <MetricTile label="Доход" value={metrics.incomeLabel} />
        <MetricTile label="Дети / иждивенцы" value={metrics.dependentsLabel} />
        <MetricTile label="Имущество" value={metrics.propertyLabel} />
        <MetricTile label="Оружие" value={metrics.weaponLabel} />
        <MetricTile label="Стоимость услуги" value={metrics.serviceCostLabel} />
        <MetricTile label="Банки" value={metrics.bankAccountsLabel} />
        <MetricTile
          label="ЗАГС"
          value={metrics.zagsLabel}
          hint="Зарегистрированный брак"
        />
      </div>

      {priceList && metrics.debtTotal > 0 ? (
        <div className="mt-4 rounded-xl border border-border px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">
              По прайсу · общий долг {metrics.debtTotalLabel}
            </p>
            {isRemoteAgent(user) ? (
              <Link href={`/agent/price?debt=${Math.round(metrics.debtTotal)}`} className="link-brand text-xs">
                Открыть прайс
              </Link>
            ) : null}
          </div>
          {costMismatch ? (
            <p className="alert-warning mb-3 text-sm">
              В анкете стоимость услуги {metrics.serviceCostLabel}, а по прайсу для общего долга{" "}
              {metrics.debtTotalLabel} — {formatMoney(tierCost)}. Проверьте суммы долгов в анкете или
              стоимость: рассрочка ниже посчитана по прайсу.
            </p>
          ) : null}
          <PriceQuote list={priceList} debt={metrics.debtTotal} compact />
        </div>
      ) : null}
    </SectionCard>
  );
}
