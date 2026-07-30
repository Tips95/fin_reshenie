"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Badge, Button, Card, Input, LoadingState, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { dashboardApi, exportsApi } from "@/lib/api-client";
import { formatDate, formatMoney, formatMonthLabel, formatShortName, statusLabel } from "@/lib/format";
import type {
  DashboardOverdueClientItem,
  DashboardSummary,
  DocumentCollectionBreakdown,
  MandatoryPaymentBreakdown,
} from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

const DASHBOARD_SECTIONS = [
  { id: "dash-clients", label: "Клиенты" },
  { id: "dash-activity", label: "Активность" },
  { id: "dash-income", label: "Рассрочка" },
  { id: "dash-profit", label: "Прибыль" },
  { id: "dash-collection", label: "Сбор" },
  { id: "dash-mandatory", label: "Обязательные" },
  { id: "dash-expenses", label: "Расходы" },
] as const;

// Разделы, скрытые за кнопкой «Подробнее»: нужны реже, чем остальные.
const DETAIL_SECTION_IDS: string[] = ["dash-collection", "dash-mandatory", "dash-expenses"];

type SectionTone =
  | "clients"
  | "activity"
  | "income"
  | "collection"
  | "mandatory"
  | "expenses"
  | "profit";

const SECTION_STYLES: Record<
  SectionTone,
  { shell: string; header: string; badge: string }
> = {
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
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${styles.badge}`}>
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
            <td data-label="Период" className="font-medium text-foreground">{monthLabel}</td>
            <td data-label="Депозит">{formatMoney(month.deposit)}</td>
            <td data-label="Фин. управление">{formatMoney(month.financial_management)}</td>
            <td data-label="Госпошлина">{formatMoney(month.court_fee)}</td>
            <td data-label="Итого" className="font-bold text-status-warning-text">
              {formatMoney(month.total)}
            </td>
          </tr>
          <tr>
            <td data-label="Период" className="font-medium text-foreground">Всего</td>
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

export default function DashboardPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentMonth);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportingOverdue, setExportingOverdue] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const isOwner = user?.role === "owner";
  const canManageClients = isOwner || user?.role === "manager";
  const showOrgFinance = isOwner;
  const monthLabel = formatMonthLabel(month);
  const isCurrentMonth = month === currentMonth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(normalizeSummary(await dashboardApi.summary(month)));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const overdueClients = summary?.overdue_clients_preview ?? [];
  const openTasksCount = summary?.open_tasks_count ?? 0;

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
                label={`Чистая прибыль за ${monthLabel}`}
                value={formatMoney(summary.net_profit_this_month)}
                tone={Number(summary.net_profit_this_month) >= 0 ? "success" : "danger"}
              />
              <StatCard
                label={`Получено за ${monthLabel}`}
                value={formatMoney(summary.collected_this_month)}
                tone="success"
                hint="Платежи по рассрочке"
              />
              <StatCard
                label="Сумма просрочки"
                value={formatMoney(summary.overdue_amount)}
                tone="danger"
                hint={`${summary.clients_overdue} клиентов`}
              />
              <StatCard label="Всего клиентов" value={summary.clients_total} tone="brand" />
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

      {showOrgFinance && (
        <div className="page-group">
          <DashboardSection
            id="dash-clients"
            tone="clients"
            title="Клиенты"
            description="Текущая база и состояние договоров"
          >
            <div className="stat-grid">
              <StatCard label="Активных" value={summary.clients_active} tone="success" />
              <StatCard label="С просрочкой" value={summary.clients_overdue} tone="danger" />
              <StatCard
                label="Сумма активных договоров"
                value={formatMoney(summary.active_contract_total)}
                hint="По графику рассрочки, без долга перед кредиторами"
              />
            </div>
          </DashboardSection>
        </div>
      )}

      {showOrgFinance && (
        <div className="page-group">
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
              <StatCard
                label="Оплатили сбор документов"
                value={summary.document_collection_this_month.paid_count}
                hint="13 000 ₽ за клиента (10k + 2k + 1k)"
              />
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
            id="dash-income"
            tone="income"
            title="Поступления по рассрочке"
            description="Платежи по графикам договоров банкротства"
          >
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard
                label={`Ожидается в ${monthLabel}`}
                value={formatMoney(summary.expected_this_month)}
              />
              <StatCard label="Всего получено" value={formatMoney(summary.total_collected)} />
              <StatCard
                label="Остаток по графикам"
                value={formatMoney(summary.total_remainder)}
                tone="warning"
              />
            </div>
          </DashboardSection>

          <DashboardSection
            id="dash-profit"
            tone="profit"
            title="Прибыль"
            description="Итог: рассрочка + касса сбора − обязательные − расходы"
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <StatCard
                label="Прибыль по клиентам (всего)"
                value={formatMoney(summary.org_profit_total)}
                tone={Number(summary.org_profit_total) >= 0 ? "success" : "danger"}
              />
            </div>
            <div className="mt-2 rounded-md border border-status-success-border bg-surface px-3 py-2">
              <p className="text-xs font-semibold text-foreground">Формула за {monthLabel}</p>
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
                Расходы{" "}
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
                description="Фиксированные ежемесячные расходы компании"
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
            <p className="alert-success">
              Просроченных платежей нет — отличная работа!
            </p>
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
                          <Link
                            href={`/clients/${client.id}`}
                            className="link-brand"
                          >
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
