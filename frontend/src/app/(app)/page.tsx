"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import {
  AmountInput,
  Badge,
  Button,
  Input,
  LoadingState,
  Metric,
  MetricStrip,
  PageHeader,
  Panel,
  SectionNav,
} from "@/components/ui";
import { ApiRequestError, dashboardApi, exportsApi } from "@/lib/api-client";
import {
  formatAmountInput,
  formatDate,
  formatMoney,
  formatMonthLabel,
  formatShortName,
  statusLabel,
} from "@/lib/format";
import type {
  DashboardOverdueClientItem,
  DashboardSummary,
  DocumentCollectionBreakdown,
  MandatoryPaymentBreakdown,
} from "@/lib/types";
import { clientListPath } from "@/lib/client-list-filters";
import { canManageClients, canUseQuestionnaires } from "@/lib/organization-features";
import { useAuth } from "@/modules/auth/AuthProvider";

const DASHBOARD_SECTIONS = [
  { id: "dash-flow", label: "Движение за месяц" },
  { id: "dash-cash", label: "Касса" },
  { id: "dash-portfolio", label: "Портфель" },
  { id: "dash-month", label: "Итоги месяца" },
  { id: "dash-activity", label: "Активность" },
  { id: "dash-civil", label: "Гражданка" },
  { id: "dash-collection", label: "Сбор документов" },
  { id: "dash-mandatory", label: "Обязательные" },
  { id: "dash-expenses", label: "Расходы" },
  { id: "dash-overdue", label: "Просрочка" },
] as const;

// Разделы, скрытые за кнопкой «Подробнее»: нужны реже, чем остальные.
const DETAIL_SECTION_IDS: string[] = [
  "dash-activity",
  "dash-civil",
  "dash-collection",
  "dash-mandatory",
  "dash-expenses",
];

const PANEL_LINK = "interactive text-[13px] font-semibold text-brand-700 hover:text-brand-600";

function emptyCollection(): DocumentCollectionBreakdown {
  return {
    collection_cash: "0",
    notary_fee: "0",
    manager_commission: "0",
    paid_count: 0,
  };
}

function normalizeSummary(data: DashboardSummary): DashboardSummary {
  return {
    ...data,
    document_collection_total: data.document_collection_total ?? emptyCollection(),
    document_collection_this_month: data.document_collection_this_month ?? emptyCollection(),
    contracts_signed_this_month: data.contracts_signed_this_month ?? 0,
    civil_cases_total: data.civil_cases_total ?? 0,
    civil_cases_this_month: data.civil_cases_this_month ?? 0,
    civil_income_total: data.civil_income_total ?? "0",
    civil_income_this_month: data.civil_income_this_month ?? "0",
    cash_opening_balance: data.cash_opening_balance ?? "0",
    cash_opening_is_set: data.cash_opening_is_set ?? false,
    cash_in_this_month: data.cash_in_this_month ?? "0",
    expenses_paid_this_month: data.expenses_paid_this_month ?? "0",
    expenses_remaining_this_month: data.expenses_remaining_this_month ?? "0",
    cash_on_hand: data.cash_on_hand ?? "0",
    cash_forecast_end: data.cash_forecast_end ?? "0",
    open_tasks_count: data.open_tasks_count ?? 0,
    overdue_clients_preview: data.overdue_clients_preview ?? [],
    month_net_flow: data.month_net_flow ?? "0",
    month_net_forecast: data.month_net_forecast ?? "0",
    mandatory_pending: data.mandatory_pending ?? {
      deposit: "0",
      financial_management: "0",
      court_fee: "0",
      total: "0",
    },
    deposit_missing_count: data.deposit_missing_count ?? 0,
    deposit_missing_preview: data.deposit_missing_preview ?? [],
  };
}

function HeroStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "in" | "out";
}) {
  const colors = { default: "text-white", in: "text-white", out: "text-brand-100" };
  return (
    <div className="cash-hero-stat">
      <p className="text-[11px] font-medium text-white/65">{label}</p>
      <p className={`tabular mt-1 truncate text-[15px] font-semibold ${colors[tone]}`}>{value}</p>
    </div>
  );
}

