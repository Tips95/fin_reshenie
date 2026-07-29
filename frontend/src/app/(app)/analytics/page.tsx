"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageHeader,
  SectionTitle,
  Select,
  StatCard,
} from "@/components/ui";
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
  const [showBreakdown, setShowBreakdown] = useState(false);

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
    <div className="page-groups">
      <div className="page-group">
        <PageHeader
          title="Аналитика"
          subtitle="Прибыль по клиентам и динамика поступлений"
          action={
            <Select
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="w-auto"
            >
              <option value={3}>3 месяца</option>
              <option value={6}>6 месяцев</option>
              <option value={12}>12 месяцев</option>
            </Select>
          }
        />

        <div className="stat-grid">
          <StatCard label="Клиентов в выборке" value={data.summary.clients_count} tone="brand" />
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
            label="Остаток по графикам"
            value={formatMoney(data.summary.schedule_remainder_total)}
            tone="warning"
          />
        </div>

        <div>
          <Button
            type="button"
            variant="secondary"
            aria-expanded={showBreakdown}
            onClick={() => setShowBreakdown((value) => !value)}
          >
            {showBreakdown ? "Свернуть разбивку" : "Подробнее: обязательные и сбор"}
          </Button>
        </div>

        {showBreakdown ? (
          <div className="stat-grid">
            <StatCard
              label="Обязательные (депозит)"
              value={formatMoney(data.summary.mandatory_paid_total.deposit)}
            />
            <StatCard
              label="Обязательные (фин. управ.)"
              value={formatMoney(data.summary.mandatory_paid_total.financial_management)}
            />
            <StatCard
              label="Обязательные (госпошлина)"
              value={formatMoney(data.summary.mandatory_paid_total.court_fee)}
            />
            <StatCard
              label="Обязательные всего"
              value={formatMoney(data.summary.mandatory_paid_total.total)}
              tone="warning"
            />
            <StatCard
              label="Касса сбора (всего)"
              value={formatMoney(data.summary.document_collection_total.collection_cash)}
              tone="success"
              hint={`${data.summary.document_collection_total.paid_count} оплат`}
            />
            <StatCard
              label="Нотариус (сбор)"
              value={formatMoney(data.summary.document_collection_total.notary_fee)}
            />
            <StatCard
              label="Менеджерам (сбор)"
              value={formatMoney(data.summary.document_collection_total.manager_commission)}
            />
          </div>
        ) : null}
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
        <div className="space-y-3">
          {data.trends.map((point) => {
            const collectedWidth = Math.round((Number(point.collected) / trendMax) * 100);
            const expectedWidth = Math.round((Number(point.expected) / trendMax) * 100);
            const profitPositive = Number(point.net_profit) >= 0;
            const profitWidth = Math.round(
              (Math.abs(Number(point.net_profit)) / trendMax) * 100,
            );

            return (
              <div key={point.month} className="rounded-md border border-border bg-surface-muted p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{formatMonthLabel(point.month)}</p>
                  <div className="flex flex-wrap gap-3 type-hint">
                    <span>Платежей: {point.payments_count}</span>
                    <span>Сбор: {point.collections_paid_count}</span>
                    <span>Договоров: {point.contracts_signed_count}</span>
                  </div>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-muted sm:w-28">Получено</span>
                    <div className="h-2 flex-1 rounded-full bg-surface-muted">
                      <div
                        className="h-2 rounded-full bg-status-success-solid"
                        style={{ width: `${collectedWidth}%` }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right font-medium text-foreground sm:w-28">
                      {formatMoney(point.collected)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-muted sm:w-28">Ожидалось</span>
                    <div className="h-2 flex-1 rounded-full bg-surface-muted">
                      <div
                        className="h-2 rounded-full bg-brand-500"
                        style={{ width: `${expectedWidth}%` }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right font-medium text-foreground sm:w-28">
                      {formatMoney(point.expected)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-muted sm:w-28">Касса сбора</span>
                    <div className="h-2 flex-1 rounded-full bg-surface-muted">
                      <div
                        className="h-2 rounded-full bg-brand-500"
                        style={{
                          width: `${Math.round((Number(point.collection_cash) / trendMax) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right font-medium text-foreground sm:w-28">
                      {formatMoney(point.collection_cash)}
                    </span>
                  </div>
                  {showOrgExpenses && (
                    <>
                      <div className="flex items-center gap-3">
                        <span className="w-20 shrink-0 text-muted sm:w-28">Обязательные</span>
                        <div className="h-2 flex-1 rounded-sm bg-surface-muted">
                          <div
                            className="h-2 bg-status-warning-solid"
                            style={{
                              width: `${Math.round((Number(point.mandatory_paid) / trendMax) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="w-24 shrink-0 text-right font-medium text-foreground sm:w-28">
                          {formatMoney(point.mandatory_paid)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="w-20 shrink-0 text-muted sm:w-28">Чистая прибыль</span>
                        <div className="h-2 flex-1 rounded-sm bg-surface-muted">
                          <div
                            className={profitPositive ? "h-2 bg-status-success-solid" : "h-2 bg-status-danger-solid"}
                            style={{ width: `${profitWidth}%` }}
                          />
                        </div>
                        <span
                          className={`w-24 shrink-0 text-right font-medium sm:w-28 ${
                            profitPositive ? "text-status-success-text" : "text-status-danger-text"
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
          <p className="mt-3 text-xs text-muted">
            Расходы организации в месяц: {formatMoney(data.summary.monthly_expenses)}. Чистая
            прибыль: поступления + касса сбора − обязательные платежи − расходы.
          </p>
        )}
      </Card>

      {showManagerCommissions && commissions && (
        <Card>
          <SectionTitle
            title="Комиссии менеджеров за сбор документов"
            description="1 000 ₽ за каждого клиента с оплаченным сбором документов"
          />
          <div className="mb-3 grid gap-2 sm:grid-cols-2">
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
            <EmptyState>Пока нет оплаченных сборов документов</EmptyState>
          ) : (
            <>
              <div className="desktop-only overflow-x-auto">
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
                        <td className="font-medium text-foreground">{item.manager_name}</td>
                        <td>
                          <Link
                            href={`/clients/${item.client_id}`}
                            className="link-brand"
                          >
                            {formatShortName(item.client_name)}
                          </Link>
                        </td>
                        <td className="text-muted">{formatDate(item.paid_date)}</td>
                        <td className="font-semibold text-status-success-text">
                          {formatMoney(item.commission_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mobile-only space-y-2">
                {commissions.items.map((item) => (
                  <div key={item.document_collection_id} className="row-card">
                    <div className="row-card-head">
                      <Link href={`/clients/${item.client_id}`} className="link-brand text-sm">
                        {formatShortName(item.client_name)}
                      </Link>
                      <span className="text-sm font-semibold text-status-success-text">
                        {formatMoney(item.commission_amount)}
                      </span>
                    </div>
                    <div className="row-card-grid">
                      <div>
                        <p className="row-card-label">Менеджер</p>
                        <p className="row-card-value">{item.manager_name}</p>
                      </div>
                      <div>
                        <p className="row-card-label">Дата оплаты</p>
                        <p className="row-card-value">{formatDate(item.paid_date)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      <Card>
        <SectionTitle
          title="Прибыль по клиентам"
          description="Прибыль = получено по графику − обязательные расходы (депозит, фин. управление, суд)"
          action={
            <Select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as ProfitSortField)}
              className="w-auto"
            >
              <option value="profit">По прибыли</option>
              <option value="collected_total">По поступлениям</option>
              <option value="schedule_remainder">По остатку</option>
              <option value="full_name">По ФИО</option>
            </Select>
          }
        />
        {sortedProfits.length === 0 ? (
          <EmptyState>Нет данных для аналитики</EmptyState>
        ) : (
          <>
            <div className="desktop-only overflow-x-auto">
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

            <div className="mobile-only space-y-2">
              {sortedProfits.map((item) => (
                <ProfitCard key={item.client_id} item={item} />
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function ProfitCard({ item }: { item: ClientProfitItem }) {
  const profit = Number(item.profit);
  return (
    <div className={`row-card ${item.has_overdue ? "row-card-overdue" : ""}`}>
      <div className="row-card-head">
        <Link href={`/clients/${item.client_id}`} className="link-brand text-sm">
          {formatShortName(item.full_name)}
        </Link>
        <span
          className={`text-sm font-semibold ${
            profit >= 0 ? "text-status-success-text" : "text-status-danger-text"
          }`}
        >
          {formatMoney(item.profit)}
        </span>
      </div>
      <div className="row-card-grid">
        <div>
          <p className="row-card-label">Получено</p>
          <p className="row-card-value">{formatMoney(item.collected_total)}</p>
        </div>
        <div>
          <p className="row-card-label">Обязательные</p>
          <p className="row-card-value">{formatMoney(item.mandatory_paid_total)}</p>
        </div>
        <div>
          <p className="row-card-label">Остаток</p>
          <p className="row-card-value">{formatMoney(item.schedule_remainder)}</p>
        </div>
        <div>
          <p className="row-card-label">Договор</p>
          <p className="row-card-value">{formatDate(item.contract_date)}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge
          tone={
            item.status === "active" ? "success" : item.status === "defaulted" ? "danger" : "default"
          }
        >
          {statusLabel(item.status)}
        </Badge>
        {item.has_overdue && <Badge tone="danger">Просрочка</Badge>}
      </div>
    </div>
  );
}

function ProfitRow({ item }: { item: ClientProfitItem }) {
  const profit = Number(item.profit);
  return (
    <tr className={item.has_overdue ? "is-overdue" : undefined}>
      <td>
        <Link
          href={`/clients/${item.client_id}`}
          className="link-brand"
        >
          {formatShortName(item.full_name)}
        </Link>
      </td>
      <td className="text-muted">{formatDate(item.contract_date)}</td>
      <td className="font-medium text-foreground">{formatMoney(item.collected_total)}</td>
      <td className="text-muted">{formatMoney(item.mandatory_paid_total)}</td>
      <td className={`font-semibold ${profit >= 0 ? "text-status-success-text" : "text-status-danger-text"}`}>
        {formatMoney(item.profit)}
      </td>
      <td className="text-muted">{formatMoney(item.schedule_remainder)}</td>
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
