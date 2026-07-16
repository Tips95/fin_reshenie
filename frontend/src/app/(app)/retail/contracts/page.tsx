"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Badge, Card, LoadingState, PageHeader } from "@/components/ui";
import { retailApi } from "@/lib/api-client";
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
  const [filter, setFilter] = useState("");

  useEffect(() => {
    retailApi
      .listContracts(filter || undefined)
      .then(setContracts)
      .catch(() => setContracts([]))
      .finally(() => setLoading(false));
  }, [filter]);

  if (loading) return <LoadingState text="Загрузка договоров..." />;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Договоры"
        subtitle="Каждый договор привязан к инвестору"
        action={
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">Все статусы</option>
            <option value="active">Активные</option>
            <option value="overdue">Просроченные</option>
            <option value="completed">Завершённые</option>
          </select>
        }
      />

      <Card>
        {contracts.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">Договоров пока нет</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Клиент</th>
                  <th>Товар</th>
                  <th>Инвестор</th>
                  <th>Срок</th>
                  <th>Итого</th>
                  <th>Получено</th>
                  <th>Остаток</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/retail/contracts/${item.id}`} className="font-semibold text-emerald-700">
                        {formatShortName(item.client_name)}
                      </Link>
                      <p className="text-xs text-slate-500">{formatDate(item.contract_date)}</p>
                    </td>
                    <td>{item.product_name}</td>
                    <td>{item.investor_name}</td>
                    <td>{item.term_months} мес.</td>
                    <td>{formatMoney(item.total_amount)}</td>
                    <td>{formatMoney(item.collected_total)}</td>
                    <td>{formatMoney(item.remainder_total)}</td>
                    <td>
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