function LedgerRow({
  label,
  value,
  sign,
  hint,
}: {
  label: string;
  value: string;
  sign: "+" | "−";
  hint?: string;
}) {
  return (
    <div className="ledger-row">
      <div className="min-w-0">
        <p className="text-foreground">{label}</p>
        {hint ? <p className="type-hint">{hint}</p> : null}
      </div>
      <p
        className={`tabular shrink-0 font-semibold ${
          sign === "+" ? "text-status-success-text" : "text-status-warning-text"
        }`}
      >
        {sign} {value}
      </p>
    </div>
  );
}

function MandatoryPaymentsTable({
  month,
  monthLabel,
  total,
}: {
  month: MandatoryPaymentBreakdown;
  monthLabel: string;
  total: MandatoryPaymentBreakdown;
}) {
  const rows = [
    { label: monthLabel, data: month },
    { label: "За всё время", data: total },
  ];
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="data-table table-cards w-full lg:min-w-[520px]">
        <thead>
          <tr>
            <th>Период</th>
            <th className="text-right">Депозит</th>
            <th className="text-right">Фин. управление</th>
            <th className="text-right">Госпошлина</th>
            <th className="text-right">Итого</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td data-label="Период" className="font-medium text-foreground first-letter:uppercase">
                {row.label}
              </td>
              <td data-label="Депозит" className="tabular text-right">
                {formatMoney(row.data.deposit)}
              </td>
              <td data-label="Фин. управление" className="tabular text-right">
                {formatMoney(row.data.financial_management)}
              </td>
              <td data-label="Госпошлина" className="tabular text-right">
                {formatMoney(row.data.court_fee)}
              </td>
              <td data-label="Итого" className="tabular text-right font-semibold text-foreground">
                {formatMoney(row.data.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const next = monthNumber === 12 ? 1 : monthNumber + 1;
  return `${nextYear}-${String(next).padStart(2, "0")}`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentMonth);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportingOverdue, setExportingOverdue] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [cashDraft, setCashDraft] = useState("");
  const [cashActualDraft, setCashActualDraft] = useState("");
  const [cashSaving, setCashSaving] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);
  const isOwner = user?.role === "owner";
  const canEditClients = canManageClients(user);
  const showQuestionnaires = canUseQuestionnaires(user);
  const showOrgFinance = isOwner;
  const monthLabel = formatMonthLabel(month);
  const isCurrentMonth = month === currentMonth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = normalizeSummary(await dashboardApi.summary(month));
      setSummary(data);
      setCashDraft(data.cash_opening_is_set ? formatAmountInput(data.cash_opening_balance) : "");
      setCashActualDraft(formatAmountInput(data.cash_on_hand));
    } finally {
      setLoading(false);
    }
  }, [month]);

  async function handleSaveCashBalance() {
    setCashSaving(true);
    setCashError(null);
    try {
      await dashboardApi.setCashBalance({
        month,
        opening_amount: cashDraft.trim() === "" ? "0" : cashDraft.trim(),
      });
      await load();
    } catch (error) {
      setCashError(
        error instanceof ApiRequestError ? error.message : "Не удалось сохранить остаток",
      );
    } finally {
      setCashSaving(false);
    }
  }

  async function handleActualizeCashOnHand() {
    setCashSaving(true);
    setCashError(null);
    try {
      const amount = cashActualDraft.trim() === "" ? "0" : cashActualDraft.trim();
      await dashboardApi.setCashBalanceActual({
        month,
        actual_amount: amount,
      });
      await load();
    } catch (error) {
      setCashError(
        error instanceof ApiRequestError
          ? error.message
          : "Не удалось актуализировать кассу",
      );
    } finally {
      setCashSaving(false);
    }
  }

  async function handleCarryForwardCash() {
    setCashSaving(true);
    setCashError(null);
    try {
      await dashboardApi.carryForwardCashBalance(month);
      setMonth(nextMonth(month));
    } catch (error) {
      setCashError(
        error instanceof ApiRequestError ? error.message : "Не удалось перенести остаток",
      );
    } finally {
      setCashSaving(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  const overdueClients = summary?.overdue_clients_preview ?? [];
  const openTasksCount = summary?.open_tasks_count ?? 0;
  const cashOutThisMonth =
    Number(summary?.mandatory_paid_this_month?.total ?? 0) +
    Number(summary?.expenses_paid_this_month ?? 0);

  function goToSection(id: string) {
    if (DETAIL_SECTION_IDS.includes(id)) {
      setShowDetails(true);
    }
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (loading) return <LoadingState text="Загрузка дашборда..." />;
  if (!summary) return <LoadingState text="Не удалось загрузить дашборд" />;

  const profitPositive = Number(summary.net_profit_this_month) >= 0;
  const cashPositive = Number(summary.cash_on_hand) >= 0;

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <PageHeader
          title="Дашборд"
          subtitle={`Добро пожаловать, ${user?.full_name}`}
          action={
            canEditClients ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <Input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value || currentMonth())}
                  className="w-[150px]"
                  aria-label="Отчётный месяц"
                />
                {showQuestionnaires ? (
                  <>
                    <Link href="/questionnaires/new">
                      <Button type="button">Новая анкета</Button>
                    </Link>
                    <Link href="/questionnaires">
                      <Button type="button" variant="secondary">
                        Анкеты
                      </Button>
                    </Link>
                  </>
                ) : null}
                <Link href="/tasks">
                  <Button type="button" variant="secondary">
                    Задачи{openTasksCount > 0 ? ` · ${openTasksCount}` : ""}
                  </Button>
                </Link>
                {isOwner && (
                  <Link href="/analytics">
                    <Button type="button" variant="secondary">
                      Аналитика
                    </Button>
                  </Link>
                )}
              </div>
            ) : undefined
          }
        />

        {!isCurrentMonth && (
          <p className="alert-warning">
            Показаны данные за {monthLabel}. Просрочка и остатки по графикам всегда считаются на
            сегодня.{" "}
            <button
              type="button"
              className="link-brand font-medium"
              onClick={() => setMonth(currentMonth())}
            >
              Вернуться к текущему месяцу
            </button>
          </p>
        )}

        {showOrgFinance ? (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="cash-hero p-5 sm:p-6">
              <div className="relative flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="cash-hero-label">Сейчас в кассе</p>
                  <p
                    className={`cash-hero-value mt-3 ${cashPositive ? "" : "text-brand-100"}`}
                  >
                    {formatMoney(summary.cash_on_hand)}
                  </p>
                </div>
                <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-medium capitalize text-white/70">
                  {monthLabel}
                </span>
              </div>
              <p className="relative mt-3 text-[13px] leading-snug text-white/75">
                {summary.cash_opening_is_set
                  ? "Остаток на начало месяца плюс фактическое движение денег"
                  : "Остаток на начало не указан — задайте его в разделе «Касса»"}
              </p>
              <div className="relative mt-5 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
                <HeroStat label="На начало" value={formatMoney(summary.cash_opening_balance)} />
                <HeroStat
                  label="Поступило"
                  value={`+ ${formatMoney(summary.cash_in_this_month)}`}
                  tone="in"
                />
                <HeroStat
                  label="Выплачено"
                  value={`− ${formatMoney(cashOutThisMonth)}`}
                  tone="out"
                />
                <HeroStat label="Прогноз на конец" value={formatMoney(summary.cash_forecast_end)} />
              </div>
            </div>

            <div className="metric-strip grid-cols-1 sm:grid-cols-3 lg:grid-cols-1">
              <Metric
                label="Чистая прибыль за месяц"
                value={formatMoney(summary.net_profit_this_month)}
                tone={profitPositive ? "success" : "danger"}
                hint="Банкротство: рассрочка и сбор минус обязательные и расходы"
              />
              <Metric
                label="Ещё ожидается"
                value={formatMoney(summary.expected_this_month)}
                tone="brand"
                hint="Платежи клиентов до конца месяца"
              />
              <Metric
                label="Осталось оплатить расходов"
                value={formatMoney(summary.expenses_remaining_this_month)}
                tone="warning"
                hint={`План ${formatMoney(summary.monthly_expenses)} · оплачено ${formatMoney(summary.expenses_paid_this_month)}`}
              />
            </div>
          </div>
        ) : (
          <MetricStrip columns={4}>
            <Metric label="Всего клиентов" value={summary.clients_total} tone="brand" />
            <Metric label="Активных" value={summary.clients_active} tone="success" />
            <Metric label="С просрочкой" value={summary.clients_overdue} tone="danger" />
            <Metric label="Открытых задач" value={openTasksCount} tone="warning" />
          </MetricStrip>
        )}
      </div>

      {showOrgFinance ? <SectionNav items={DASHBOARD_SECTIONS} onSelect={goToSection} /> : null}

      {showQuestionnaires && !canEditClients ? (
        <Panel
          title="Анкеты"
          dot="brand"
          description="Первичный отбор на банкротство. Анкета сохранится, даже если клиент ещё не заведён."
          action={
            <>
              <Link href="/questionnaires" className={PANEL_LINK}>
                Все анкеты
              </Link>
              <Link href="/questionnaires/new">
                <Button type="button">Новая анкета</Button>
              </Link>
            </>
          }
        />
      ) : null}

      {showOrgFinance && (
        <>
          <Panel
            id="dash-flow"
            dot="brand"
            title={`Движение денег за ${monthLabel}`}
            description="Только деньги этого месяца, без остатка с прошлого. Слева — что уже случилось, справа — что ещё предстоит до конца месяца."
          >
            <div className="grid gap-5 lg:grid-cols-2 lg:gap-8">
              <div>
                <p className="type-caption mb-1">Уже произошло</p>
                <LedgerRow
                  sign="+"
                  label="Рассрочка"
                  hint="Платежи клиентов за вычетом возвратов"
                  value={formatMoney(summary.collected_this_month)}
                />
                <LedgerRow
                  sign="+"
                  label="Сбор документов"
                  value={formatMoney(summary.document_collection_this_month.collection_cash)}
                />
                <LedgerRow
                  sign="+"
                  label="Гражданские дела"
                  hint="Фактические оплаты по делам"
                  value={formatMoney(summary.civil_income_this_month)}
                />
                <LedgerRow
                  sign="−"
                  label="Отдано на депозит"
                  value={formatMoney(summary.mandatory_paid_this_month.deposit)}
                />
                <LedgerRow
                  sign="−"
                  label="Отдано на фин. управление"
                  value={formatMoney(summary.mandatory_paid_this_month.financial_management)}
                />
                {Number(summary.mandatory_paid_this_month.court_fee) > 0 ? (
                  <LedgerRow
                    sign="−"
                    label="Госпошлина"
                    value={formatMoney(summary.mandatory_paid_this_month.court_fee)}
                  />
                ) : null}
                <LedgerRow
                  sign="−"
                  label="Оплаченные расходы"
                  hint="Зарплаты, аренда и разовые траты"
                  value={formatMoney(summary.expenses_paid_this_month)}
                />
                <div className="ledger-total">
                  <span>Чистыми за месяц</span>
                  <span
                    className={`tabular text-lg ${
                      Number(summary.month_net_flow) >= 0
                        ? "text-status-success-text"
                        : "text-status-danger-text"
                    }`}
                  >
                    {formatMoney(summary.month_net_flow)}
                  </span>
                </div>
              </div>

              <div>
                <p className="type-caption mb-1">Ещё предстоит</p>
                <LedgerRow
                  sign="+"
                  label="Ожидается по графикам"
                  hint="Неоплаченные платежи клиентов этого месяца"
                  value={formatMoney(summary.expected_this_month)}
                />
                <LedgerRow
                  sign="−"
                  label="Депозит к отдаче"
                  hint="Вписано на карточках, ещё не отдано"
                  value={formatMoney(summary.mandatory_pending?.deposit ?? "0")}
                />
                <LedgerRow
                  sign="−"
                  label="Фин. управление к отдаче"
                  hint="21 000 / 11 000 ₽ — по признанным банкротами"
                  value={formatMoney(summary.mandatory_pending?.financial_management ?? "0")}
                />
                {Number(summary.mandatory_pending?.court_fee ?? 0) > 0 ? (
                  <LedgerRow
                    sign="−"
                    label="Госпошлина к отдаче"
                    value={formatMoney(summary.mandatory_pending?.court_fee ?? "0")}
                  />
                ) : null}
                <LedgerRow
                  sign="−"
                  label="Неоплаченные расходы"
                  hint={`План ${formatMoney(summary.fixed_monthly_expenses)}`}
                  value={formatMoney(summary.expenses_remaining_this_month)}
                />
                <div className="ledger-total">
                  <span>Останется чистыми к концу месяца</span>
                  <span
                    className={`tabular text-lg ${
                      Number(summary.month_net_forecast) >= 0
                        ? "text-status-success-text"
                        : "text-status-danger-text"
                    }`}
                  >
                    {formatMoney(summary.month_net_forecast)}
                  </span>
                </div>
                <p className="type-hint mt-1.5">
                  «Чистыми за месяц» плюс ожидаемые платежи, минус всё, что ещё нужно отдать.
                </p>
              </div>
            </div>

            {summary.deposit_missing_count > 0 ? (
              <div className="alert-warning space-y-1.5">
                <p className="font-semibold">
                  Депозит не вписан у {summary.deposit_missing_count}{" "}
                  {summary.deposit_missing_count === 1 ? "клиента" : "клиентов"}, которые уже
                  платят
                </p>
                <p>
                  Пока сумма не вписана, депозит не попадает в «к отдаче», и остаток выглядит
                  больше реального. Откройте карточку и укажите 25 000 или 35 000 ₽:
                </p>
                <p className="flex flex-wrap gap-x-3 gap-y-1">
                  {summary.deposit_missing_preview.map((client) => (
                    <Link
                      key={client.id}
                      href={`/clients/${client.id}`}
                      className="font-semibold underline underline-offset-2"
                    >
                      {formatShortName(client.full_name)}
                    </Link>
                  ))}
                  {summary.deposit_missing_count > summary.deposit_missing_preview.length
                    ? `и ещё ${summary.deposit_missing_count - summary.deposit_missing_preview.length}`
                    : null}
                </p>
              </div>
            ) : null}
          </Panel>

          <Panel
            id="dash-cash"
            dot="success"
            title="Касса"
            description="Остаток на начало задаётся вручную, дальше касса живёт по факту: плюс поступления, минус реально сделанные выплаты."
            footer={
              <div className="space-y-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[180px] flex-1 sm:max-w-[240px]">
                    <label className="mb-1 block text-xs font-semibold text-muted">
                      Фактически в кассе после пересчёта, ₽
                    </label>
                    <AmountInput
                      value={cashActualDraft}
                      onValueChange={setCashActualDraft}
                      placeholder="0"
                    />
                  </div>
                  <Button type="button" disabled={cashSaving} onClick={handleActualizeCashOnHand}>
                    {cashSaving ? "Сохранение..." : "Актуализировать"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={cashSaving}
                    onClick={handleCarryForwardCash}
                  >
                    Перенести {formatMoney(summary.cash_on_hand)} на{" "}
                    {formatMonthLabel(nextMonth(month))}
                  </Button>
                </div>
                <p className="type-hint">
                  Остаток на начало подстроится сам, чтобы «сейчас в кассе» совпало с фактом.
                </p>
                <details className="group">
                  <summary className="interactive inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
                    <span className="transition-transform group-open:rotate-90" aria-hidden>
                      ›
                    </span>
                    Задать остаток на начало {monthLabel} вручную
                  </summary>
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <div className="min-w-[180px] flex-1 sm:max-w-[240px]">
                      <label className="mb-1 block text-xs text-muted">Остаток на начало, ₽</label>
                      <AmountInput
                        value={cashDraft}
                        onValueChange={setCashDraft}
                        placeholder="0"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={cashSaving}
                      onClick={handleSaveCashBalance}
                    >
                      {cashSaving ? "Сохранение..." : "Сохранить остаток"}
                    </Button>
                  </div>
                </details>
                {cashError ? <p className="alert-danger">{cashError}</p> : null}
                {summary.cash_opening_comment ? (
                  <p className="type-hint">Последняя правка: {summary.cash_opening_comment}</p>
                ) : null}
              </div>
            }
          >
            <MetricStrip columns={4}>
              <Metric
                label="Остаток на начало"
                value={formatMoney(summary.cash_opening_balance)}
                tone={summary.cash_opening_is_set ? "default" : "muted"}
                hint={summary.cash_opening_is_set ? "Указан вручную" : "Не указан"}
              />
              <Metric
                label={`Поступило за ${monthLabel}`}
                value={formatMoney(summary.cash_in_this_month)}
                tone="success"
                hint="Рассрочка, сбор документов, гражданка"
              />
              <Metric
                label={`Выплачено за ${monthLabel}`}
                value={formatMoney(cashOutThisMonth)}
                tone="warning"
                hint="Обязательные платежи и оплаченные расходы"
              />
              <Metric
                label="Сейчас в кассе"
                value={formatMoney(summary.cash_on_hand)}
                tone={cashPositive ? "success" : "danger"}
              />
            </MetricStrip>
          </Panel>

          <div className="grid gap-5 xl:grid-cols-2">
            <Panel
              id="dash-portfolio"
              title="Портфель"
              description="Что клиенты ещё должны по графикам. Не зависит от выбранного месяца."
              action={
                <Link href="/clients/contracts" className={PANEL_LINK}>
                  Договоры
                </Link>
              }
            >
              <MetricStrip columns={2}>
                <Metric
                  label="Остаток по графикам"
                  value={formatMoney(summary.total_remainder)}
                  tone="brand"
                  hint="Сколько ещё предстоит получить"
                />
                <Metric
                  label="Из них просрочено"
                  value={formatMoney(summary.overdue_amount)}
                  tone="danger"
                  hint={`${summary.clients_overdue} клиентов`}
                />
                <Metric
                  label="Активные договоры"
                  value={formatMoney(summary.active_contract_total)}
                  hint={`${summary.clients_active} активных клиентов`}
                />
                <Metric
                  label="Получено за всё время"
                  value={formatMoney(summary.total_collected)}
                  tone="success"
                />
              </MetricStrip>
            </Panel>

            <Panel
              id="dash-month"
              dot="success"
              title={`Итоги за ${monthLabel}`}
              description="Прибыль по банкротству. Гражданка идёт в кассу, но в эту прибыль не входит."
            >
              <div>
                <LedgerRow
                  sign="+"
                  label="Рассрочка"
                  value={formatMoney(summary.collected_this_month)}
                />
                <LedgerRow
                  sign="+"
                  label="Касса сбора документов"
                  value={formatMoney(summary.document_collection_this_month.collection_cash)}
                />
                <LedgerRow
                  sign="−"
                  label="Обязательные платежи"
                  hint="Депозит, фин. управление, госпошлина"
                  value={formatMoney(summary.mandatory_paid_this_month.total)}
                />
                <LedgerRow
                  sign="−"
                  label="Расходы по плану"
                  hint={`Оплачено ${formatMoney(summary.expenses_paid_this_month)}`}
                  value={formatMoney(summary.monthly_expenses)}
                />
                <div className="ledger-total">
                  <span>Чистая прибыль</span>
                  <span
                    className={`tabular text-lg ${
                      profitPositive ? "text-status-success-text" : "text-status-danger-text"
                    }`}
                  >
                    {formatMoney(summary.net_profit_this_month)}
                  </span>
                </div>
              </div>
              <p className="type-hint">
                Прибыль считает расходы по плану, касса — по факту оплаты, поэтому касса выше
                прибыли на неоплаченные {formatMoney(summary.expenses_remaining_this_month)}.
              </p>
            </Panel>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-foreground">
                  Детализация
                </h2>
                <p className="type-hint">
                  Активность, гражданка, сбор документов, обязательные платежи и расходы
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                aria-expanded={showDetails}
                onClick={() => setShowDetails((value) => !value)}
              >
                {showDetails ? "Свернуть" : "Показать"}
              </Button>
            </div>

            {showDetails ? (
              <div className="grid gap-5 xl:grid-cols-2">
                <Panel
                  id="dash-activity"
                  dot="warning"
                  title={`Активность за ${monthLabel}`}
                  description="Кто пришёл, оплатил сбор документов и заключил договор."
                  action={
                    <>
                      <Link href="/clients/collection" className={PANEL_LINK}>
                        Сбор
                      </Link>
                      <Link href="/clients/contracts" className={PANEL_LINK}>
                        Договоры
                      </Link>
                    </>
                  }
                >
                  <MetricStrip columns={2}>
                    <Metric
                      label="Новых клиентов"
                      value={summary.clients_new_this_month}
                      tone="brand"
                      hint="По дате договора"
                    />
                    <Link
                      href={clientListPath("collection", {
                        collection_view: "all",
                        collection_paid_month: month,
                      })}
                      className="group block bg-surface"
                    >
                      <Metric
                        className="h-full group-hover:bg-surface-muted"
                        label="Оплатили сбор"
                        value={summary.document_collection_this_month.paid_count}
                        hint="Открыть список поимённо →"
                      />
                    </Link>
                    <Metric
                      label="Заключили договор"
                      value={summary.contracts_signed_this_month}
                      tone="success"
                      hint="Переведены на банкротство"
                    />
                    <Metric
                      label="Сейчас на сборе"
                      value={summary.collection_in_progress}
                      tone="warning"
                      hint="На сегодня, не зависит от месяца"
                    />
                  </MetricStrip>
                </Panel>

                <Panel
                  id="dash-civil"
                  dot="success"
                  title="Гражданские дела"
                  description="Доход — фактические оплаты по дате оплаты. Число дел — по дате обращения."
                  action={
                    <Link href="/civil-cases" className={PANEL_LINK}>
                      Все дела
                    </Link>
                  }
                >
                  <MetricStrip columns={2}>
                    <Metric
                      label={`Доход за ${monthLabel}`}
                      value={formatMoney(summary.civil_income_this_month)}
                      tone="success"
                    />
                    <Metric
                      label={`Дел за ${monthLabel}`}
                      value={summary.civil_cases_this_month}
                      tone="brand"
                    />
                    <Metric label="Доход всего" value={formatMoney(summary.civil_income_total)} />
                    <Metric label="Всего дел" value={summary.civil_cases_total} />
                  </MetricStrip>
                </Panel>

                <Panel
                  id="dash-collection"
                  dot="brand"
                  title="Сбор документов"
                  description="10 000 ₽ в кассу · 2 000 ₽ нотариусу · 1 000 ₽ менеджеру. Выписки и госпошлина — отдельно."
                >
                  <MetricStrip columns={2}>
                    <Metric
                      label={`Касса за ${monthLabel}`}
                      value={formatMoney(summary.document_collection_this_month.collection_cash)}
                      tone="success"
                      hint={`${summary.document_collection_this_month.paid_count} оплат`}
                    />
                    <Metric
                      label="Касса всего"
                      value={formatMoney(summary.document_collection_total.collection_cash)}
                      hint={`${summary.document_collection_total.paid_count} оплат`}
                    />
                    <Metric
                      label="Нотариусу всего"
                      value={formatMoney(summary.document_collection_total.notary_fee)}
                    />
                    <Metric
                      label="Менеджерам всего"
                      value={formatMoney(summary.document_collection_total.manager_commission)}
                    />
                  </MetricStrip>
                </Panel>

                <Panel
                  id="dash-expenses"
                  dot="danger"
                  title="Расходы организации"
                  description="Плановые статьи и разовые траты за выбранный месяц."
                  action={
                    <Link href="/expenses" className={PANEL_LINK}>
                      Управление
                    </Link>
                  }
                >
                  <MetricStrip columns={2}>
                    <Metric
                      label="Всего за месяц"
                      value={formatMoney(summary.monthly_expenses)}
                      tone="warning"
                      hint="План и разовые"
                      className="col-span-2"
                    />
                    <Metric
                      label="Плановые статьи"
                      value={formatMoney(summary.fixed_monthly_expenses)}
                      hint="Ежемесячный бюджет"
                    />
                    <Metric
                      label={`Разовые за ${monthLabel}`}
                      value={formatMoney(summary.one_time_expenses_this_month)}
                      tone="danger"
                    />
                  </MetricStrip>
                </Panel>

                <Panel
                  id="dash-mandatory"
                  dot="warning"
                  title="Обязательные платежи"
                  description="Депозит, финансовое управление и госпошлина по каждой статье."
                  className="xl:col-span-2"
                  action={
                    <Link href="/expenses#deposit-fin" className={PANEL_LINK}>
                      По месяцам
                    </Link>
                  }
                >
                  <MandatoryPaymentsTable
                    month={summary.mandatory_paid_this_month}
                    monthLabel={monthLabel}
                    total={summary.mandatory_paid_total}
                  />
                </Panel>
              </div>
            ) : null}
          </div>
        </>
      )}

      {canEditClients && (
        <Panel
          id="dash-overdue"
          dot="danger"
          title={
            <>
              Клиенты с просрочкой
              {overdueClients.length > 0 ? (
                <Badge tone="danger">{summary.clients_overdue}</Badge>
              ) : null}
            </>
          }
          action={
            <>
              <Button
                variant="secondary"
                disabled={exportingOverdue}
                onClick={async () => {
                  setExportingOverdue(true);
                  try {
                    await exportsApi.overdueClients();
                  } finally {
                    setExportingOverdue(false);
                  }
                }}
              >
                {exportingOverdue ? "Выгрузка..." : "Excel"}
              </Button>
              <Link href="/clients/contracts?overdue=true" className={PANEL_LINK}>
                Все клиенты
              </Link>
            </>
          }
        >
          {overdueClients.length === 0 ? (
            <p className="alert-success">Просроченных платежей нет.</p>
          ) : (
            <>
              <div className="desktop-only overflow-x-auto rounded-lg border border-border">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ФИО</th>
                      <th>Телефон</th>
                      <th>Договор</th>
                      <th className="text-right">Сумма</th>
                      <th>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overdueClients.map((client: DashboardOverdueClientItem) => (
                      <tr key={client.id}>
                        <td>
                          <Link href={`/clients/${client.id}`} className="link-brand">
                            {formatShortName(client.full_name)}
                          </Link>
                        </td>
                        <td className="tabular text-muted">{client.phone}</td>
                        <td className="tabular text-muted">{formatDate(client.contract_date)}</td>
                        <td className="tabular text-right font-medium text-foreground">
                          {formatMoney(client.contract_total ?? "0")}
                        </td>
                        <td>
                          <Badge tone="danger">{statusLabel(client.status)}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mobile-only space-y-2">
                {overdueClients.map((client: DashboardOverdueClientItem) => (
                  <Link
                    key={client.id}
                    href={`/clients/${client.id}`}
                    className="row-card row-card-overdue block"
                  >
                    <div className="row-card-head">
                      <span className="text-sm font-semibold text-foreground">
                        {formatShortName(client.full_name)}
                      </span>
                      <Badge tone="danger">{statusLabel(client.status)}</Badge>
                    </div>
                    <div className="row-card-grid">
                      <div>
                        <p className="row-card-label">Телефон</p>
                        <p className="row-card-value">{client.phone}</p>
                      </div>
                      <div>
                        <p className="row-card-label">Договор</p>
                        <p className="row-card-value">{formatDate(client.contract_date)}</p>
                      </div>
                      <div>
                        <p className="row-card-label">Сумма</p>
                        <p className="row-card-value">
                          {formatMoney(client.contract_total ?? "0")}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </Panel>
      )}
    </div>
  );
}
