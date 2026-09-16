import type { Questionnaire, QuestionnaireDebt } from "@/lib/types";
import { PHONE_PREFIX } from "@/lib/phone";
import { todayIsoDate } from "@/lib/format";
import {
  validateFullName,
  validatePhone,
  validatePositiveAmount,
  validateRequiredDate,
} from "@/lib/validation";

export const ABSENT_LABEL = "Отсутствует";
export const DEFAULT_REGION = "Чеченская Республика";

/** Поля воронки (статус, звонки, закрепление) живут в LeadPanel, а не в анкете. */
type LeadFieldKey =
  | "lead_status"
  | "unqualified_reason"
  | "next_call_at"
  | "last_call_at"
  | "call_attempts"
  | "assigned_manager_id"
  | "assigned_manager_name"
  | "calls";

export type QuestionnaireFormValue = Omit<
  Questionnaire,
  | "id"
  | "organization_id"
  | "created_by_id"
  | "created_by_name"
  | "created_at"
  | "updated_at"
  | "assets"
  | "documents"
  | LeadFieldKey
> & {
  property_debtor: string;
  property_spouse: string;
  weapon_details: string;
  has_property_debtor: boolean | null;
  has_property_spouse: boolean | null;
  was_divorced: boolean | null;
};

const NEGATIVE_ANSWERS = new Set([
  "нет",
  "отсутствует",
  "не состоял",
  "не состояла",
  "не был",
  "не была",
]);

function emptyDebt(): QuestionnaireDebt {
  return {
    creditor: "",
    origin_date: null,
    monthly_payment: "",
    overdue_start_date: null,
    debt_amount: "",
  };
}

function isDebtEmpty(row: QuestionnaireDebt): boolean {
  return (
    !row.creditor.trim() &&
    !row.origin_date &&
    !row.monthly_payment.trim() &&
    !row.overdue_start_date &&
    !row.debt_amount.trim()
  );
}

export function isNegativeAnswer(value: string | null | undefined): boolean {
  return NEGATIVE_ANSWERS.has((value ?? "").trim().toLowerCase());
}

export function choiceFromStoredText(value: string | null | undefined): boolean | null {
  if (value == null || !value.trim()) return null;
  if (isNegativeAnswer(value)) return false;
  return true;
}

export function hasSpouse(form: Pick<QuestionnaireFormValue, "is_married">): boolean {
  return form.is_married === true;
}

export function hadRegisteredMarriage(
  form: Pick<QuestionnaireFormValue, "is_married" | "was_divorced">,
): boolean {
  return form.is_married === true || form.was_divorced === true;
}

export function hasAnyProperty(form: Pick<
  QuestionnaireFormValue,
  "is_married" | "was_divorced" | "has_property_debtor" | "has_property_spouse"
>): boolean {
  return (
    form.has_property_debtor === true ||
    (hadRegisteredMarriage(form) && form.has_property_spouse === true)
  );
}

export function emptyQuestionnaireForm(
  partial?: Partial<QuestionnaireFormValue>,
): QuestionnaireFormValue {
  return {
    client_id: null,
    full_name: "",
    phone: PHONE_PREFIX,
    registration_region: DEFAULT_REGION,
    service_cost: "",
    filled_date: todayIsoDate(),
    fake_income_documents: null,
    bank_accounts: "",
    has_guarantee_or_collateral: null,
    is_married: null,
    divorce_info: "",
    dependents: "",
    income_debtor: "",
    income_spouse: "",
    income_destination: "",
    has_property_encumbrance: null,
    property_encumbrance_details: "",
    has_recent_property_deals: null,
    recent_property_deals_details: "",
    property_debtor: "",
    property_spouse: "",
    has_weapon: null,
    weapon_details: "",
    debts: [emptyDebt()],
    has_property_debtor: null,
    has_property_spouse: null,
    was_divorced: null,
    notes: "",
    appointment_at: null,
    appointment_note: "",
    ...partial,
  };
}

