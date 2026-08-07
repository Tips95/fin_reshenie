"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageHeader,
} from "@/components/ui";
import { ApiRequestError, retailApi } from "@/lib/api-client";
import { formatMoney, formatShortName } from "@/lib/format";
import type { RetailClient } from "@/lib/types";
import { canManageRetailDeals, isRetailOwner } from "@/lib/retail-access";
import { useAuth } from "@/modules/auth/AuthProvider";

export default function RetailClientsPage() {
  const { user } = useAuth();
  const isOwner = isRetailOwner(user);
  const canCreateDeal = canManageRetailDeals(user);
  const [clients, setClients] = useState<RetailClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setClients(await retailApi.listClients());
      } catch {
        setClients([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleDeleteClient(clientId: string, clientName: string) {
    if (
      !window.confirm(
        `Удалить клиента «${clientName}» и все договоры без возможности восстановления?`,
      )
    ) {
      return;
    }
    if (!window.confirm("Подтвердите окончательное удаление.")) {
      return;
    }

    setDeletingClientId(clientId);
    setError(null);
    try {
      await retailApi.deleteClient(clientId);
      setClients((current) => current.filter((item) => item.id !== clientId));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось удалить клиента");
    } finally {
      setDeletingClientId(null);
    }
  }

  if (loading) return <LoadingState text="Загрузка клиентов..." />;

  return (
    <div className="page-stack">
      <PageHeader
        title={user?.role === "investor" ? "Мои клиенты" : "Клиенты"}
        subtitle="Новый клиент оформляется только вместе с договором — через «Новая сделка»"
        action={
          canCreateDeal ? (
            <Link href="/retail/deals/new">
              <Button>Новая сделка</Button>
            </Link>
          ) : undefined
        }
      />

      {error && <p className="text-sm text-status-danger-text">{error}</p>}

      <Card>
        {clients.length === 0 ? (
          <EmptyState>
            {canCreateDeal ? (
              <>
                Клиентов пока нет.{" "}
                <Link href="/retail/deals/new" className="link-brand font-semibold">
                  Оформите первую сделку
                </Link>
                .
              </>
            ) : (
              "Пока нет клиентов по вашим договорам."
            )}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table table-cards">
              <thead>
                <tr>
                  <th>ФИО</th>
                  <th>Телефон</th>
                  <th className="text-right">Закупка</th>
                  <th className="text-right">К возврату</th>
                  <th className="text-right">Получено</th>
                  <th className="text-right">Прибыль</th>
                  <th>Договоров</th>
                  {isOwner && <th>Действие</th>}
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td data-label="ФИО">
                      <Link href={`/retail/clients/${client.id}`} className="link-brand font-medium">
                        {formatShortName(client.full_name)}
                      </Link>
                    </td>
                    <td data-label="Телефон">{client.phone}</td>
                    <td data-label="Закупка" className="text-right tabular-nums">
                      {formatMoney(client.purchase_total)}
                    </td>
                    <td data-label="К возврату" className="text-right tabular-nums">
                      {formatMoney(client.revenue_total)}
                    </td>
                    <td data-label="Получено" className="text-right tabular-nums text-status-success-text">
                      {formatMoney(client.collected_total)}
                    </td>
                    <td data-label="Прибыль" className="text-right tabular-nums">
                      {formatMoney(client.collected_profit)}
                    </td>
                    <td data-label="Договоров">{client.contracts_count}</td>
                    {isOwner && (
                      <td data-label="Действие">
                        <Button
                          type="button"
                          variant="danger"
                          disabled={deletingClientId === client.id}
                          onClick={() => handleDeleteClient(client.id, client.full_name)}
                        >
                          {deletingClientId === client.id ? "..." : "Удалить"}
                        </Button>
                      </td>
                    )}
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
