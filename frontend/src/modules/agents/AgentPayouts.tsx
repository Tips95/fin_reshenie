"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Badge, Button, EmptyState, Metric, MetricStrip, Panel } from "@/components/ui";
import { ApiRequestError, agentsApi } from "@/lib/api-client";
import { formatDate, formatMoney, formatMonthLabel, formatShortName } from "@/lib/format";
import type { AgentCommissionsOverview } from "@/lib/types";
import { PayeeRow } from "@/modules/expenses/PayoutTracking";

export function AgentPayouts({ month }: { month: string }) {
  const [data, setData] = useState<AgentCommissionsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await agentsApi.commissions(month));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось загрузить выплаты агентам");
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mark(key: string, clientIds: string[], collected: boolean) {
    setBusyKey(key);
    try {
      await agentsApi.markCommissions(clientIds, collected);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось отметить выплату");
    } finally {
      setBusyKey(null);
    }
  }

  async function markAward(id: string, paid: boolean) {
    setBusyKey(id);
    try {
      await agentsApi.setAwardPaid(id, paid);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось отметить премию");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Panel
      id="agent-payouts"
      dot="brand"
      title={`Удалённые менеджеры · ${formatMonthLabel(month)}`}
      description="5 000 ₽ за клиента, который заключил договор и внёс первый платёж в этом месяце, и премия лучшему по рейтингу. Выплата по ИНН самозанятого."
    >
      {error ? <p className="alert-danger mb-2">{error}</p> : null}
      {data ? (
        <>
          <MetricStrip columns={3}>
            <Metric
              label="К выдаче"
              value={formatMoney(data.to_pay_amount)}
              tone="warning"
              hint={`${data.clients_count} клиентов · всего долг ${formatMoney(data.outstanding_to_pay_amount)}`}
            />
            <Metric label="Выплачено" value={formatMoney(data.paid_amount)} tone="success" />
            <Metric label="Начислено за месяц" value={formatMoney(data.total_amount)} />
          </MetricStrip>
          {data.awards.map((award) => (
            <div
              key={award.id}
              className="mb-2 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-muted px-3.5 py-2.5"
            >
              <span aria-hidden className="text-2xl">🏆</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Лучший месяца: {award.agent_name} · {formatMoney(award.amount)}
                </p>
                <p className="text-xs text-muted">
                  Премия за 1-е место в рейтинге ({award.points} б.) · ИНН {award.inn || "не указан"}
                  {award.paid && award.paid_at ? ` · выплачено ${formatDate(award.paid_at)}` : ""}
                </p>
              </div>
              <Badge tone={award.paid ? "success" : "warning"}>{award.paid ? "Выплачено" : "К выдаче"}</Badge>
              <Button
                type="button"
                size="sm"
                variant={award.paid ? "ghost" : "secondary"}
                disabled={busyKey === award.id}
                onClick={() => void markAward(award.id, !award.paid)}
              >
                {busyKey === award.id ? "…" : award.paid ? "Снять" : "Выплатить"}
              </Button>
            </div>
          ))}
          {data.agents.length === 0 ? (
            <EmptyState>В этом месяце клиенты от удалённых менеджеров не вносили первый платёж</EmptyState>
          ) : (
            <div className="space-y-2">
              {data.agents.map((row) => {
                const unpaidIds = row.clients.filter((item) => !item.collected).map((item) => item.client_id);
                const rowBusy = busyKey === row.agent_id || row.clients.some((item) => busyKey === item.client_id);
                return (
                  <PayeeRow
                    key={row.agent_id}
                    name={row.agent_name}
                    meta={`${row.clients_count} кл. · ИНН ${row.inn || "не указан"}`}
                    toPay={row.to_pay_amount}
                    paid={row.paid_amount}
                    total={row.total_amount}
                    open={Boolean(expanded[row.agent_id])}
                    onToggle={() =>
                      setExpanded((prev) => ({ ...prev, [row.agent_id]: !prev[row.agent_id] }))
                    }
                    action={
                      unpaidIds.length > 0 ? (
                        <Button
                          type="button"
                          disabled={rowBusy}
                          onClick={() => void mark(row.agent_id, unpaidIds, true)}
                        >
                          {busyKey === row.agent_id ? "…" : "Выплатить всё"}
                        </Button>
                      ) : (
                        <Badge tone="success">Закрыто</Badge>
                      )
                    }
                  >
                    <div className="overflow-x-auto">
                      <table className="data-table table-cards text-xs">
                        <thead>
                          <tr>
                            <th>Клиент</th>
                            <th>Договор</th>
                            <th>Первый платёж</th>
                            <th className="text-right">Сумма</th>
                            <th>Статус</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {row.clients.map((item) => (
                            <tr key={item.client_id}>
                              <td data-label="Клиент">
                                <Link href={`/clients/${item.client_id}`} className="link-brand">
                                  {formatShortName(item.client_name)}
                                </Link>
                              </td>
                              <td data-label="Договор" className="tabular text-muted">
                                {formatDate(item.contract_date)}
                              </td>
                              <td data-label="Первый платёж" className="tabular text-muted">
                                {formatDate(item.first_payment_date)}
                              </td>
                              <td data-label="Сумма" className="tabular text-right font-medium">
                                {formatMoney(item.amount)}
                              </td>
                              <td data-label="Статус">
                                <Badge tone={item.collected ? "success" : "warning"}>
                                  {item.collected ? "Выплачено" : "К выдаче"}
                                </Badge>
                              </td>
                              <td data-label="Действие" className="text-right">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={item.collected ? "ghost" : "secondary"}
                                  disabled={rowBusy}
                                  onClick={() => void mark(item.client_id, [item.client_id], !item.collected)}
                                >
                                  {busyKey === item.client_id ? "…" : item.collected ? "Снять" : "Выплатить"}
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </PayeeRow>
                );
              })}
            </div>
          )}
        </>
      ) : null}
    </Panel>
  );
}