export function questionnaireToForm(item: Questionnaire): QuestionnaireFormValue {
  const debts = item.debts.filter((row) => !isDebtEmpty(row));
  const married = item.is_married === true;
  const wasDivorced = married ? null : choiceFromStoredText(item.divorce_info);
  const keepSpouseProperty = married || wasDivorced === true;
  return {
    client_id: item.client_id,
    full_name: item.full_name,
    phone: item.phone || PHONE_PREFIX,
    registration_region: item.registration_region ?? "",
    service_cost: item.service_cost ?? "",
    filled_date: item.filled_date,
    fake_income_documents: item.fake_income_documents,
    bank_accounts: item.bank_accounts ?? "",
    has_guarantee_or_collateral: item.has_guarantee_or_collateral,
    is_married: item.is_married,
    divorce_info: married ? "" : item.divorce_info ?? "",
    dependents: item.dependents ?? "",
    income_debtor: item.income_debtor ?? "",
    income_spouse: married ? item.income_spouse ?? "" : "",
    income_destination: item.income_destination ?? "",
    has_property_encumbrance: item.has_property_encumbrance,
    property_encumbrance_details: item.property_encumbrance_details ?? "",
    has_recent_property_deals: item.has_recent_property_deals,
    recent_property_deals_details: item.recent_property_deals_details ?? "",
    property_debtor: isNegativeAnswer(item.property_debtor) ? "" : item.property_debtor ?? "",
    property_spouse: keepSpouseProperty
      ? isNegativeAnswer(item.property_spouse)
        ? ""
        : item.property_spouse ?? ""
      : "",
    has_weapon: item.has_weapon ?? null,
    weapon_details: item.weapon_details ?? "",
    notes: item.notes ?? "",
    appointment_at: item.appointment_at,
    appointment_note: item.appointment_note ?? "",
    debts: debts.length > 0 ? debts : [emptyDebt()],
    has_property_debtor: choiceFromStoredText(item.property_debtor),
    has_property_spouse: keepSpouseProperty ? choiceFromStoredText(item.property_spouse) : null,
    was_divorced: wasDivorced,
  };
}

function trimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function formToPayload(form: QuestionnaireFormValue): Record<string, unknown> {
  const phone = form.phone.trim() === PHONE_PREFIX ? "" : form.phone.trim();
  const married = hasSpouse(form);
  const spouseProperty = hadRegisteredMarriage(form);
  const anyProperty = hasAnyProperty(form);
  return {
    client_id: form.client_id,
    full_name: form.full_name.trim(),
    phone,
    registration_region: trimmedOrNull(form.registration_region),
    service_cost: trimmedOrNull(form.service_cost),
    filled_date: form.filled_date || null,
    fake_income_documents: form.fake_income_documents,
    bank_accounts: trimmedOrNull(form.bank_accounts),
    has_guarantee_or_collateral: form.has_guarantee_or_collateral,
    is_married: form.is_married,
    divorce_info: married
      ? null
      : form.was_divorced === false
        ? "Нет"
        : trimmedOrNull(form.divorce_info),
    dependents: trimmedOrNull(form.dependents),
    income_debtor: trimmedOrNull(form.income_debtor),
    income_spouse: married ? trimmedOrNull(form.income_spouse) : null,
    income_destination: trimmedOrNull(form.income_destination),
    has_property_encumbrance: anyProperty ? form.has_property_encumbrance : false,
    property_encumbrance_details:
      anyProperty && form.has_property_encumbrance
        ? trimmedOrNull(form.property_encumbrance_details)
        : null,
    has_recent_property_deals: form.has_recent_property_deals,
    recent_property_deals_details: form.has_recent_property_deals
      ? trimmedOrNull(form.recent_property_deals_details)
      : null,
    property_debtor:
      form.has_property_debtor === false ? ABSENT_LABEL : trimmedOrNull(form.property_debtor),
    property_spouse: spouseProperty
      ? form.has_property_spouse === false
        ? ABSENT_LABEL
        : trimmedOrNull(form.property_spouse)
      : null,
    has_weapon: form.has_weapon,
    weapon_details: form.has_weapon ? trimmedOrNull(form.weapon_details) : null,
    notes: trimmedOrNull(form.notes),
    appointment_at: form.appointment_at || null,
    appointment_note: trimmedOrNull(form.appointment_note),
    debts: form.debts.map((row) => ({
      creditor: row.creditor,
      origin_date: row.origin_date || null,
      monthly_payment: row.monthly_payment,
      overdue_start_date: row.overdue_start_date || null,
      debt_amount: row.debt_amount,
    })),
  };
}

export function addDebtRow(debts: QuestionnaireDebt[]): QuestionnaireDebt[] {
  return [...debts, emptyDebt()];
}

