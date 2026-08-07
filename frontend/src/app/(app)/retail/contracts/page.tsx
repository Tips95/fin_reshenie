"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Badge, Button, Card, EmptyState, LoadingState, PageHeader, Select } from "@/components/ui";
import { ApiRequestError, retailApi } from "@/lib/api-client";
import { formatDate, formatMoney, formatShortName } from "@/lib/format";
import type { RetailContractBrief } from "@/lib/types";

function statusTone(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "completed") return "success";
  if (status === "overdue") return "danger";
  if (status === "active") return "warning";
  return "default";
}

function statusText(status: string): string {
  if (status === "completed") return "Завершён";
  if (status === "overdue") return "Просрочен";
  if (status === "active") return "Активен";
  if (status === "cancelled") return "Отменён";
  return status;
}

export default function RetailContractsPage() {
  const [contracts, setContracts] = useState<RetailContractBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setContracts(await retailApi.listContracts(filter || undefined));
    } catch (err) {
      setContracts([]);
      setError(err instanceof ApiRequestError ? err.message : "Не удалось загрузить договоры");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState text="Загрузка договоров..." />;

  return (
    <div className="page-stack">
      <PageHeader
        title="Договоры"
        subtitle="Каждый договор привязан к инвестору"
        action={
          <Select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="w-auto"
          >
            <option value="">Все статусы</option>
            <option value="active">Активные</option>
            <option value="overdue">Просроченные</option>
            <option value="completed">Завершённые</option>
          </Select>
        }
      />

      {error ? (
        <Card variant="accent">
          <p className="text-sm text-status-danger-text">{error}</p>
          <Button type="button" className="mt-3" onClick={() => void load()}>
            Повторить
          </Button>
        </Card>
      ) : null}

      <Card>
        {contracts.length === 0 ? (
          <EmptyState>{error ? "Список недоступен" : "Договоров пока нет"}</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table table-cards">
              <thead>
                <tr>
                  <th>Клиент</th>
                  <th>Товар</th>
                  <th>Инвестор</th>
                  <th>Срок</th>
                  <th>Закупка</th>
                  <th>К возврату</th>
                  <th>Получено</th>
                  <th>Прибыль</th>
                  <th>Остаток</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Клиент">
                      <div>
                        <Link
                          href={`/retail/clients/${item.retail_client_id}`}
                          className="link-brand font-medium"
                        >
                          {formatShortName(item.client_name)}
                        </Link>
                        <p className="text-xs text-muted">{formatDate(item.contract_date)}</p>
                      </div>
                    </td>
                    <td data-label="Товар">
                      <Link href={`/retail/contracts/${item.id}`} className="link-brand">
                        {item.product_name}
                      </Link>
                    </td>
                    <td data-label="Инвестор">{item.investor_name}</td>
                    <td data-label="Срок">{item.term_months} мес.</td>
                    <td data-label="Закупка">{formatMoney(item.purchase_price)}</td>
                    <td data-label="К возврату">{formatMoney(item.total_amount)}</td>
                    <td data-label="Получено">{formatMoney(item.collected_total)}</td>
                    <td data-label="Прибыль">{formatMoney(item.collected_profit)}</td>
                    <td data-label="Остаток">{formatMoney(item.remainder_total)}</td>
                    <td data-label="Статус">
                      <Badge tone={statusTone(item.status)}>{statusText(item.status)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
