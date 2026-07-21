"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Badge, Button, Card, LoadingState, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { clientsApi, dashboardApi, exportsApi, tasksApi } from "@/lib/api-client";
import { formatDate, formatMoney, formatShortName, isFullClient, statusLabel } from "@/lib/format";
import type { Client, DashboardSummary, MandatoryPaymentBreakdown } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

function MandatoryPaymentsTable({
  title,
  month,
  total,
}: {
  title: string;
  month: MandatoryPaymentBreakdown;
  total: MandatoryPaymentBreakdown;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <th className="px-3 py-2 font-medium">Период</th>
              <th className="px-3 py-2 font-medium">Депозит</th>
              <th className="px-3 py-2 font-medium">Фин. управление</th>
              <th className="px-3 py-2 font-medium">Госпошлина</th>
              <th className="px-3 py-2 font-medium">Итого</th>
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
              <td className="px-3 py-2.5 font-semibold text-amber-800">
                {formatMoney(month.total)}
              </td>
            </tr>
            <tr>
              <td className="px-3 py-2.5 font-medium text-slate-700">Всего</td>
              <td className="px-3 py-2.5 text-slate-800">{formatMoney(total.deposit)}</td>
              <td className="px-3 py-2.5 text-slate-800">
                {formatMoney(total.financial_management)}
              </td>
              <td className="px-3 py-2.5 text-slate-800">{formatMoney(total.court_fee)}</td>
              <td className="px-3 py-2.5 font-semibold text-amber-800">
                {formatMoney(total.total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
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
        setSummary(summaryData);
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

      <Card>
        <SectionTitle
          title="Клиенты"
          description="Текущая база и состояние договоров"
        />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Всего клиентов" value={summary.clients_total} tone="brand" />
          <StatCard label="Активных" value={summary.clients_active} tone="success" />
          <StatCard label="С просрочкой" value={summary.clients_overdue} tone="danger" />
          {showOrgFinance && (
            <StatCard
              label="Объём активных договоров"
              value={formatMoney(summary.active_debt_total)}
              tone="default"
            />
          )}
        </div>
      </Card>

      {showOrgFinance && (
        <>
          <Card variant="accent">
            <SectionTitle
              title="Активность за месяц"
              description="Сколько человек оплатили сбор и заключили договор банкротства"
              action={
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/clients/collection"
                    className="text-xs font-medium text-brand-700 hover:text-brand-800"
                  >
                    Сбор документов →
                  </Link>
                  <Link
                    href="/clients/contracts"
                    className="text-xs font-medium text-brand-700 hover:text-brand-800"
                  >
                    Договоры →
                  </Link>
                </div>
              }
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <StatCard
                label="Оплатили сбор документов"
                value={summary.document_collection_this_month.paid_count}
                tone="brand"
                hint="13 000 ₽ за клиента"
              />
              <StatCard
                label="Заключили договор"
                value={summary.contracts_signed_this_month}
                tone="success"
                hint="Переведены на банкротство"
              />
            </div>
          </Card>

          <Card>
            <SectionTitle
              title="Поступления по рассрочке"
              description="Платежи по графикам договоров банкротства"
            />
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Ожидается в этом месяце"
                value={formatMoney(summary.expected_this_month)}
                tone="default"
              />
              <StatCard
                label="Получено в этом месяце"
                value={formatMoney(summary.collected_this_month)}
                tone="success"
              />
              <StatCard
                label="Всего получено"
                value={formatMoney(summary.total_collected)}
                tone="default"
              />
              <StatCard
                label="Остаток по графикам"
                value={formatMoney(summary.total_remainder)}
                tone="warning"
              />
              <StatCard
                label="Сумма просрочки"
                value={formatMoney(summary.overdue_amount)}
                tone="danger"
              />
            </div>
          </Card>

          <Card variant="accent">
            <SectionTitle
              title="Сбор документов"
              description="10 000 ₽ в кассу · 2 000 ₽ нотариус · 1 000 ₽ менеджеру (выписки отдельно)"
            />
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Касса (этот месяц)"
                value={formatMoney(summary.document_collection_this_month.collection_cash)}
                tone="success"
                hint={`${summary.document_collection_this_month.paid_count} оплат`}
              />
              <StatCard
                label="Касса (всего)"
                value={formatMoney(summary.document_collection_total.collection_cash)}
                tone="default"
                hint={`${summary.document_collection_total.paid_count} оплат`}
              />
              <StatCard
                label="Нотариус (всего)"
                value={formatMoney(summary.document_collection_total.notary_fee)}
                tone="default"
              />
              <StatCard
                label="Менеджерам (всего)"
                value={formatMoney(summary.document_collection_total.manager_commission)}
                tone="default"
              />
            </div>
          </Card>

          <Card>
            <SectionTitle
              title="Обязательные платежи"
              description="Депозит, финансовое управление и госпошлина по договорам банкротства"
            />
            <MandatoryPaymentsTable
              title="Выплаченные обязательные"
              month={summary.mandatory_paid_this_month}
              total={summary.mandatory_paid_total}
            />
          </Card>

          <Card>
            <SectionTitle
              title="Расходы организации"
              description="Фиксированные ежемесячные расходы компании"
              action={
                <Link
                  href="/expenses"
                  className="text-xs font-medium text-brand-700 hover:text-brand-800"
                >
                  Управление расходами →
                </Link>
              }
            />
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard
                label="Расходы в месяц"
                value={formatMoney(summary.monthly_expenses)}
                tone="warning"
              />
            </div>
          </Card>

          <Card variant="accent">
            <SectionTitle
              title="Прибыль"
              description="Итог с учётом рассрочки, кассы сбора, обязательных платежей и расходов"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <StatCard
                label="Чистая прибыль (месяц)"
                value={formatMoney(summary.net_profit_this_month)}
                tone={Number(summary.net_profit_this_month) >= 0 ? "success" : "danger"}
                hint="Рассрочка + касса сбора − обязательные − расходы"
              />
              <StatCard
                label="Прибыль по клиентам (всего)"
                value={formatMoney(summary.org_profit_total)}
                tone={Number(summary.org_profit_total) >= 0 ? "success" : "danger"}
                hint="Рассрочка + касса сбора − обязательные"
              />
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium text-slate-700">Формула за текущий месяц</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Рассрочка{" "}
                <span className="font-medium text-slate-800">
                  {formatMoney(summary.collected_this_month)}
                </span>
                {" + "}
                Касса сбора{" "}
                <span className="font-medium text-slate-800">
                  {formatMoney(summary.document_collection_this_month.collection_cash)}
                </span>
                {" − "}
                Обязательные{" "}
                <span className="font-medium text-amber-800">
                  {formatMoney(summary.mandatory_paid_this_month.total)}
                </span>
                {" − "}
                Расходы{" "}
                <span className="font-medium text-slate-800">
                  {formatMoney(summary.monthly_expenses)}
                </span>
                {" = "}
                <span
                  className={`font-semibold ${
                    Number(summary.net_profit_this_month) >= 0
                      ? "text-emerald-700"
                      : "text-rose-700"
                  }`}
                >
                  {formatMoney(summary.net_profit_this_month)}
                </span>
              </p>
            </div>
          </Card>
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
