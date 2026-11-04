"use client";

import { useState } from "react";
import Link from "next/link";

import { Badge, Button, Card, EmptyState, LoadingState, SectionTitle, StatCard } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate, formatMoney, formatMonthLabel, formatShortName } from "@/lib/format";
import type {
  CivilShareLine,
  CivilShareRole,
  CivilSharesOverview,
  MandatoryOutflowsOverview,
} from "@/lib/types";

function shareRoleLabel(role: CivilShareRole): string {
  if (role === "both") return "Заключил и исполнил";
  if (role === "executor") return "Исполнил";
  return "Заключил";
}

function outflowLabel(type: "deposit" | "financial_management"): string {
  return type === "deposit" ? "Депозит" : "Фин. управление";
}

export function PayoutTracking({
  month,
  loading,
  civil,
  outflows,
  markingLineKey,
  markingPayeeId,
  onMarkLine,
  onMarkPayee,
}: {
  month: string;
  loading: boolean;
  civil: CivilSharesOverview | null;
  outflows: MandatoryOutflowsOverview | null;
  markingLineKey: string | null;
  markingPayeeId: string | null;
  onMarkLine: (line: CivilShareLine, collected: boolean) => void;
  onMarkPayee: (payeeId: string, lines: CivilShareLine[], collected: boolean) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const monthLabel = formatMonthLabel(month);
  const history = [...(outflows?.history ?? [])].reverse();

  return (
    <>
      <Card variant="accent" id="civil-shares">
        <SectionTitle
          title={`Гражданка · доли за ${monthLabel}`}
          description="Сам заключил и исполнил — 40% цены. Перевёл исполнителю — 20% менеджеру и 20% исполнителю. Месяц считается по дате обращения"
        />
        {loading ? (
          <LoadingState text="Загрузка долей..." />
        ) : civil ? (
          <>
            <div className="mb-3 grid gap-2 sm:grid-cols-3">
              <StatCard
                label="К выдаче"
                value={formatMoney(civil.to_pay_amount)}
                tone="warning"
                hint={`${civil.cases_count} дел · всего невыплачено ${formatMoney(civil.outstanding_to_pay_amount)}`}
              />
              <StatCard label="Выплачено" value={formatMoney(civil.paid_amount)} tone="success" />
              <StatCard label="Всего за месяц" value={formatMoney(civil.total_amount)} tone="brand" />
            </div>
            {civil.payees.length === 0 ? (
              <EmptyState>За этот месяц нет гражданских дел с долей к выплате</EmptyState>
            ) : (
              <div className="space-y-2">
                {civil.payees.map((row) => {
                  const open = Boolean(expanded[row.payee_id]);
                  const unpaid = row.lines.filter((line) => !line.collected);
                  const busy =
                    markingPayeeId === row.payee_id ||
                    row.lines.some((line) => markingLineKey === `${line.case_id}:${line.role}`);
                  return (
                    <div key={row.payee_id} className="rounded-md border border-border bg-surface-muted/40">
                      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                        <button
                          type="button"
                          className="link-brand text-left text-sm font-semibold"
                          onClick={() =>
                            setExpanded((prev) => ({ ...prev, [row.payee_id]: !prev[row.payee_id] }))
                          }
                          aria-expanded={open}
                        >
                          {row.payee_name}
                          <span className="ml-1.5 font-normal text-muted">
                            {open ? "▾" : "▸"} {row.lines_count} · к выдаче {formatMoney(row.to_pay_amount)}
                          </span>
                        </button>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {unpaid.length > 0 ? (
                            <Button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                if (!open) {
                                  setExpanded((prev) => ({ ...prev, [row.payee_id]: true }));
                                }
                                onMarkPayee(row.payee_id, unpaid, true);
                              }}
                            >
                              {markingPayeeId === row.payee_id
                                ? "…"
                                : `Выплатить всё · ${formatMoney(row.to_pay_amount)}`}
                            </Button>
                          ) : (
                            <Badge tone="success">Всё выплачено</Badge>
                          )}
                        </div>
                      </div>
                      {open ? (
                        <div className="border-t border-border px-3 py-2">
                          <div className="overflow-x-auto">
                            <table className="data-table table-cards text-xs">
                              <thead>
                                <tr>
                                  <th>Клиент</th>
                                  <th>Доля</th>
                                  <th className="text-right">Сумма</th>
                                  <th>Статус</th>
                                  <th />
                                </tr>
                              </thead>
                              <tbody>
                                {row.lines.map((line) => {
                                  const lineKey = `${line.case_id}:${line.role}`;
                                  return (
                                    <tr key={lineKey}>
                                      <td data-label="Клиент">
                                        <Link href={`/civil-cases/${line.case_id}`} className="link-brand">
                                          {formatShortName(line.client_name)}
                                        </Link>
                                        <span className="mt-0.5 block text-muted">
                                          {formatDate(line.appeal_date)} · цена {formatMoney(line.price)}
                                        </span>
                                      </td>
                                      <td data-label="Доля">
                                        {shareRoleLabel(line.role)} · {line.share_label}
                                      </td>
                                      <td data-label="Сумма" className="text-right font-medium">
                                        {formatMoney(line.amount)}
                                      </td>
                                      <td data-label="Статус">
                                        <Badge tone={line.collected ? "success" : "warning"}>
                                          {line.collected ? "Выплачено" : "К выдаче"}
                                        </Badge>
                                      </td>
                                      <td>
                                        <Button
                                          type="button"
                                          variant={line.collected ? "ghost" : "secondary"}
                                          disabled={busy}
                                          onClick={() => onMarkLine(line, !line.collected)}
                                        >
                                          {markingLineKey === lineKey
                                            ? "…"
                                            : line.collected
                                              ? "Снять"
                                              : "Выплатить"}
                                        </Button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <EmptyState>Не удалось загрузить доли по гражданским делам</EmptyState>
        )}
      </Card>

      <Card variant="accent" id="deposit-fin">
        <SectionTitle
          title={`Депозит и фин. управление · ${monthLabel}`}
          description="Сколько уже отдано по клиентам. Эти суммы по-прежнему вычитаются из прибыли, здесь их видно по месяцам"
        />
        {loading ? (
          <LoadingState text="Загрузка выплат..." />
        ) : outflows ? (
          <>
            <div className="mb-3 grid gap-2 sm:grid-cols-3">
              <StatCard label="Депозит" value={formatMoney(outflows.deposit)} tone="warning" />
              <StatCard
                label="Фин. управление"
                value={formatMoney(outflows.financial_management)}
                tone="warning"
              />
              <StatCard label="Вместе за месяц" value={formatMoney(outflows.total)} tone="brand" />
            </div>
            <div className="overflow-x-auto">
              <table className="data-table table-cards text-xs">
                <thead>
                  <tr>
                    <th>Месяц</th>
                    <th className="text-right">Депозит</th>
                    <th className="text-right">Фин. управление</th>
                    <th className="text-right">Итого</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.month} className={cn(row.month === month && "bg-status-success-bg/40")}>
                      <td data-label="Месяц" className="font-medium text-foreground">
                        {formatMonthLabel(row.month)}
                      </td>
                      <td data-label="Депозит" className="text-right">
                        {formatMoney(row.deposit)}
                      </td>
                      <td data-label="Фин. управление" className="text-right">
                        {formatMoney(row.financial_management)}
                      </td>
                      <td data-label="Итого" className="text-right font-semibold">
                        {formatMoney(row.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3">
              {outflows.items.length === 0 ? (
                <EmptyState>За этот месяц выплат на депозит и фин. управление нет</EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-table table-cards text-xs">
                    <thead>
                      <tr>
                        <th>Клиент</th>
                        <th>Статья</th>
                        <th className="text-right">Сумма</th>
                        <th>Дата</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outflows.items.map((item, index) => (
                        <tr key={`${item.client_id}:${item.payment_type}:${item.payment_date}:${index}`}>
                          <td data-label="Клиент">
                            <Link href={`/clients/${item.client_id}`} className="link-brand">
                              {formatShortName(item.client_name)}
                            </Link>
                          </td>
                          <td data-label="Статья">{outflowLabel(item.payment_type)}</td>
                          <td data-label="Сумма" className="text-right font-medium">
                            {formatMoney(item.amount)}
                          </td>
                          <td data-label="Дата">{formatDate(item.payment_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          <EmptyState>Не удалось загрузить депозит и фин. управление</EmptyState>
        )}
      </Card>
    </>
  );
}
