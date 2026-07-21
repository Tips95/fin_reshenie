"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge, Card, LoadingState, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { analyticsApi } from "@/lib/api-client";
import { formatDate, formatMoney, formatMonthLabel, formatShortName, statusLabel } from "@/lib/format";
import type { AnalyticsOverview, ClientProfitItem, ManagerCommissionsOverview } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

type ProfitSortField = "profit" | "collected_total" | "schedule_remainder" | "full_name";

function maxTrendValue(trends: AnalyticsOverview["trends"]): number {
  return Math.max(
    1,
    ...trends.flatMap((point) => [
      Number(point.collected),
      Number(point.expected),
      Math.abs(Number(point.net_profit)),
    ]),
  );
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [commissions, setCommissions] = useState<ManagerCommissionsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(6);
  const [sortField, setSortField] = useState<ProfitSortField>("profit");

  const isOwner = user?.role === "owner";
  const showOrgExpenses = isOwner;
  const showManagerCommissions = isOwner;

  useEffect(() => {
    if (!isOwner) {
      router.replace("/");
      return;
    }
    setLoading(true);
    const requests: Promise<void>[] = [
      analyticsApi
        .overview(months)
        .then((overview) => setData(overview))
        .catch(() => setData(null)),
    ];
    if (isOwner) {
      requests.push(
        analyticsApi
          .managerCommissions(months)
          .then((overview) => setCommissions(overview))
          .catch(() => setCommissions(null)),
      );
    } else {
      setCommissions(null);
    }
    Promise.all(requests).finally(() => setLoading(false));
  }, [months, router, isOwner]);

  const sortedProfits = useMemo(() => {
    if (!data) return [];
    const items = [...data.client_profits];
    items.sort((a, b) => {
      if (sortField === "full_name") {
        return a.full_name.localeCompare(b.full_name, "ru");
      }
      return Number(b[sortField]) - Number(a[sortField]);
    });
    return items;
  }, [data, sortField]);

  const trendMax = useMemo(() => (data ? maxTrendValue(data.trends) : 1), [data]);

  if (!isOwner) return <LoadingState text="Перенаправление..." />;
  if (loading) return <LoadingState text="Загрузка аналитики..." />;
  if (!data) return <LoadingState text="Не удалось загрузить аналитику" />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Аналитика"
        subtitle="Прибыль по клиентам и динамика поступлений"
        action={
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-brand-400"
          >
            <option value={3}>3 месяца</option>
            <option value={6}>6 месяцев</option>
            <option value={12}>12 месяцев</option>
          </select>
        }
      />

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Клиентов в выборке" value={data.summary.clients_count} tone="default" />
        <StatCard
          label="Получено всего"
          value={formatMoney(data.summary.collected_total)}
          tone="success"
        />
        <StatCard
          label="Прибыль по клиентам"
          value={formatMoney(data.summary.profit_total)}
          tone={Number(data.summary.profit_total) >= 0 ? "success" : "danger"}
        />
        <StatCard
          label="Обязательные (депозит)"
          value={formatMoney(data.summary.mandatory_paid_total.deposit)}
          tone="default"
        />
        <StatCard
          label="Обязательные (фин. управ.)"
          value={formatMoney(data.summary.mandatory_paid_total.financial_management)}
          tone="default"
        />
        <StatCard
          label="Обязательные (госпошлина)"
          value={formatMoney(data.summary.mandatory_paid_total.court_fee)}
          tone="default"
        />
        <StatCard
          label="Обязательные всего"
          value={formatMoney(data.summary.mandatory_paid_total.total)}
          tone="warning"
        />
        <StatCard
          label="Остаток по графикам"
          value={formatMoney(data.summary.schedule_remainder_total)}
          tone="warning"
        />
      </div>

      <Card>
        <SectionTitle
          title="Тренды по месяцам"
          description={
            showOrgExpenses
              ? "Поступления, ожидания и чистая прибыль с учётом расходов организации"
              : "Поступления и ожидаемые платежи по вашим клиентам"
          }
        />
        <div className="space-y-5">
          {data.trends.map((point) => {
            const collectedWidth = Math.round((Number(point.collected) / trendMax) * 100);
            const expectedWidth = Math.round((Number(point.expected) / trendMax) * 100);
            const profitPositive = Number(point.net_profit) >= 0;
            const profitWidth = Math.round(
              (Math.abs(Number(point.net_profit)) / trendMax) * 100,
            );

            return (
              <div key={point.month} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-800">{formatMonthLabel(point.month)}</p>
                  <p className="text-xs text-slate-500">Платежей: {point.payments_count}</p>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="w-28 text-slate-500">Получено</span>
                    <div className="h-2 flex-1 rounded-full bg-slate-200">
                      <div
                        className="h-2 rounded-full bg-emerald-500"
                        style={{ width: `${collectedWidth}%` }}
                      />
                    </div>
                    <span className="w-28 text-right font-medium text-slate-700">
                      {formatMoney(point.collected)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-28 text-slate-500">Ожидалось</span>
                    <div className="h-2 flex-1 rounded-full bg-slate-200">
                      <div
                        className="h-2 rounded-full bg-brand-500"
                        style={{ width: `${expectedWidth}%` }}
                      />
                    </div>
                    <span className="w-28 text-right font-medium text-slate-700">
                      {formatMoney(point.expected)}
                    </span>
                  </div>
                  {showOrgExpenses && (
                    <>
                      <div className="flex items-center gap-3">
                        <span className="w-28 text-slate-500">Обязательные</span>
                        <div className="h-2 flex-1 rounded-sm bg-slate-200">
                          <div
                            className="h-2 bg-amber-600"
                            style={{
                              width: `${Math.round((Number(point.mandatory_paid) / trendMax) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="w-28 text-right font-medium text-slate-700">
                          {formatMoney(point.mandatory_paid)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="w-28 text-slate-500">Чистая прибыль</span>
                        <div className="h-2 flex-1 rounded-sm bg-slate-200">
                          <div
                            className={profitPositive ? "h-2 bg-emerald-600" : "h-2 bg-rose-600"}
                            style={{ width: `${profitWidth}%` }}
                          />
                        </div>
                        <span
                          className={`w-28 text-right font-medium ${
                            profitPositive ? "text-emerald-700" : "text-rose-700"
                          }`}
                        >
                          {formatMoney(point.net_profit)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {showOrgExpenses && (
          <p className="mt-3 text-xs text-slate-500">
            Расходы организации в месяц: {formatMoney(data.summary.monthly_expenses)}. Чистая
            прибыль: поступления − обязательные платежи − расходы.
          </p>
        )}
      </Card>

      {showManagerCommissions && commissions && (
        <Card>
          <SectionTitle
            title="Комиссии менеджеров за сбор документов"
            description="1 000 ₽ за каждого клиента с оплаченным сбором документов"
          />
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <StatCard
              label="Всего комиссий"
              value={formatMoney(commissions.total_commission)}
              tone="success"
            />
            <StatCard
              label="Оплаченных сборов"
              value={commissions.paid_count}
              tone="brand"
            />
          </div>
          {commissions.items.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Пока нет оплаченных сборов документов
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Менеджер</th>
                    <th>Клиент</th>
                    <th>Дата оплаты</th>
                    <th>Комиссия</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.items.map((item) => (
                    <tr key={item.document_collection_id}>
                      <td className="font-medium text-slate-800">{item.manager_name}</td>
                      <td>
                        <Link
                          href={`/clients/${item.client_id}`}
                          className="font-semibold text-brand-700 hover:text-brand-600"
                        >
                          {formatShortName(item.client_name)}
                        </Link>
                      </td>
                      <td className="text-slate-600">{formatDate(item.paid_date)}</td>
                      <td className="font-semibold text-emerald-700">
                        {formatMoney(item.commission_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Card>
        <SectionTitle
          title="Прибыль по клиентам"
          description="Прибыль = получено по графику − обязательные расходы (депозит, фин. управление, суд)"
          action={
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as ProfitSortField)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-brand-400"
            >
              <option value="profit">По прибыли</option>
              <option value="collected_total">По поступлениям</option>
              <option value="schedule_remainder">По остатку</option>
              <option value="full_name">По ФИО</option>
            </select>
          }
        />
        {sortedProfits.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Нет данных для аналитики
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Клиент</th>
                  <th>Договор</th>
                  <th>Получено</th>
                  <th>Обязательные</th>
                  <th>Прибыль</th>
                  <th>Остаток</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {sortedProfits.map((item) => (
                  <ProfitRow key={item.client_id} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ProfitRow({ item }: { item: ClientProfitItem }) {
  const profit = Number(item.profit);
  return (
    <tr className={item.has_overdue ? "bg-rose-50/70" : undefined}>
      <td>
        <Link
          href={`/clients/${item.client_id}`}
          className="font-semibold text-brand-700 hover:text-brand-600"
        >
          {formatShortName(item.full_name)}
        </Link>
      </td>
      <td className="text-slate-600">{formatDate(item.contract_date)}</td>
      <td className="font-medium text-slate-800">{formatMoney(item.collected_total)}</td>
      <td className="text-slate-600">{formatMoney(item.mandatory_paid_total)}</td>
      <td className={`font-semibold ${profit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
        {formatMoney(item.profit)}
      </td>
      <td className="text-slate-600">{formatMoney(item.schedule_remainder)}</td>
      <td>
        <div className="flex items-center gap-2">
          <Badge
            tone={
              item.status === "active"
                ? "success"
                : item.status === "defaulted"
                  ? "danger"
                  : "default"
            }
          >
            {statusLabel(item.status)}
          </Badge>
          {item.has_overdue && <Badge tone="danger">Просрочка</Badge>}
        </div>
      </td>
    </tr>
  );
}
