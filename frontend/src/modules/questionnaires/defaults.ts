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

function requiredText(value: string | null | undefined, message: string): string | null {
  return value?.trim() ? null : message;
}

function requiredChoice(value: boolean | null | undefined, message = "Выберите ДА или НЕТ"): string | null {
  return value === null || value === undefined ? message : null;
}

export function validateQuestionnaireForm(form: QuestionnaireFormValue): Record<string, string> {
  const errors: Record<string, string> = {};
  const married = hasSpouse(form);
  const spouseProperty = hadRegisteredMarriage(form);
  const anyProperty = hasAnyProperty(form);

  const nameError = validateFullName(form.full_name);
  if (nameError) errors.full_name = nameError;
  const costError = validatePositiveAmount(form.service_cost ?? "", { label: "Стоимость" });
  if (costError) errors.service_cost = costError;
  const phoneError = validatePhone(form.phone);
  if (phoneError) errors.phone = phoneError;
  const regionError = requiredText(form.registration_region, "Укажите регион регистрации");
  if (regionError) errors.registration_region = regionError;

  form.debts.forEach((row, index) => {
    if (!row.creditor.trim()) errors[`debt_${index}_creditor`] = "Укажите кредитора";
    if (!row.debt_amount.trim()) errors[`debt_${index}_debt_amount`] = "Укажите долг";
  });

  const fakeError = requiredChoice(form.fake_income_documents);
  if (fakeError) errors.fake_income_documents = fakeError;
  const banksError = requiredText(form.bank_accounts, "Укажите кредитные организации");
  if (banksError) errors.bank_accounts = banksError;
  const guaranteeError = requiredChoice(form.has_guarantee_or_collateral);
  if (guaranteeError) errors.has_guarantee_or_collateral = guaranteeError;
  const marriedError = requiredChoice(form.is_married);
  if (marriedError) errors.is_married = marriedError;

  if (form.is_married === false) {
    const divorcedError = requiredChoice(form.was_divorced);
    if (divorcedError) errors.was_divorced = divorcedError;
    if (form.was_divorced === true) {
      const detailsError = requiredText(form.divorce_info, "Укажите дату или комментарий");
      if (detailsError) errors.divorce_info = detailsError;
    }
  }

  const dependentsError = requiredText(
    form.dependents,
    "Укажите детей и иждивенцев или «нет»",
  );
  if (dependentsError) errors.dependents = dependentsError;
  const incomeDebtorError = requiredText(form.income_debtor, "Укажите доход должника");
  if (incomeDebtorError) errors.income_debtor = incomeDebtorError;
  if (married) {
    const incomeSpouseError = requiredText(form.income_spouse, "Укажите доход супруга(и) или «нет»");
    if (incomeSpouseError) errors.income_spouse = incomeSpouseError;
  }

  const debtorPropertyChoice = requiredChoice(form.has_property_debtor);
  if (debtorPropertyChoice) errors.has_property_debtor = debtorPropertyChoice;
  if (form.has_property_debtor === true) {
    const detailsError = requiredText(form.property_debtor, "Опишите имущество должника");
    if (detailsError) errors.property_debtor = detailsError;
  }
  if (spouseProperty) {
    const spousePropertyChoice = requiredChoice(form.has_property_spouse);
    if (spousePropertyChoice) errors.has_property_spouse = spousePropertyChoice;
    if (form.has_property_spouse === true) {
      const detailsError = requiredText(
        form.property_spouse,
        form.was_divorced === true
          ? "Опишите имущество бывшего супруга(и)"
          : "Опишите имущество супруга(и)",
      );
      if (detailsError) errors.property_spouse = detailsError;
    }
  }

  if (anyProperty) {
    const encumbranceError = requiredChoice(form.has_property_encumbrance);
    if (encumbranceError) errors.has_property_encumbrance = encumbranceError;
    if (form.has_property_encumbrance === true) {
      const detailsError = requiredText(form.property_encumbrance_details, "Опишите обременение");
      if (detailsError) errors.property_encumbrance_details = detailsError;
    }
  }

  const dealsError = requiredChoice(form.has_recent_property_deals);
  if (dealsError) errors.has_recent_property_deals = dealsError;
  if (form.has_recent_property_deals === true) {
    const detailsError = requiredText(form.recent_property_deals_details, "Опишите сделки");
    if (detailsError) errors.recent_property_deals_details = detailsError;
  }

  const weaponError = requiredChoice(form.has_weapon);
  if (weaponError) errors.has_weapon = weaponError;

  const filledError = validateRequiredDate(form.filled_date ?? "");
  if (filledError) errors.filled_date = filledError;

  return errors;
}