export function removeDebtRow(debts: QuestionnaireDebt[], index: number): QuestionnaireDebt[] {
  if (debts.length <= 1) return debts;
  return debts.filter((_, itemIndex) => itemIndex !== index);
}

/**
 * Лид заводят прямо во время звонка, поэтому сохранить анкету можно в любой момент.
 * Блокирует сохранение только телефон — без него лид некому перезвонить. Остальное
 * проверяется по формату и лишь тогда, когда поле реально заполнили.
 */
export function validateQuestionnaireForm(form: QuestionnaireFormValue): Record<string, string> {
  const errors: Record<string, string> = {};

  const phoneError = validatePhone(form.phone);
  if (phoneError) errors.phone = phoneError;

  if (form.full_name.trim()) {
    const nameError = validateFullName(form.full_name);
    if (nameError) errors.full_name = nameError;
  }

  const cost = (form.service_cost ?? "").trim();
  if (cost) {
    const costError = validatePositiveAmount(cost, { label: "Стоимость" });
    if (costError) errors.service_cost = costError;
  }

  return errors;
}

type CompletenessField = { key: string; done: boolean };

/**
 * Полнота анкеты для перевода в клиента: менеджер видит, что ещё не выяснено,
 * но это подсказка, а не запрет на сохранение.
 */
export function questionnaireCompleteness(form: QuestionnaireFormValue): {
  filled: number;
  total: number;
  missing: string[];
} {
  const married = hasSpouse(form);
  const spouseProperty = hadRegisteredMarriage(form);
  const anyProperty = hasAnyProperty(form);
  const filledText = (value: string | null | undefined) => Boolean(value?.trim());
  const answered = (value: boolean | null | undefined) => value === true || value === false;

  const fields: CompletenessField[] = [
    { key: "full_name", done: !validateFullName(form.full_name) },
    { key: "phone", done: !validatePhone(form.phone) },
    { key: "service_cost", done: filledText(form.service_cost) },
    { key: "registration_region", done: filledText(form.registration_region) },
    {
      key: "debts",
      done: form.debts.some((row) => row.creditor.trim() && row.debt_amount.trim()),
    },
    { key: "fake_income_documents", done: answered(form.fake_income_documents) },
    { key: "bank_accounts", done: filledText(form.bank_accounts) },
    { key: "has_guarantee_or_collateral", done: answered(form.has_guarantee_or_collateral) },
    { key: "is_married", done: answered(form.is_married) },
    { key: "dependents", done: filledText(form.dependents) },
    { key: "income_debtor", done: filledText(form.income_debtor) },
    { key: "has_property_debtor", done: answered(form.has_property_debtor) },
    { key: "has_recent_property_deals", done: answered(form.has_recent_property_deals) },
    { key: "has_weapon", done: answered(form.has_weapon) },
    { key: "filled_date", done: !validateRequiredDate(form.filled_date ?? "") },
  ];

  if (form.is_married === false) {
    fields.push({ key: "was_divorced", done: answered(form.was_divorced) });
    if (form.was_divorced === true) {
      fields.push({ key: "divorce_info", done: filledText(form.divorce_info) });
    }
  }
  if (married) {
    fields.push({ key: "income_spouse", done: filledText(form.income_spouse) });
  }
  if (form.has_property_debtor === true) {
    fields.push({ key: "property_debtor", done: filledText(form.property_debtor) });
  }
  if (spouseProperty) {
    fields.push({ key: "has_property_spouse", done: answered(form.has_property_spouse) });
    if (form.has_property_spouse === true) {
      fields.push({ key: "property_spouse", done: filledText(form.property_spouse) });
    }
  }
  if (anyProperty) {
    fields.push({ key: "has_property_encumbrance", done: answered(form.has_property_encumbrance) });
    if (form.has_property_encumbrance === true) {
      fields.push({
        key: "property_encumbrance_details",
        done: filledText(form.property_encumbrance_details),
      });
    }
  }
  if (form.has_recent_property_deals === true) {
    fields.push({
      key: "recent_property_deals_details",
      done: filledText(form.recent_property_deals_details),
    });
  }

  return {
    filled: fields.filter((field) => field.done).length,
    total: fields.length,
    missing: fields.filter((field) => !field.done).map((field) => field.key),
  };
}
