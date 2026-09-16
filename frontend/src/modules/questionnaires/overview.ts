import { formatMoney } from "@/lib/format";
import type { QuestionnaireFormValue } from "@/modules/questionnaires/defaults";
import { isNegativeAnswer } from "@/modules/questionnaires/defaults";

function displayOrUnset(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text || isNegativeAnswer(text)) return "Не указано";
  return text;
}

function parseAmount(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const num = Number(match[0]);
  return Number.isFinite(num) ? num : null;
}

export function buildLeadOverview(form: QuestionnaireFormValue) {
  const activeDebts = form.debts.filter(
    (row) => row.creditor.trim() || row.debt_amount.trim() || row.monthly_payment.trim(),
  );
  const debtTotal = activeDebts.reduce((sum, row) => sum + (parseAmount(row.debt_amount) ?? 0), 0);
  const incomeAmount = parseAmount(form.income_debtor ?? "");

  const hasProperty =
    form.has_property_debtor === true
      ? "Есть"
      : form.has_property_debtor === false
        ? "Нет"
        : "Не указано";

  const hasWeapon =
    form.has_weapon === true ? "Есть" : form.has_weapon === false ? "Нет" : "Не указано";

  return {
    creditorsCount: activeDebts.length,
    debtTotalLabel: debtTotal > 0 ? formatMoney(debtTotal) : activeDebts.length ? "—" : "Не указано",
    incomeLabel: incomeAmount != null ? formatMoney(incomeAmount) : displayOrUnset(form.income_debtor),
    dependentsLabel: displayOrUnset(form.dependents),
    propertyLabel: hasProperty,
    weaponLabel: hasWeapon,
    regionLabel: displayOrUnset(form.registration_region),
    serviceCostLabel: form.service_cost?.trim()
      ? formatMoney(form.service_cost)
      : "Не указано",
    bankAccountsLabel: displayOrUnset(form.bank_accounts),
  };
}
