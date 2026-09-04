"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import {
  Badge,
  Button,
  Card,
  Input,
  LoadingState,
  PageHeader,
  SectionTitle,
  StatCard,
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
import { canUseQuestionnaires } from "@/lib/organization-features";
import { useAuth } from "@/modules/auth/AuthProvider";

const DASHBOARD_SECTIONS = [
  { id: "dash-cash", label: "Касса" },
  { id: "dash-portfolio", label: "Портфель" },
  { id: "dash-month", label: "Месяц" },
  { id: "dash-activity", label: "Активность" },
  { id: "dash-civil", label: "Гражданка" },
  { id: "dash-collection", label: "Сбор" },
  { id: "dash-mandatory", label: "Обязательные" },
  { id: "dash-expenses", label: "Расходы" },
] as const;

// Разделы, скрытые за кнопкой «Подробнее»: нужны реже, чем остальные.
const DETAIL_SECTION_IDS: string[] = [
  "dash-activity",
  "dash-civil",
  "dash-collection",
  "dash-mandatory",
  "dash-expenses",
];

type SectionTone =
  "clients" | "activity" | "income" | "collection" | "mandatory" | "expenses" | "profit";

const SECTION_STYLES: Record<SectionTone, { shell: string; header: string; badge: string }> = {
  clients: {
    shell: "border-border bg-surface",
    header: "border-b border-border bg-surface-muted",
    badge: "bg-chrome text-white",
  },
  activity: {
    shell: "border-status-warning-border bg-status-warning-bg",
    header: "border-b border-status-warning-border bg-status-warning-bg",
    badge: "bg-status-warning-solid text-white",
  },
  income: {
    shell: "border-status-success-border bg-surface",
    header: "border-b border-status-success-border bg-status-success-bg",
    badge: "bg-status-success-solid text-white",
  },
  collection: {
    shell: "border-border bg-surface",
    header: "border-b border-brand-200 bg-brand-50",
    badge: "bg-brand-gradient text-white",
  },
  mandatory: {
    shell: "border-status-warning-border bg-surface",
    header: "border-b border-status-warning-border bg-status-warning-bg",
    badge: "bg-status-warning-solid text-white",
  },
  expenses: {
    shell: "border-status-danger-border bg-surface",
    header: "border-b border-status-danger-border bg-status-danger-bg",
    badge: "bg-status-danger-solid text-white",
  },
  profit: {
    shell: "border-status-success-border bg-status-success-bg",
    header: "border-b border-status-success-border bg-status-success-bg",
    badge: "bg-status-success-solid text-white",
  },
};

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
  };
}

