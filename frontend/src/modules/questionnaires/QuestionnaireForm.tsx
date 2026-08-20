"use client";

import { useState, type ReactNode } from "react";

import { Button, FormField, Input, PhoneInput } from "@/components/ui";
import { filterDecimalInput, filterPersonName, hasErrors } from "@/lib/validation";
import { cn } from "@/lib/cn";
import {
  addDebtRow,
  hadRegisteredMarriage,
  hasAnyProperty,
  hasSpouse,
  removeDebtRow,
  validateQuestionnaireForm,
  type QuestionnaireFormValue,
} from "@/modules/questionnaires/defaults";

const fieldClass = "min-h-8 text-xs lg:min-h-[30px]";
const textareaClass =
  "interactive min-h-[56px] w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-soft outline-none placeholder:text-muted focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";

function YesNo({
  value,
  onChange,
  yesLabel = "Да",
  noLabel = "Нет",
}: {
  value: boolean | null;
  onChange: (value: boolean) => void;
  yesLabel?: string;
  noLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      className="inline-flex h-8 shrink-0 items-center rounded-full border border-border bg-surface-muted p-0.5"
    >
      <button
        type="button"
        role="radio"
        aria-checked={value === true}
        className={cn(
          "inline-flex h-7 min-w-[58px] items-center justify-center rounded-full px-3 text-[12px] font-semibold leading-none",
          value === true
            ? "bg-brand-600 text-white shadow-soft"
            : "text-muted hover:text-foreground",
        )}
        onClick={() => onChange(true)}
      >
        {yesLabel}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === false}
        className={cn(
          "inline-flex h-7 min-w-[58px] items-center justify-center rounded-full px-3 text-[12px] font-semibold leading-none",
          value === false
            ? "bg-chrome text-chrome-text shadow-soft"
            : "text-muted hover:text-foreground",
        )}
        onClick={() => onChange(false)}
      >
        {noLabel}
      </button>
    </div>
  );
}

