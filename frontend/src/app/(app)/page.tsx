"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Badge, Button, Card, LoadingState, PageHeader, SectionTitle } from "@/components/ui";
import { clientsApi, dashboardApi, exportsApi, tasksApi } from "@/lib/api-client";
import { formatDate, formatMoney, formatShortName, isFullClient, statusLabel } from "@/lib/format";
import type {
  Client,
  DashboardSummary,
  DocumentCollectionBreakdown,
  MandatoryPaymentBreakdown,
} from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

const DASHBOARD_SECTIONS = [
  { id: "dash-clients", label: "Клиенты" },
  { id: "dash-activity", label: "Активность" },
  { id: "dash-income", label: "Рассрочка" },
  { id: "dash-collection", label: "Сбор" },
  { id: "dash-mandatory", label: "Обязательные" },
  { id: "dash-expenses", label: "Расходы" },
  { id: "dash-profit", label: "Прибыль" },
] as const;

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
    shell: "border-slate-300 bg-white",
    header: "border-b border-slate-200 bg-slate-50",
    badge: "bg-slate-700 text-white",
  },
  activity: {
    shell: "border-amber-300 bg-amber-50/50",
    header: "border-b border-amber-200 bg-amber-100/70",
    badge: "bg-amber-700 text-white",
  },
  income: {
    shell: "border-emerald-300 bg-white",
    header: "border-b border-emerald-200 bg-emerald-50",
    badge: "bg-emerald-700 text-white",
  },
  collection: {
    shell: "border-sky-300 bg-sky-50/50",
    header: "border-b border-sky-200 bg-sky-100/70",
    badge: "bg-sky-700 text-white",
  },
  mandatory: {
    shell: "border-orange-300 bg-white",
    header: "border-b border-orange-200 bg-orange-50",
    badge: "bg-orange-700 text-white",
  },
  expenses: {
    shell: "border-rose-300 bg-white",
    header: "border-b border-rose-200 bg-rose-50",
    badge: "bg-rose-700 text-white",
  },
  profit: {
    shell: "border-emerald-400 bg-emerald-50/60",
    header: "border-b border-emerald-300 bg-emerald-100/80",
    badge: "bg-emerald-800 text-white",
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
      className={`scroll-mt-4 overflow-hidden rounded-lg border shadow-sm ${styles.shell}`}
    >
      <div className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3 ${styles.header}`}>
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles.badge}`}>
            {title}
          </span>
          {description && (
            <p className="max-w-2xl text-xs leading-relaxed text-slate-600">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function MetricTile({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "brand";
  hint?: string;
}) {
  const valueColors = {
    default: "text-slate-900",
    success: "text-emerald-700",
    warning: "text-amber-700",
    danger: "text-rose-700",
    brand: "text-brand-700",
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold leading-tight ${valueColors[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function MandatoryPaymentsTable({
  month,
  total,
}: {
  month: MandatoryPaymentBreakdown;
  total: MandatoryPaymentBreakdown;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-orange-200 bg-white">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-orange-100 bg-orange-50/80 text-left text-xs text-slate-500">
            <th className="px-3 py-2 font-semibold">Период</th>
            <th className="px-3 py-2 font-semibold">Депозит</th>
            <th className="px-3 py-2 font-semibold">Фин. управление</th>
            <th className="px-3 py-2 font-semibold">Госпошлина</th>
            <th className="px-3 py-2 font-semibold">Итого</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-slate-100">
            <td className="px-3 py-2.5 font-medium text-slate-700">Этот месяц</td>
            <td className="px-3 py-2.5 text-slate-800">{formatMoney(month.deposit)}</td>
            <td className="px-3 py-2.5 text-slate-800">
              {formatMoney(month.financial_management)}
            </td>
            <td className="px-3 py-2.5 text-slate-800">{formatMoney(month.court_fee)}</td>
            <td className="px-3 py-2.5 font-bold text-orange-800">{formatMoney(month.total)}</td>
          </tr>
          <tr>
            <td className="px-3 py-2.5 font-medium text-slate-700">Всего</td>
            <td className="px-3 py-2.5 text-slate-800">{formatMoney(total.deposit)}</td>
            <td className="px-3 py-2.5 text-slate-800">
              {formatMoney(total.financial_management)}
            </td>
            <td className="px-3 py-2.5 text-slate-800">{formatMoney(total.court_fee)}</td>
            <td className="px-3 py-2.5 font-bold text-orange-800">{formatMoney(total.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [overdueClients, setOverdueClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportingOverdue, setExportingOverdue] = useState(false);
  const [openTasksCount, setOpenTasksCount] = useState(0);
  const isOwner = user?.role === "owner";
  const canManageClients = isOwner || user?.role === "manager";
  const showOrgFinance = isOwner;

  useEffect(() => {
    async function load() {
      try {
        const [summaryData, overdue, tasks] = await Promise.all([
          dashboardApi.summary(),
          canManageClients ? clientsApi.list({ overdue: true }) : Promise.resolve([]),
          canManageClients ? tasksApi.list("open") : Promise.resolve([]),
        ]);
        setSummary(normalizeSummary(summaryData));
        setOpenTasksCount(tasks.length);
        setOverdueClients(
          overdue.filter((client): client is Client => isFullClient(client)),
        );
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [canManageClients]);

  if (loading) return <LoadingState text="Загрузка дашборда..." />;
  if (!summary) return <LoadingState text="Не удалось загрузить дашборд" />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Дашборд"
        subtitle={`Добро пожаловать, ${user?.full_name}`}
        action={
          canManageClients ? (
            <div className="flex flex-wrap gap-1.5">
              <Link
                href="/tasks"
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Задачи{openTasksCount > 0 ? ` (${openTasksCount})` : ""}
              </Link>
              {isOwner && (
                <Link
                  href="/analytics"
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Аналитика →
                </Link>
              )}
            </div>
          ) : undefined
        }
      />

      {showOrgFinance && (
        <Card className="sticky top-0 z-20 border-slate-300 bg-white/95 p-3 backdrop-blur">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Быстрый переход
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DASHBOARD_SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800"
              >
                {section.label}
              </a>
            ))}
          </div>
        </Card>
      )}

      <DashboardSection
        id="dash-clients"
        tone="clients"
        title="Клиенты"
        description="Текущая база и состояние договоров"
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile label="Всего клиентов" value={summary.clients_total} tone="brand" />
          <MetricTile label="Активных" value={summary.clients_active} tone="success" />
          <MetricTile label="С просрочкой" value={summary.clients_overdue} tone="danger" />
          {showOrgFinance && (
            <MetricTile
              label="Объём активных договоров"
              value={formatMoney(summary.active_debt_total)}
            />
          )}
        </div>
      </DashboardSection>

      {showOrgFinance && (
        <>
          <DashboardSection
            id="dash-activity"
            tone="activity"
            title="Активность за месяц"
            description="Сколько человек оплатили сбор документов и заключили договор банкротства"
            action={
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/clients/collection"
                  className="text-xs font-semibold text-amber-800 hover:text-amber-900"
                >
                  Сбор документов →
                </Link>
                <Link
                  href="/clients/contracts"
                  className="text-xs font-semibold text-amber-800 hover:text-amber-900"
                >
                  Договоры →
                </Link>
              </div>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricTile
                label="Оплатили сбор документов"
                value={summary.document_collection_this_month.paid_count}
                tone="brand"
                hint="13 000 ₽ за клиента (10k + 2k + 1k)"
              />
              <MetricTile
                label="Заключили договор"
                value={summary.contracts_signed_this_month}
                tone="success"
                hint="Переведены на банкротство в этом месяце"
              />
            </div>
          </DashboardSection>

          <DashboardSection
            id="dash-income"
            tone="income"
            title="Поступления по рассрочке"
            description="Платежи по графикам договоров банкротства"
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <MetricTile
                label="Ожидается в этом месяце"
                value={formatMoney(summary.expected_this_month)}
              />
              <MetricTile
                label="Получено в этом месяце"
                value={formatMoney(summary.collected_this_month)}
                tone="success"
              />
              <MetricTile label="Всего получено" value={formatMoney(summary.total_collected)} />
              <MetricTile
                label="Остаток по графикам"
                value={formatMoney(summary.total_remainder)}
                tone="warning"
              />
              <MetricTile
                label="Сумма просрочки"
                value={formatMoney(summary.overdue_amount)}
                tone="danger"
              />
            </div>
          </DashboardSection>

          <DashboardSection
            id="dash-collection"
            tone="collection"
            title="Сбор документов"
            description="10 000 ₽ в кассу · 2 000 ₽ нотариус · 1 000 ₽ менеджеру. Выписки/госпошлина — отдельно, вручную"
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile
                label="Касса (этот месяц)"
                value={formatMoney(summary.document_collection_this_month.collection_cash)}
                tone="success"
                hint={`${summary.document_collection_this_month.paid_count} оплат`}
              />
              <MetricTile
                label="Касса (всего)"
                value={formatMoney(summary.document_collection_total.collection_cash)}
                hint={`${summary.document_collection_total.paid_count} оплат`}
              />
              <MetricTile
                label="Нотариус (всего)"
                value={formatMoney(summary.document_collection_total.notary_fee)}
              />
              <MetricTile
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
                className="text-xs font-semibold text-rose-800 hover:text-rose-900"
              >
                Управление расходами →
              </Link>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <MetricTile
                label="Расходы в месяц"
                value={formatMoney(summary.monthly_expenses)}
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
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricTile
                label="Чистая прибыль (месяц)"
                value={formatMoney(summary.net_profit_this_month)}
                tone={Number(summary.net_profit_this_month) >= 0 ? "success" : "danger"}
              />
              <MetricTile
                label="Прибыль по клиентам (всего)"
                value={formatMoney(summary.org_profit_total)}
                tone={Number(summary.org_profit_total) >= 0 ? "success" : "danger"}
              />
            </div>
            <div className="mt-4 rounded-lg border border-emerald-300 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-700">Формула за текущий месяц</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Рассрочка{" "}
                <span className="font-semibold text-slate-900">
                  {formatMoney(summary.collected_this_month)}
                </span>
                {" + "}
                Касса сбора{" "}
                <span className="font-semibold text-slate-900">
                  {formatMoney(summary.document_collection_this_month.collection_cash)}
                </span>
                {" − "}
                Обязательные{" "}
                <span className="font-semibold text-orange-800">
                  {formatMoney(summary.mandatory_paid_this_month.total)}
                </span>
                {" − "}
                Расходы{" "}
                <span className="font-semibold text-slate-900">
                  {formatMoney(summary.monthly_expenses)}
                </span>
                {" = "}
                <span
                  className={`font-bold ${
                    Number(summary.net_profit_this_month) >= 0
                      ? "text-emerald-700"
                      : "text-rose-700"
                  }`}
                >
                  {formatMoney(summary.net_profit_this_month)}
                </span>
              </p>
            </div>
          </DashboardSection>
        </>
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
                  href="/clients?overdue=true"
                  className="text-sm font-semibold text-brand-600 hover:text-brand-700"
                >
                  Все клиенты →
                </Link>
              </div>
            }
          />
          {overdueClients.length === 0 ? (
            <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-sm text-emerald-700">
              Просроченных платежей нет — отличная работа!
            </p>
          ) : (
            <div className="overflow-x-auto">
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
                  {overdueClients.slice(0, 10).map((client) => (
                    <tr key={client.id}>
                      <td>
                        <Link
                          href={`/clients/${client.id}`}
                          className="font-semibold text-brand-700 hover:text-brand-600"
                        >
                          {formatShortName(client.full_name)}
                        </Link>
                      </td>
                      <td className="text-slate-600">{client.phone}</td>
                      <td className="text-slate-600">{formatDate(client.contract_date)}</td>
                      <td className="font-medium text-slate-800">
                        {formatMoney(client.debt_amount)}
                      </td>
                      <td>
                        <Badge tone="danger">{statusLabel(client.status)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