function DashboardSection({
  id,
  title,
  description,
  tone,
  action,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  tone: SectionTone;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const styles = SECTION_STYLES[tone];

  return (
    <section
      id={id}
      className={`scroll-mt-4 overflow-hidden rounded-lg border shadow-card transition-shadow duration-150 hover:shadow-hover ${styles.shell}`}
    >
      <div className={`dashboard-section-header ${styles.header}`}>
        <div className="flex items-start gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${styles.badge}`}
          >
            {title}
          </span>
          {description && (
            <p className="max-w-2xl text-[11px] leading-snug text-muted">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="dashboard-section-body">{children}</div>
    </section>
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
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-surface">
      <table className="data-table table-cards w-full lg:min-w-[520px]">
        <thead>
          <tr>
            <th>Период</th>
            <th>Депозит</th>
            <th>Фин. управление</th>
            <th>Госпошлина</th>
            <th>Итого</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td data-label="Период" className="font-medium text-foreground">
              {monthLabel}
            </td>
            <td data-label="Депозит">{formatMoney(month.deposit)}</td>
            <td data-label="Фин. управление">{formatMoney(month.financial_management)}</td>
            <td data-label="Госпошлина">{formatMoney(month.court_fee)}</td>
            <td data-label="Итого" className="font-bold text-status-warning-text">
              {formatMoney(month.total)}
            </td>
          </tr>
          <tr>
            <td data-label="Период" className="font-medium text-foreground">
              Всего
            </td>
            <td data-label="Депозит">{formatMoney(total.deposit)}</td>
            <td data-label="Фин. управление">{formatMoney(total.financial_management)}</td>
            <td data-label="Госпошлина">{formatMoney(total.court_fee)}</td>
            <td data-label="Итого" className="font-bold text-status-warning-text">
              {formatMoney(total.total)}
            </td>
          </tr>
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
  const [cashSaving, setCashSaving] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);
  const isOwner = user?.role === "owner";
  const canManageClients = isOwner || user?.role === "manager";
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

  return (
    <div className="page-groups">
      <div className="page-group">
        <PageHeader
          title="Дашборд"
          subtitle={`Добро пожаловать, ${user?.full_name}`}
          action={
            canManageClients ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <Input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value || currentMonth())}
                  className="w-[150px]"
                  aria-label="Отчётный месяц"
                />
                {showQuestionnaires ? (
                  <Link href="/questionnaires">
                    <Button type="button">Анкеты</Button>
                  </Link>
                ) : null}
                <Link href="/tasks">
                  <Button type="button" variant="secondary">
                    Задачи{openTasksCount > 0 ? ` (${openTasksCount})` : ""}
                  </Button>
                </Link>
                {isOwner && (
                  <Link href="/analytics">
                    <Button type="button" variant="secondary">
                      Аналитика →
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

        <div className="stat-grid">
          {showOrgFinance ? (
            <>
              <StatCard
                label="Сейчас в кассе"
                value={formatMoney(summary.cash_on_hand)}
                tone={Number(summary.cash_on_hand) >= 0 ? "success" : "danger"}
                hint={
                  summary.cash_opening_is_set
                    ? `Остаток на начало ${formatMoney(summary.cash_opening_balance)} + движение месяца`
                    : "Остаток на начало не указан — укажите в разделе «Касса»"
                }
              />
              <StatCard
                label="Ещё ожидается"
                value={formatMoney(summary.expected_this_month)}
                tone="brand"
                hint={`Платежи клиентов до конца ${monthLabel}`}
              />
              <StatCard
                label="Осталось расходов"
                value={formatMoney(summary.expenses_remaining_this_month)}
                tone="warning"
                hint={`План ${formatMoney(summary.monthly_expenses)} · оплачено ${formatMoney(summary.expenses_paid_this_month)}`}
              />
              <StatCard
                label="Прогноз на конец месяца"
                value={formatMoney(summary.cash_forecast_end)}
                tone={Number(summary.cash_forecast_end) >= 0 ? "success" : "danger"}
                hint="Если все платежи придут, а плановые расходы закроются"
              />
            </>
          ) : (
            <>
              <StatCard label="Всего клиентов" value={summary.clients_total} tone="brand" />
              <StatCard label="Активных" value={summary.clients_active} tone="success" />
              <StatCard label="С просрочкой" value={summary.clients_overdue} tone="danger" />
              <StatCard label="Открытых задач" value={openTasksCount} tone="warning" />
            </>
          )}
        </div>

        {showOrgFinance && (
          <div className="flex flex-wrap gap-1.5">
            {DASHBOARD_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => goToSection(section.id)}
                className="client-section-nav-btn"
              >
                {section.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {showQuestionnaires ? (
        <Card>
          <SectionTitle
            title="Анкеты"
            action={
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/questionnaires/new">
                  <Button type="button">Новая анкета</Button>
                </Link>
                <Link
                  href="/questionnaires"
                  className="text-sm font-semibold text-brand-600 hover:text-brand-700"
                >
                  Все анкеты →
                </Link>
              </div>
            }
          />
          <p className="text-sm text-muted">
            Первичный отбор на банкротство. Заполните анкету до договора — она сохранится, даже если
            клиент ещё не заведён.
          </p>
        </Card>
      ) : null}

      {showOrgFinance && (
        <div className="page-group">
          <DashboardSection
            id="dash-cash"
            tone="income"
            title="Касса"
            description="Остаток на начало задаётся вручную. Дальше касса живёт по факту: прибавляются поступления, вычитаются реально сделанные выплаты"
          >
            <div className="stat-grid">
              <StatCard
                label="Остаток на начало"
                value={formatMoney(summary.cash_opening_balance)}
                hint={summary.cash_opening_is_set ? "Указан вручную" : "Не указан"}
              />
              <StatCard
                label={`Поступило за ${monthLabel}`}
                value={formatMoney(summary.cash_in_this_month)}
                tone="success"
                hint="Рассрочка + сбор документов + гражданка"
              />
              <StatCard
                label={`Выплачено за ${monthLabel}`}
                value={formatMoney(cashOutThisMonth)}
                tone="warning"
                hint="Обязательные платежи + оплаченные расходы"
              />
              <StatCard
                label="Сейчас в кассе"
                value={formatMoney(summary.cash_on_hand)}
                tone={Number(summary.cash_on_hand) >= 0 ? "success" : "danger"}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-2 rounded-md border border-status-success-border bg-surface px-3 py-2">
              <div className="w-[180px]">
                <label className="mb-0.5 block text-xs text-muted">
                  Остаток на начало {monthLabel}, ₽
                </label>
                <Input
                  type="number"
                  value={cashDraft}
                  placeholder="0"
                  onChange={(e) => setCashDraft(e.target.value)}
                />
              </div>
              <Button type="button" disabled={cashSaving} onClick={handleSaveCashBalance}>
                {cashSaving ? "Сохранение..." : "Сохранить"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={cashSaving}
                onClick={handleCarryForwardCash}
              >
                Перенести {formatMoney(summary.cash_on_hand)} в {formatMonthLabel(nextMonth(month))}
              </Button>
            </div>
            {cashError ? <p className="mt-2 text-xs text-status-danger-text">{cashError}</p> : null}
          </DashboardSection>

          <DashboardSection
            id="dash-portfolio"
            tone="clients"
            title="Портфель"
            description="Деньги, которые клиенты ещё должны по графикам. Не зависит от выбранного месяца"
          >
            <div className="stat-grid">
              <StatCard
                label="Остаток по графикам"
                value={formatMoney(summary.total_remainder)}
                tone="brand"
                hint="Сколько ещё предстоит получить"
              />
              <StatCard
                label="Из них просрочено"
                value={formatMoney(summary.overdue_amount)}
                tone="danger"
                hint={`${summary.clients_overdue} клиентов`}
              />
              <StatCard
                label="Сумма активных договоров"
                value={formatMoney(summary.active_contract_total)}
                hint={`${summary.clients_active} активных клиентов`}
              />
              <StatCard
                label="Получено за всё время"
                value={formatMoney(summary.total_collected)}
                tone="success"
              />
            </div>
          </DashboardSection>

          <DashboardSection
            id="dash-month"
            tone="profit"
            title={`Итоги за ${monthLabel}`}
            description="Прибыль по банкротству: рассрочка + касса сбора − обязательные − расходы. Гражданка идёт в кассу, но в эту прибыль не входит"
          >
            <div className="stat-grid">
              <StatCard
                label="Чистая прибыль"
                value={formatMoney(summary.net_profit_this_month)}
                tone={Number(summary.net_profit_this_month) >= 0 ? "success" : "danger"}
              />
              <StatCard
                label="Поступило по рассрочке"
                value={formatMoney(summary.collected_this_month)}
                tone="success"
                hint={`Касса сбора ${formatMoney(summary.document_collection_this_month.collection_cash)}`}
              />
              <StatCard
                label="Обязательные платежи"
                value={formatMoney(summary.mandatory_paid_this_month.total)}
                tone="warning"
                hint="Депозит, фин. управление, госпошлина"
              />
              <StatCard
                label="Расходы: оплачено"
                value={formatMoney(summary.expenses_paid_this_month)}
                tone="warning"
                hint={`План ${formatMoney(summary.monthly_expenses)} · осталось ${formatMoney(summary.expenses_remaining_this_month)}`}
              />
            </div>
            <div className="mt-2 rounded-md border border-status-success-border bg-surface px-3 py-2">
              <p className="text-xs font-semibold text-foreground">Формула прибыли</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Рассрочка{" "}
                <span className="font-semibold text-foreground">
                  {formatMoney(summary.collected_this_month)}
                </span>
                {" + "}
                Касса сбора{" "}
                <span className="font-semibold text-foreground">
                  {formatMoney(summary.document_collection_this_month.collection_cash)}
                </span>
                {" − "}
                Обязательные{" "}
                <span className="font-semibold text-status-warning-text">
                  {formatMoney(summary.mandatory_paid_this_month.total)}
                </span>
                {" − "}
                Расходы (план){" "}
                <span className="font-semibold text-foreground">
                  {formatMoney(summary.monthly_expenses)}
                </span>
                {" = "}
                <span
                  className={`font-bold ${
                    Number(summary.net_profit_this_month) >= 0
                      ? "text-status-success-text"
                      : "text-status-danger-text"
                  }`}
                >
                  {formatMoney(summary.net_profit_this_month)}
                </span>
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Прибыль считает расходы по бюджету, касса — по факту оплаты. Поэтому «сейчас в
                кассе» выше прибыли ровно на неоплаченные{" "}
                <span className="font-semibold text-foreground">
                  {formatMoney(summary.expenses_remaining_this_month)}
                </span>
                .
              </p>
            </div>
          </DashboardSection>
        </div>
      )}

      {showOrgFinance && (
        <div className="page-group">
          <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
            <h2 className="section-title">Детализация</h2>
            <Button
              type="button"
              variant="secondary"
              aria-expanded={showDetails}
              onClick={() => setShowDetails((value) => !value)}
            >
              {showDetails ? "Свернуть" : "Подробнее"}
            </Button>
          </div>

          {showDetails ? (
            <>
              <DashboardSection
                id="dash-activity"
                tone="activity"
                title={`Активность за ${monthLabel}`}
                description="Сколько человек пришло, оплатило сбор документов и заключило договор банкротства"
                action={
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href="/clients/collection"
                      className="interactive text-xs font-semibold text-status-warning-text hover:opacity-80"
                    >
                      Сбор документов →
                    </Link>
                    <Link
                      href="/clients/contracts"
                      className="interactive text-xs font-semibold text-status-warning-text hover:opacity-80"
                    >
                      Договоры →
                    </Link>
                  </div>
                }
              >
                <div className="stat-grid">
                  <StatCard
                    label="Новых клиентов"
                    value={summary.clients_new_this_month}
                    tone="brand"
                    hint={`Дата договора в ${monthLabel}`}
                  />
              <Link
                href={clientListPath("collection", {
                  collection_view: "all",
                  collection_paid_month: month,
                })}
                className="interactive block"
              >
                <StatCard
                  label="Оплатили сбор документов"
                  value={summary.document_collection_this_month.paid_count}
                  hint="Нажмите, чтобы увидеть поимённо, кто именно вошёл в счёт"
                />
              </Link>
                  <StatCard
                    label="Заключили договор"
                    value={summary.contracts_signed_this_month}
                    tone="success"
                    hint="Переведены на банкротство"
                  />
                  <StatCard
                    label="Сейчас на сборе"
                    value={summary.collection_in_progress}
                    tone="warning"
                    hint="Текущее состояние, не зависит от месяца"
                  />
                </div>
              </DashboardSection>

              <DashboardSection
                id="dash-civil"
                tone="income"
                title="Гражданские дела"
                description="Доход по цене дел, отдельно от рассрочки. За месяц — по дате обращения"
                action={
                  <Link
                    href="/civil-cases"
                    className="interactive text-xs font-semibold text-status-success-text hover:opacity-80"
                  >
                    Гражданские дела →
                  </Link>
                }
              >
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    label={`Доход за ${monthLabel}`}
                    value={formatMoney(summary.civil_income_this_month)}
                    tone="success"
                  />
                  <StatCard label="Доход всего" value={formatMoney(summary.civil_income_total)} />
                  <StatCard
                    label={`Дел за ${monthLabel}`}
                    value={summary.civil_cases_this_month}
                    tone="brand"
                  />
                  <StatCard label="Всего дел" value={summary.civil_cases_total} />
                </div>
              </DashboardSection>

              <DashboardSection
                id="dash-collection"
                tone="collection"
                title="Сбор документов"
                description="10 000 ₽ в кассу · 2 000 ₽ нотариус · 1 000 ₽ менеджеру. Выписки/госпошлина — отдельно, вручную"
              >
                <div className="stat-grid">
                  <StatCard
                    label={`Касса сбора за ${monthLabel}`}
                    value={formatMoney(summary.document_collection_this_month.collection_cash)}
                    tone="success"
                    hint={`${summary.document_collection_this_month.paid_count} оплат`}
                  />
                  <StatCard
                    label="Касса (всего)"
                    value={formatMoney(summary.document_collection_total.collection_cash)}
                    hint={`${summary.document_collection_total.paid_count} оплат`}
                  />
                  <StatCard
                    label="Нотариус (всего)"
                    value={formatMoney(summary.document_collection_total.notary_fee)}
                  />
                  <StatCard
                    label="Менеджерам (всего)"
                    value={formatMoney(summary.document_collection_total.manager_commission)}
                  />
                </div>
              </DashboardSection>

              <DashboardSection
                id="dash-mandatory"
                tone="mandatory"
                title="Обязательные платежи"
                description="Депозит, финансовое управление и госпошлина — отдельно по каждой статье"
              >
                <MandatoryPaymentsTable
                  month={summary.mandatory_paid_this_month}
                  monthLabel={monthLabel}
                  total={summary.mandatory_paid_total}
                />
              </DashboardSection>

              <DashboardSection
                id="dash-expenses"
                tone="expenses"
                title="Расходы организации"
                description="Фиксированные статьи + разовые траты за выбранный месяц"
                action={
                  <Link
                    href="/expenses"
                    className="interactive text-xs font-semibold text-status-danger-text hover:opacity-80"
                  >
                    Управление расходами →
                  </Link>
                }
              >
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  <StatCard
                    label="Расходы в месяц"
                    value={formatMoney(summary.monthly_expenses)}
                    tone="warning"
                    hint="План + разовые"
                  />
                  <StatCard
                    label="Плановые статьи"
                    value={formatMoney(summary.fixed_monthly_expenses)}
                    hint="Ежемесячный бюджет"
                  />
                  <StatCard
                    label={`Разовые за ${monthLabel}`}
                    value={formatMoney(summary.one_time_expenses_this_month)}
                    tone="danger"
                  />
                </div>
              </DashboardSection>
            </>
          ) : null}
        </div>
      )}

      {canManageClients && (
        <Card>
          <SectionTitle
            title="Клиенты с просрочкой"
            action={
              <div className="flex items-center gap-3">
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
                <Link
                  href="/clients/contracts?overdue=true"
                  className="text-sm font-semibold text-brand-600 hover:text-brand-700"
                >
                  Все клиенты →
                </Link>
              </div>
            }
          />
          {overdueClients.length === 0 ? (
            <p className="alert-success">Просроченных платежей нет — отличная работа!</p>
          ) : (
            <>
              <div className="desktop-only overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ФИО</th>
                      <th>Телефон</th>
                      <th>Договор</th>
                      <th>Сумма</th>
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
                        <td className="text-muted">{client.phone}</td>
                        <td className="text-muted">{formatDate(client.contract_date)}</td>
                        <td className="font-medium text-foreground">
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
        </Card>
      )}
    </div>
  );
}
