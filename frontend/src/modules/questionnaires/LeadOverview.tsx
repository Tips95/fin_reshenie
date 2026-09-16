"use client";

import { MetricTile, SectionCard } from "@/modules/questionnaires/form-ui";
import { buildLeadOverview } from "@/modules/questionnaires/overview";
import type { QuestionnaireFormValue } from "@/modules/questionnaires/defaults";
import { formatDate, leadStatusLabel } from "@/lib/format";
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

  return (
    <SectionCard
      id="overview"
      title="Обзор"
      description="Краткая сводка по анкете — всё считается из уже заполненных полей."
    >
      <div className="mb-4 rounded-xl bg-surface-muted/70 px-4 py-3">
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
    </SectionCard>
  );
}
