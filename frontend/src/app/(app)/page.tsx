"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Badge, Button, Card, LoadingState, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { clientsApi, dashboardApi, exportsApi, tasksApi } from "@/lib/api-client";
import { formatDate, formatMoney, formatShortName, isFullClient, statusLabel } from "@/lib/format";
import type { Client, DashboardSummary } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

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

      {showOrgFinance && (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
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
            label="Расходы в месяц"
            value={formatMoney(summary.monthly_expenses)}
            tone="warning"
          />
          <StatCard
            label="Чистая прибыль (месяц)"
            value={formatMoney(summary.net_profit_this_month)}
            tone={Number(summary.net_profit_this_month) >= 0 ? "success" : "danger"}
            hint="Получено − обязательные − расходы"
          />
          <StatCard
            label="Депозиты (месяц)"
            value={formatMoney(summary.mandatory_paid_this_month.deposit)}
            tone="default"
          />
          <StatCard
            label="Фин. управление (месяц)"
            value={formatMoney(summary.mandatory_paid_this_month.financial_management)}
            tone="default"
          />
          <StatCard
            label="Госпошлина (месяц)"
            value={formatMoney(summary.mandatory_paid_this_month.court_fee)}
            tone="default"
          />
          <StatCard
            label="Обязательные всего (месяц)"
            value={formatMoney(summary.mandatory_paid_this_month.total)}
            tone="warning"
          />
          <StatCard
            label="Депозиты (всего)"
            value={formatMoney(summary.mandatory_paid_total.deposit)}
            tone="default"
          />
          <StatCard
            label="Фин. управление (всего)"
            value={formatMoney(summary.mandatory_paid_total.financial_management)}
            tone="default"
          />
          <StatCard
            label="Госпошлина (всего)"
            value={formatMoney(summary.mandatory_paid_total.court_fee)}
            tone="default"
          />
          <StatCard
            label="Прибыль по клиентам"
            value={formatMoney(summary.org_profit_total)}
            tone={Number(summary.org_profit_total) >= 0 ? "success" : "danger"}
            hint="Всего получено − обязательные платежи"
          />
          <StatCard
            label="Сумма просрочки"
            value={formatMoney(summary.overdue_amount)}
            tone="danger"
          />
          <StatCard
            label="Остаток по графикам"
            value={formatMoney(summary.total_remainder)}
            tone="default"
          />
          <StatCard
            label="Всего получено"
            value={formatMoney(summary.total_collected)}
            tone="default"
          />
        </div>
      )}

      {isOwner && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-slate-700">Формула чистой прибыли за месяц</p>
              <p className="mt-1 text-xs text-slate-600">
                {formatMoney(summary.collected_this_month)} −{" "}
                {formatMoney(summary.mandatory_paid_this_month.total)} −{" "}
                {formatMoney(summary.monthly_expenses)} ={" "}
                <span className="font-semibold text-slate-900">
                  {formatMoney(summary.net_profit_this_month)}
                </span>
              </p>
            </div>
            <Link
              href="/expenses"
              className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Управление расходами
            </Link>
          </div>
        </Card>
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
