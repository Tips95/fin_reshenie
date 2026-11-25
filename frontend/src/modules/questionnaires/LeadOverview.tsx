"use client";

import Link from "next/link";

import { Button, FormField, Input } from "@/components/ui";
import { formatDate, formatMoney, leadStatusLabel } from "@/lib/format";
import { isRemoteAgent } from "@/lib/organization-features";
import { formatPhoneDisplay } from "@/lib/phone";
import type { InstallmentMode, Questionnaire, QuestionnaireInstallmentMonth } from "@/lib/types";
import { filterDecimalInput } from "@/lib/validation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { PriceQuote } from "@/modules/pricing/PriceQuote";
import { matchPriceTier, paymentSchedule } from "@/modules/pricing/price";
import { usePriceList } from "@/modules/pricing/usePriceList";
import {
  addInstallmentMonth,
  removeInstallmentMonth,
  type QuestionnaireFormValue,
} from "@/modules/questionnaires/defaults";
import { MetricTile, SectionCard, YesNo } from "@/modules/questionnaires/form-ui";
import { buildLeadOverview } from "@/modules/questionnaires/overview";

export function LeadOverview({
  item,
  form,
  onChange,
  onApplyServiceCost,
}: {
  item: Questionnaire;
  form: QuestionnaireFormValue;
  onChange?: (partial: Partial<QuestionnaireFormValue>) => void;
  onApplyServiceCost?: (cost: string) => void;
}) {
  const metrics = buildLeadOverview(form);
  const { user } = useAuth();
  const { data: priceList } = usePriceList();
  const match = priceList ? matchPriceTier(priceList, metrics.debtTotal) : null;
  const tierCost = match?.kind === "tier" ? Number(match.tier.total_cost) : null;
  const costMismatch =
    tierCost != null &&
    metrics.serviceCost != null &&
    Math.round(metrics.serviceCost) !== Math.round(tierCost);
  const canApplyTierCost =
    Boolean(onApplyServiceCost) &&
    tierCost != null &&
    (metrics.serviceCost == null || Math.round(metrics.serviceCost) !== Math.round(tierCost));
  const mode: InstallmentMode = form.installment_mode === "manual" ? "manual" : "auto";
  const schedule = form.installment_schedule ?? [];
  const manualTotal = schedule.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const canEdit = Boolean(onChange);

  function setMode(next: InstallmentMode) {
    if (!onChange || next === mode) return;
    if (next === "manual") {
      let nextSchedule = schedule;
      if (nextSchedule.length === 0 && match?.kind === "tier") {
        nextSchedule = paymentSchedule(match.tier).map((row) => ({
          month: row.month,
          amount: String(Math.round(row.amount)),
        }));
      }
      if (nextSchedule.length === 0) {
        nextSchedule = [{ month: 1, amount: "" }];
      }
      const patch: Partial<QuestionnaireFormValue> = {
        installment_mode: "manual",
        installment_schedule: nextSchedule,
      };
      if (
        match?.kind === "tier" &&
        onApplyServiceCost &&
        (metrics.serviceCost == null || Math.round(metrics.serviceCost) !== Math.round(Number(match.tier.total_cost)))
      ) {
        onApplyServiceCost(String(Math.round(Number(match.tier.total_cost))));
      }
      onChange(patch);
      return;
    }
    onChange({ installment_mode: "auto" });
  }

  function patchSchedule(rows: QuestionnaireInstallmentMonth[]) {
    onChange?.({ installment_schedule: rows });
  }

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

      <div className="mt-4 rounded-xl border border-border px-4 py-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">Рассрочка</p>
            <p className="text-xs text-muted">
              По прайсу — автоподбор по долгу; вручную — свой график для PDF и анкеты.
            </p>
          </div>
          {canEdit ? (
            <YesNo
              value={mode === "auto"}
              onChange={(auto) => setMode(auto ? "auto" : "manual")}
              yesLabel="По прайсу"
              noLabel="Вручную"
            />
          ) : (
            <p className="text-sm text-muted">{mode === "auto" ? "По прайсу" : "Вручную"}</p>
          )}
        </div>

        {mode === "auto" ? (
          priceList && metrics.debtTotal > 0 ? (
            <>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted">Долг {metrics.debtTotalLabel}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {canApplyTierCost ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => onApplyServiceCost?.(String(Math.round(tierCost)))}
                    >
                      Взять стоимость из прайса
                    </Button>
                  ) : null}
                  {isRemoteAgent(user) ? (
                    <Link
                      href={`/agent/price?debt=${Math.round(metrics.debtTotal)}`}
                      className="link-brand text-xs"
                    >
                      Открыть прайс
                    </Link>
                  ) : null}
                </div>
              </div>
              {costMismatch ? (
                <p className="alert-warning mb-3 text-sm">
                  В анкете стоимость услуги {metrics.serviceCostLabel}, а по прайсу для общего долга{" "}
                  {metrics.debtTotalLabel} — {formatMoney(tierCost)}. Можно подставить сумму кнопкой выше
                  или проверить долги.
                </p>
              ) : null}
              <PriceQuote list={priceList} debt={metrics.debtTotal} />
            </>
          ) : (
            <p className="text-sm text-muted">
              Укажите долги — подставим стоимость и график из прайса.
            </p>
          )
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <p className="text-sm text-muted">
                Итого{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatMoney(manualTotal)}
                </span>
                {schedule.length > 0 ? ` · ${schedule.length} мес.` : ""}
              </p>
              {canEdit ? (
                <div className="flex flex-wrap gap-2">
                  {match?.kind === "tier" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const fromTier = paymentSchedule(match.tier).map((row) => ({
                          month: row.month,
                          amount: String(Math.round(row.amount)),
                        }));
                        patchSchedule(fromTier);
                        onApplyServiceCost?.(String(Math.round(Number(match.tier.total_cost))));
                      }}
                    >
                      Заполнить из прайса
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => patchSchedule(addInstallmentMonth(schedule))}
                  >
                    + Месяц
                  </Button>
                </div>
              ) : null}
            </div>

            {schedule.length === 0 ? (
              <p className="text-sm text-muted">Добавьте месяцы графика.</p>
            ) : (
              <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {schedule.map((row, index) => (
                  <li
                    key={`installment-${row.month}-${index}`}
                    className="flex items-end gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <FormField label={`${row.month}-й месяц`}>
                        <Input
                          inputMode="decimal"
                          value={row.amount}
                          disabled={!canEdit}
                          placeholder="0"
                          onChange={(event) => {
                            const amount = filterDecimalInput(event.target.value);
                            patchSchedule(
                              schedule.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, amount } : item,
                              ),
                            );
                          }}
                        />
                      </FormField>
                    </div>
                    {canEdit && schedule.length > 1 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="mb-0.5 shrink-0"
                        onClick={() => patchSchedule(removeInstallmentMonth(schedule, index))}
                      >
                        ×
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
