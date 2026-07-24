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
          <p className="text-sm text-rose-600">{error || "Не удалось загрузить дашборд"}</p>
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
        <Card variant="accent">
          <p className="text-sm text-slate-600">
            {user?.role === "owner"
              ? "Договоров пока нет. Перейдите в «Клиенты», создайте клиента и договор, назначьте инвестора."
              : "У вас пока нет договоров. Администратор создаёт клиентов и назначает договоры инвесторам — после этого они появятся здесь."}
          </p>
        </Card>
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
          <p className="text-lg font-bold text-slate-900">
            {formatMoney(user.investment_amount ?? "0")}
          </p>
          <Link
            href="/retail/capital"
            className="mt-4 inline-block rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
          >
            Изменить сумму вклада
          </Link>
        </Card>
      )}

      {user?.role === "owner" && data.investors.length > 0 && (
        <Card>
          <SectionTitle title="Инвесторы" description="Каждый финансирует свои договоры" />
          <div className="overflow-x-auto">
            <table className="data-table">
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
                    <td className="font-medium text-slate-900">{item.investor_name}</td>
                    <td>{formatMoney(item.investment_amount)}</td>
                    <td>{item.contracts_count}</td>
                    <td>{formatMoney(item.total_amount)}</td>
                    <td>{formatMoney(item.collected_total)}</td>
                    <td>{formatMoney(item.remainder_total)}</td>
                    <td>
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
        <div className="flex flex-wrap gap-3">
          <Link href="/retail/contracts" className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">
            Договоры
          </Link>
          {user?.role === "investor" && (
            <>
              <Link href="/retail/clients" className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white">
                Мои клиенты
              </Link>
              <Link href="/retail/capital" className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
                Мой вклад
              </Link>
            </>
          )}
          {user?.role === "owner" && (
            <>
              <Link href="/retail/clients" className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white">
                Клиенты
              </Link>
              <Link href="/retail/investors" className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
                Инвесторы
              </Link>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