function QuestionRow({
  title,
  hint,
  required,
  error,
  field,
  children,
  details,
}: {
  title: string;
  hint?: string;
  required?: boolean;
  error?: string;
  field?: string;
  children: ReactNode;
  details?: ReactNode;
}) {
  return (
    <div
      data-field={field}
      className={cn(
        "rounded-lg px-2.5 py-2",
        error ? "bg-status-danger-bg ring-1 ring-status-danger-border" : "hover:bg-surface-muted/70",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-5 text-foreground">
            {title}
            {required ? <span className="text-brand-600"> *</span> : null}
          </p>
          {hint ? <p className="mt-0.5 text-[11px] leading-tight text-muted">{hint}</p> : null}
        </div>
        {children}
      </div>
      {details ? <div className="mt-2 max-w-xl">{details}</div> : null}
      {error ? <p className="mt-1 text-[11px] text-status-danger-text">{error}</p> : null}
    </div>
  );
}

function StepHeader({
  step,
  title,
  description,
  action,
}: {
  step: number;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[10px] font-semibold text-white">
          {step}
        </span>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground">{title}</h2>
        {description ? <span className="hidden text-[11px] text-muted sm:inline">· {description}</span> : null}
      </div>
      {action}
    </div>
  );
}

export function QuestionnaireForm({
  value,
  onChange,
  onSubmit,
  saving,
  submitLabel,
  extraActions,
}: {
  value: QuestionnaireFormValue;
  onChange: (next: QuestionnaireFormValue) => void;
  onSubmit: () => void;
  saving: boolean;
  submitLabel: string;
  extraActions?: ReactNode;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const married = hasSpouse(value);
  const showSpouseProperty = hadRegisteredMarriage(value);
  const showEncumbrance = hasAnyProperty(value);
  const remaining = Object.keys(validateQuestionnaireForm(value)).length;

  function patch(partial: Partial<QuestionnaireFormValue>) {
    const next = { ...value, ...partial };
    onChange(next);
    if (hasErrors(errors)) {
      setErrors(validateQuestionnaireForm(next));
    }
  }

  function setMarriage(is_married: boolean) {
    if (is_married) {
      patch({
        is_married,
        was_divorced: null,
        divorce_info: "",
      });
      return;
    }
    patch({
      is_married,
      income_spouse: "",
    });
  }

  function setDebtorProperty(has_property_debtor: boolean) {
    const nextHasAny =
      has_property_debtor || (showSpouseProperty && value.has_property_spouse === true);
    patch({
      has_property_debtor,
      property_debtor: has_property_debtor ? value.property_debtor : "",
      has_property_encumbrance: nextHasAny ? value.has_property_encumbrance : false,
      property_encumbrance_details: nextHasAny ? value.property_encumbrance_details : "",
    });
  }

  function setSpouseProperty(has_property_spouse: boolean) {
    const nextHasAny = value.has_property_debtor === true || has_property_spouse;
    patch({
      has_property_spouse,
      property_spouse: has_property_spouse ? value.property_spouse : "",
      has_property_encumbrance: nextHasAny ? value.has_property_encumbrance : false,
      property_encumbrance_details: nextHasAny ? value.property_encumbrance_details : "",
    });
  }

  function scrollToFirstError(nextErrors: Record<string, string>) {
    const first = Object.keys(nextErrors)[0];
    if (!first) return;
    window.requestAnimationFrame(() => {
      document.querySelector(`[data-field="${first}"]`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }

  return (
    <form
      className="pb-20"
      onSubmit={(event) => {
        event.preventDefault();
        const nextErrors = validateQuestionnaireForm(value);
        setErrors(nextErrors);
        if (hasErrors(nextErrors)) {
          scrollToFirstError(nextErrors);
          return;
        }
        onSubmit();
      }}
    >
      {hasErrors(errors) ? (
        <p className="alert-danger mb-2">
          Осталось заполнить: {Object.keys(errors).length}. Прокрутите к подсвеченным полям.
        </p>
      ) : null}

      <div className="surface-card divide-y divide-border overflow-hidden">
        <section className="px-3 py-2.5 lg:px-4">
          <StepHeader step={1} title="Клиент" />
          <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
            <div data-field="full_name">
              <FormField label="ФИО" required error={errors.full_name}>
                <Input
                  className={fieldClass}
                  value={value.full_name}
                  onChange={(event) => patch({ full_name: filterPersonName(event.target.value) })}
                  placeholder="Иванов Иван Иванович"
                />
              </FormField>
            </div>
            <div data-field="phone">
              <FormField label="Телефон" required error={errors.phone}>
                <PhoneInput
                  className={fieldClass}
                  value={value.phone}
                  onValueChange={(phone) => patch({ phone })}
                />
              </FormField>
            </div>
            <div data-field="service_cost">
              <FormField label="Стоимость" required error={errors.service_cost}>
                <Input
                  className={fieldClass}
                  inputMode="decimal"
                  value={value.service_cost ?? ""}
                  onChange={(event) => patch({ service_cost: filterDecimalInput(event.target.value) })}
                  placeholder="13000"
                />
              </FormField>
            </div>
            <div data-field="registration_region">
              <FormField label="Регион" required error={errors.registration_region}>
                <Input
                  className={fieldClass}
                  value={value.registration_region ?? ""}
                  onChange={(event) => patch({ registration_region: event.target.value })}
                  placeholder="Чеченская Республика"
                />
              </FormField>
            </div>
          </div>
        </section>

        <section className="px-3 py-2.5 lg:px-4">
          <StepHeader
            step={2}
            title="Кредиторы"
            description="дату можно набрать дд.мм.гггг"
            action={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => patch({ debts: addDebtRow(value.debts) })}
              >
                + Кредитор
              </Button>
            }
          />
          <div className="space-y-2">
            {value.debts.map((row, index) => (
              <div key={index} className="rounded-md border border-border/80 bg-surface-muted/20 px-2.5 py-2">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-muted">Кредитор {index + 1}</p>
                  {value.debts.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => patch({ debts: removeDebtRow(value.debts, index) })}
                    >
                      Удалить
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-x-2 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-5">
                  <div data-field={`debt_${index}_creditor`}>
                    <FormField label="Кредитор" required error={errors[`debt_${index}_creditor`]}>
                      <Input
                        className={fieldClass}
                        value={row.creditor}
                        onChange={(event) => {
                          const debts = value.debts.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, creditor: event.target.value } : item,
                          );
                          patch({ debts });
                        }}
                        placeholder="Банк, МФО, ФНС..."
                      />
                    </FormField>
                  </div>
                  <div data-field={`debt_${index}_origin_date`}>
                    <FormField
                      label="Возникновение"
                      error={errors[`debt_${index}_origin_date`]}
                    >
                      <Input
                        type="date"
                        value={row.origin_date ?? ""}
                        onChange={(event) => {
                          const debts = value.debts.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, origin_date: event.target.value || null }
                              : item,
                          );
                          patch({ debts });
                        }}
                      />
                    </FormField>
                  </div>
                  <div data-field={`debt_${index}_monthly_payment`}>
                    <FormField
                      label="Платёж"
                      required
                      error={errors[`debt_${index}_monthly_payment`]}
                    >
                      <Input
                        className={fieldClass}
                        inputMode="decimal"
                        value={row.monthly_payment}
                        onChange={(event) => {
                          const debts = value.debts.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, monthly_payment: filterDecimalInput(event.target.value) }
                              : item,
                          );
                          patch({ debts });
                        }}
                      />
                    </FormField>
                  </div>
                  <div data-field={`debt_${index}_overdue_start_date`}>
                    <FormField
                      label="Просрочка с"
                      error={errors[`debt_${index}_overdue_start_date`]}
                    >
                      <Input
                        type="date"
                        value={row.overdue_start_date ?? ""}
                        onChange={(event) => {
                          const debts = value.debts.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, overdue_start_date: event.target.value || null }
                              : item,
                          );
                          patch({ debts });
                        }}
                      />
                    </FormField>
                  </div>
                  <div data-field={`debt_${index}_debt_amount`}>
                    <FormField label="Долг" required error={errors[`debt_${index}_debt_amount`]}>
                      <Input
                        className={fieldClass}
                        inputMode="decimal"
                        value={row.debt_amount}
                        onChange={(event) => {
                          const debts = value.debts.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, debt_amount: filterDecimalInput(event.target.value) }
                              : item,
                          );
                          patch({ debts });
                        }}
                      />
                    </FormField>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="px-3 py-2.5 lg:px-4">
          <StepHeader step={3} title="Семья и доходы" />
          <div className="space-y-0.5">
            <QuestionRow
              title="Зарегистрированный брак"
              required
              field="is_married"
              error={errors.is_married}
            >
              <YesNo value={value.is_married} onChange={setMarriage} />
            </QuestionRow>
            {value.is_married === false ? (
              <QuestionRow
                title="Официальный брак расторгнут?"
                hint="Если никогда не заключали — НЕТ"
                required
                field="was_divorced"
                error={errors.was_divorced}
                details={
                  value.was_divorced ? (
                    <div data-field="divorce_info">
                      <FormField label="Когда расторгнут" required error={errors.divorce_info}>
                        <Input
                          className={fieldClass}
                          value={value.divorce_info ?? ""}
                          onChange={(event) => patch({ divorce_info: event.target.value })}
                          placeholder="Дата или год"
                        />
                      </FormField>
                    </div>
                  ) : null
                }
              >
                <YesNo
                  value={value.was_divorced}
                  onChange={(was_divorced) =>
                    patch({
                      was_divorced,
                      divorce_info: was_divorced ? value.divorce_info : "",
                      property_spouse: was_divorced ? value.property_spouse : "",
                      has_property_spouse: was_divorced ? value.has_property_spouse : null,
                    })
                  }
                />
              </QuestionRow>
            ) : null}
          </div>
          <div className="mt-2 grid gap-x-3 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
            <div data-field="dependents">
              <FormField label="Дети и иждивенцы" required error={errors.dependents}>
                <Input
                  className={fieldClass}
                  value={value.dependents ?? ""}
                  onChange={(event) => patch({ dependents: event.target.value })}
                  placeholder="Нет / двое детей"
                />
              </FormField>
            </div>
            <div data-field="income_debtor">
              <FormField label="Доход должника" required error={errors.income_debtor}>
                <Input
                  className={fieldClass}
                  value={value.income_debtor ?? ""}
                  onChange={(event) => patch({ income_debtor: event.target.value })}
                  placeholder="ЗП 40 000, пенсия..."
                />
              </FormField>
            </div>
            {married ? (
              <div data-field="income_spouse">
                <FormField label="Доход супруга(и)" required error={errors.income_spouse}>
                  <Input
                    className={fieldClass}
                    value={value.income_spouse ?? ""}
                    onChange={(event) => patch({ income_spouse: event.target.value })}
                    placeholder="Нет / сумма"
                  />
                </FormField>
              </div>
            ) : null}
            <div data-field="income_destination">
              <FormField label="Куда поступают выплаты" error={errors.income_destination}>
                <Input
                  className={fieldClass}
                  value={value.income_destination ?? ""}
                  onChange={(event) => patch({ income_destination: event.target.value })}
                  placeholder="Если помнит: Сбер, Т-Банк..."
                />
              </FormField>
            </div>
            <div data-field="bank_accounts" className={married ? "xl:col-span-2" : undefined}>
              <FormField label="Счета в банках" required error={errors.bank_accounts}>
                <Input
                  className={fieldClass}
                  value={value.bank_accounts ?? ""}
                  onChange={(event) => patch({ bank_accounts: event.target.value })}
                  placeholder="Сбер, Т-Банк, Россельхозбанк..."
                />
              </FormField>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-status-warning-text">
            Если выплаты идут в Россельхозбанк — срочно перевести в другой банк.
          </p>
          <div className="mt-1.5 space-y-0.5">
            <QuestionRow
              title="Поддельные / недостоверные справки о доходах при кредитах"
              required
              field="fake_income_documents"
              error={errors.fake_income_documents}
            >
              <YesNo
                value={value.fake_income_documents}
                onChange={(fake_income_documents) => patch({ fake_income_documents })}
              />
            </QuestionRow>
            <QuestionRow
              title="Поручительство или залог"
              required
              field="has_guarantee_or_collateral"
              error={errors.has_guarantee_or_collateral}
            >
              <YesNo
                value={value.has_guarantee_or_collateral}
                onChange={(has_guarantee_or_collateral) => patch({ has_guarantee_or_collateral })}
              />
            </QuestionRow>
          </div>
        </section>

        <section className="px-3 py-2.5 lg:px-4">
          <StepHeader step={4} title="Имущество" description="если нет — в PDF будет «Отсутствует»" />
          <div className="space-y-0.5">
            <QuestionRow
              title="Имущество должника"
              required
              field="has_property_debtor"
              error={errors.has_property_debtor}
              details={
                value.has_property_debtor ? (
                  <div data-field="property_debtor">
                    <FormField label="Какое" required error={errors.property_debtor}>
                      <textarea
                        className={textareaClass}
                        value={value.property_debtor}
                        onChange={(event) => patch({ property_debtor: event.target.value })}
                        placeholder="Квартира, машина, участок…"
                      />
                    </FormField>
                  </div>
                ) : null
              }
            >
              <YesNo value={value.has_property_debtor} onChange={setDebtorProperty} />
            </QuestionRow>
            {showSpouseProperty ? (
              <QuestionRow
                title={
                  value.was_divorced === true
                    ? "Имущество бывшего супруга(и)"
                    : "Имущество супруга(и)"
                }
                required
                field="has_property_spouse"
                error={errors.has_property_spouse}
                details={
                  value.has_property_spouse ? (
                    <div data-field="property_spouse">
                      <FormField label="Какое" required error={errors.property_spouse}>
                        <textarea
                          className={textareaClass}
                          value={value.property_spouse}
                          onChange={(event) => patch({ property_spouse: event.target.value })}
                          placeholder="Квартира, машина…"
                        />
                      </FormField>
                    </div>
                  ) : null
                }
              >
                <YesNo value={value.has_property_spouse} onChange={setSpouseProperty} />
              </QuestionRow>
            ) : null}
            {showEncumbrance ? (
              <QuestionRow
                title="Обременение (залог, арест)"
                required
                field="has_property_encumbrance"
                error={errors.has_property_encumbrance}
                details={
                  value.has_property_encumbrance ? (
                    <div data-field="property_encumbrance_details">
                      <FormField label="Какое" required error={errors.property_encumbrance_details}>
                        <Input
                          className={fieldClass}
                          value={value.property_encumbrance_details ?? ""}
                          onChange={(event) =>
                            patch({ property_encumbrance_details: event.target.value })
                          }
                        />
                      </FormField>
                    </div>
                  ) : null
                }
              >
                <YesNo
                  value={value.has_property_encumbrance}
                  onChange={(has_property_encumbrance) =>
                    patch({
                      has_property_encumbrance,
                      property_encumbrance_details: has_property_encumbrance
                        ? value.property_encumbrance_details
                        : "",
                    })
                  }
                />
              </QuestionRow>
            ) : null}
            <QuestionRow
              title={
                showSpouseProperty
                  ? "Сделки с имуществом за 3 года, включая супруга(и)"
                  : "Сделки с имуществом за 3 года"
              }
              hint={
                value.was_divorced === true
                  ? "В том числе сделки бывшего супруга(и) в период брака"
                  : undefined
              }
              required
              field="has_recent_property_deals"
              error={errors.has_recent_property_deals}
              details={
                value.has_recent_property_deals ? (
                  <div data-field="recent_property_deals_details">
                    <FormField label="Какие" required error={errors.recent_property_deals_details}>
                      <Input
                        className={fieldClass}
                        value={value.recent_property_deals_details ?? ""}
                        onChange={(event) =>
                          patch({ recent_property_deals_details: event.target.value })
                        }
                      />
                    </FormField>
                  </div>
                ) : null
              }
            >
              <YesNo
                value={value.has_recent_property_deals}
                onChange={(has_recent_property_deals) =>
                  patch({
                    has_recent_property_deals,
                    recent_property_deals_details: has_recent_property_deals
                      ? value.recent_property_deals_details
                      : "",
                  })
                }
              />
            </QuestionRow>
            <QuestionRow
              title="Наличие оружия"
              required
              field="has_weapon"
              error={errors.has_weapon}
              details={
                value.has_weapon ? (
                  <FormField label="Какое / комментарий">
                    <Input
                      className={fieldClass}
                      value={value.weapon_details}
                      onChange={(event) => patch({ weapon_details: event.target.value })}
                      placeholder="Необязательно"
                    />
                  </FormField>
                ) : null
              }
            >
              <YesNo
                value={value.has_weapon}
                onChange={(has_weapon) =>
                  patch({ has_weapon, weapon_details: has_weapon ? value.weapon_details : "" })
                }
              />
            </QuestionRow>
          </div>
        </section>

        <section className="px-3 py-2.5 lg:px-4">
          <StepHeader step={5} title="Примечание" description="подпись — на распечатанном PDF" />
          <div className="grid gap-x-3 gap-y-2 sm:grid-cols-[1fr_180px]">
            <FormField label="Примечание">
              <textarea
                className={textareaClass}
                value={value.notes ?? ""}
                onChange={(event) => patch({ notes: event.target.value })}
                placeholder="Необязательно"
              />
            </FormField>
            <div data-field="filled_date">
              <FormField label="Дата составления" required error={errors.filled_date}>
                <Input
                  type="date"
                  value={value.filled_date ?? ""}
                  onChange={(event) => patch({ filled_date: event.target.value || null })}
                />
              </FormField>
            </div>
          </div>
        </section>
      </div>

      <div className="sticky bottom-[calc(var(--mobile-nav-height)+var(--safe-area-bottom)+0.5rem)] z-20 mt-2 rounded-lg border border-border bg-surface/95 px-3 py-2 shadow-hover backdrop-blur lg:bottom-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Сохранение..." : submitLabel}
          </Button>
          {extraActions}
          {remaining > 0 ? (
            <p className="text-[11px] text-muted">Осталось: {remaining}</p>
          ) : (
            <p className="text-[11px] text-status-success-text">Можно сохранять</p>
          )}
        </div>
      </div>
    </form>
  );
}
