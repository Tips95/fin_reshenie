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
          subtitle={user?.role === "owner" ? "Сводка по всем инвесторам" : "Мои договоры и касса"}
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

  return (
    <div className="page-stack">
      <PageHeader
        title="Товарная рассрочка"
        subtitle={user?.role === "owner" ? "Сводка по всем инвесторам" : "Мои договоры и касса"}
      />

      {isEmpty && (
        <p className="alert-warning">
          {user?.role === "owner"
            ? "Договоров пока нет. Перейдите в «Клиенты», создайте клиента и договор, назначьте инвестора."
            : "У вас пока нет договоров. Администратор создаёт клиентов и назначает договоры инвесторам — после этого они появятся здесь."}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Договоров" value={data.contracts_count} tone="brand" />
        <StatCard label="Активных" value={data.active_count} tone="success" />
        <StatCard label="Просрочка" value={data.overdue_count} tone="danger" />
        <StatCard label="К оплате" value={formatMoney(data.remainder_total)} tone="warning" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Сумма договоров" value={formatMoney(data.total_amount)} tone="default" />
        <StatCard label="Получено" value={formatMoney(data.collected_total)} tone="success" />
        <StatCard label="Первоначальные взносы" value={formatMoney(data.down_payment_total)} tone="default" />
      </div>

      {user?.role === "investor" && (
        <Card>
          <SectionTitle title="Мой вклад" description="Сумма, которую вы инвестируете в договоры" />
          <p className="text-lg font-bold text-foreground">
            {formatMoney(user.investment_amount ?? "0")}
          </p>
          <Link href="/retail/capital" className="mt-2 inline-block">
            <Button type="button">Изменить сумму вклада</Button>
          </Link>
        </Card>
      )}

      {user?.role === "owner" && data.investors.length > 0 && (
        <Card>
          <SectionTitle title="Инвесторы" description="Каждый финансирует свои договоры" />
          <div className="overflow-x-auto">
            <table className="data-table table-cards">
              <thead>
                <tr>
                  <th>Инвестор</th>
                  <th>Вклад</th>
                  <th>Договоров</th>
                  <th>Сумма</th>
                  <th>Получено</th>
                  <th>Остаток</th>
                  <th>Просрочка</th>
                </tr>
              </thead>
              <tbody>
                {data.investors.map((item) => (
                  <tr key={item.investor_id}>
                    <td data-label="Инвестор" className="font-medium text-foreground">
                      {item.investor_name}
                    </td>
                    <td data-label="Вклад">{formatMoney(item.investment_amount)}</td>
                    <td data-label="Договоров">{item.contracts_count}</td>
                    <td data-label="Сумма">{formatMoney(item.total_amount)}</td>
                    <td data-label="Получено">{formatMoney(item.collected_total)}</td>
                    <td data-label="Остаток">{formatMoney(item.remainder_total)}</td>
                    <td data-label="Просрочка">
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
          <Link href="/retail/contracts">
            <Button type="button">Договоры</Button>
          </Link>
          {user?.role === "investor" && (
            <>
              <Link href="/retail/clients">
                <Button type="button" variant="secondary">
                  Мои клиенты
                </Button>
              </Link>
              <Link href="/retail/capital">
                <Button type="button" variant="secondary">
                  Мой вклад
                </Button>
              </Link>
            </>
          )}
          {user?.role === "owner" && (
            <>
              <Link href="/retail/clients">
                <Button type="button" variant="secondary">
                  Клиенты
                </Button>
              </Link>
              <Link href="/retail/investors">
                <Button type="button" variant="secondary">
                  Инвесторы
                </Button>
              </Link>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
