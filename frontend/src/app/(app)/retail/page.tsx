"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Badge, Button, Card, LoadingState, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { ApiRequestError, retailApi } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import type { RetailDashboardSummary } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

export default function RetailDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<RetailDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await retailApi.dashboard());
    } catch (err) {
      setData(null);
      setError(err instanceof ApiRequestError ? err.message : "Не удалось загрузить дашборд");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    void load();
  }, [authLoading, user, load]);

  if (authLoading || loading) {
    return <LoadingState text="Загрузка дашборда..." />;
  }

  if (error || !data) {
    return (
      <div className="page-stack">
        <PageHeader
          title="Товарная рассрочка"
          subtitle={user?.role === "owner" ? "Сводка по всем инвесторам" : "Мои сделки и касса"}
        />
        <Card variant="accent">
          <p className="text-sm text-status-danger-text">{error || "Не удалось загрузить дашборд"}</p>
          <Button type="button" className="mt-3" onClick={() => void load()}>
            Повторить
          </Button>
        </Card>
      </div>
    );
  }

  const isEmpty = data.contracts_count === 0;
  const isInvestor = user?.role === "investor";

  return (
    <div className="page-stack">
      <PageHeader
        title="Товарная рассрочка"
        subtitle={
          user?.role === "owner"
            ? "Закупка → рассрочка → возврат с наценкой"
            : "Ваши сделки: сколько вложено, сколько уже вернулось"
        }
        action={
          <Link href="/retail/deals/new">
            <Button type="button">Новая сделка</Button>
          </Link>
        }
      />

      {isEmpty && (
        <Card variant="accent">
          <p className="text-sm text-muted">
            {isInvestor
              ? "Сделок пока нет. Нажмите «Новая сделка» — укажите клиента, закупочную цену и условия рассрочки."
              : "Сделок пока нет. Оформите первую через «Новая сделка» или раздел «Клиенты»."}
          </p>
        </Card>
      )}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Вложено в закупки" value={formatMoney(data.purchase_total)} tone="brand" />
        <StatCard
          label="Клиенты должны вернуть"
          value={formatMoney(data.total_amount)}
          hint="Сумма всех договоров"
        />
        <StatCard label="Уже получено" value={formatMoney(data.collected_total)} tone="success" />
        <StatCard label="Ещё ждём" value={formatMoney(data.remainder_total)} tone="warning" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Прибыль по сделкам"
          value={formatMoney(data.expected_profit)}
          tone="success"
          hint="Если все доплатят"
        />
        <StatCard
          label="Прибыль получена"
          value={formatMoney(data.collected_profit)}
          tone="success"
          hint="Пропорционально поступлениям"
        />
        <StatCard label="Активных договоров" value={data.active_count} tone="default" />
        <StatCard label="Просрочка" value={data.overdue_count} tone="danger" />
      </div>

      {isInvestor && (
        <Card>
          <SectionTitle title="Мой вклад" description="Сумма, которую вы готовы финансировать" />
          <p className="text-lg font-bold text-foreground">
            {formatMoney(user.investment_amount ?? "0")}
          </p>
          <Link href="/retail/capital" className="mt-2 inline-block">
            <Button type="button" variant="secondary">
              Изменить сумму вклада
            </Button>
          </Link>
        </Card>
      )}

      {user?.role === "owner" && data.investors.length > 0 && (
        <Card>
          <SectionTitle title="Инвесторы" description="Вложения, возврат и прибыль по каждому" />
          <div className="overflow-x-auto">
            <table className="data-table table-cards">
              <thead>
                <tr>
                  <th>Инвестор</th>
                  <th>Закупки</th>
                  <th>К возврату</th>
                  <th>Получено</th>
                  <th>Прибыль</th>
                  <th>Остаток</th>
                  <th>Проср.</th>
                </tr>
              </thead>
              <tbody>
                {data.investors.map((item) => (
                  <tr key={item.investor_id}>
                    <td data-label="Инвестор" className="font-medium text-foreground">
                      {item.investor_name}
                      <p className="text-xs text-muted">{item.contracts_count} дог.</p>
                    </td>
                    <td data-label="Закупки">{formatMoney(item.purchase_total)}</td>
                    <td data-label="К возврату">{formatMoney(item.total_amount)}</td>
                    <td data-label="Получено">{formatMoney(item.collected_total)}</td>
                    <td data-label="Прибыль">{formatMoney(item.collected_profit)}</td>
                    <td data-label="Остаток">{formatMoney(item.remainder_total)}</td>
                    <td data-label="Проср.">
                      <Badge tone={item.overdue_count > 0 ? "danger" : "success"}>
                        {item.overdue_count}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle title="Быстрые действия" />
        <div className="flex flex-wrap gap-2">
          <Link href="/retail/deals/new">
            <Button type="button">Новая сделка</Button>
          </Link>
          <Link href="/retail/contracts">
            <Button type="button" variant="secondary">
              Договоры
            </Button>
          </Link>
          <Link href="/retail/clients">
            <Button type="button" variant="secondary">
              {isInvestor ? "Мои клиенты" : "Клиенты"}
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
