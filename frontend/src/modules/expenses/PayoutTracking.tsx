"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

import {
  Badge,
  Button,
  EmptyState,
  LoadingState,
  Metric,
  MetricStrip,
  Panel,
  ProgressBar,
} from "@/components/ui";
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Получатель выплаты: сводка в одну строку, по клику — построчная таблица. */
export function PayeeRow({
  name,
  meta,
  toPay,
  paid,
  total,
  open,
  onToggle,
  action,
  children,
}: {
  name: string;
  meta: string;
  toPay: string;
  paid: string;
  total: string;
  open: boolean;
  onToggle: () => void;
  action: ReactNode;
  children: ReactNode;
}) {
  const totalNumber = Number(total);
  const paidShare = totalNumber > 0 ? (Number(paid) / totalNumber) * 100 : 0;
  const settled = Number(toPay) <= 0;

  return (
    <div className="payee-row" data-open={open}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-3.5 py-3">
        <button
          type="button"
          className="interactive flex min-w-[200px] flex-1 items-center gap-3 text-left"
          onClick={onToggle}
          aria-expanded={open}
        >
          <span className="payee-avatar">{initials(name)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
            <span className="mt-1 flex items-center gap-2">
              <span className="w-24 shrink-0">
                <ProgressBar value={paidShare} tone={settled ? "success" : "warning"} />
              </span>
              <span className="type-hint truncate">{meta}</span>
            </span>
          </span>
          <span
            className={cn("collapsible-chevron mt-0 text-xs", open && "rotate-180")}
            aria-hidden
          >
            ▼
          </span>
        </button>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p
              className={cn(
                "tabular text-sm font-semibold",
                settled ? "text-status-success-text" : "text-foreground",
              )}
            >
              {settled ? formatMoney(paid) : formatMoney(toPay)}
            </p>
            <p className="type-hint">{settled ? "выплачено" : "к выдаче"}</p>
          </div>
          {action}
        </div>
      </div>
      {open ? <div className="border-t border-border px-3.5 py-3">{children}</div> : null}
    </div>
  );
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
      <Panel
        id="civil-shares"
        dot="success"
        title={`Гражданка · доли за ${monthLabel}`}
        description="Сам заключил и исполнил — 40% цены. Передал исполнителю — 20% менеджеру и 20% исполнителю. Месяц — по дате обращения."
      >
        {loading ? (
          <LoadingState text="Загрузка долей..." />
        ) : civil ? (
          <>
            <MetricStrip columns={3}>
              <Metric
                label="К выдаче"
                value={formatMoney(civil.to_pay_amount)}
                tone="warning"
                hint={`${civil.cases_count} дел · всего невыплачено ${formatMoney(civil.outstanding_to_pay_amount)}`}
              />
              <Metric label="Выплачено" value={formatMoney(civil.paid_amount)} tone="success" />
              <Metric label="Начислено за месяц" value={formatMoney(civil.total_amount)} />
            </MetricStrip>
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
                    <PayeeRow
                      key={row.payee_id}
                      name={row.payee_name}
                      meta={`${row.lines_count} дел · выплачено ${formatMoney(row.paid_amount)} из ${formatMoney(row.total_amount)}`}
                      toPay={row.to_pay_amount}
                      paid={row.paid_amount}
                      total={row.total_amount}
                      open={open}
                      onToggle={() =>
                        setExpanded((prev) => ({ ...prev, [row.payee_id]: !prev[row.payee_id] }))
                      }
                      action={
                        unpaid.length > 0 ? (
                          <Button
                            type="button"
                            disabled={busy}
                            onClick={() => onMarkPayee(row.payee_id, unpaid, true)}
                          >
                            {markingPayeeId === row.payee_id ? "…" : "Выплатить всё"}
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
                                    <span className="tabular mt-0.5 block text-muted">
                                      {formatDate(line.appeal_date)} · цена {formatMoney(line.price)}
                                    </span>
                                  </td>
                                  <td data-label="Доля">
                                    {shareRoleLabel(line.role)} · {line.share_label}
                                  </td>
                                  <td data-label="Сумма" className="tabular text-right font-medium">
                                    {formatMoney(line.amount)}
                                  </td>
                                  <td data-label="Статус">
                                    <Badge tone={line.collected ? "success" : "warning"}>
                                      {line.collected ? "Выплачено" : "К выдаче"}
                                    </Badge>
                                  </td>
                                  <td data-label="Действие" className="text-right">
                                    <Button
                                      type="button"
                                      size="sm"
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
                    </PayeeRow>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <EmptyState>Не удалось загрузить доли по гражданским делам</EmptyState>
        )}
      </Panel>

      <Panel
        id="deposit-fin"
        dot="warning"
        title={`Депозит и фин. управление · ${monthLabel}`}
        description="Сколько отдано по клиентам. Эти суммы по-прежнему вычитаются из прибыли, здесь их видно по месяцам."
      >
        {loading ? (
          <LoadingState text="Загрузка выплат..." />
        ) : outflows ? (
          <>
            <MetricStrip columns={3}>
              <Metric label="Депозит" value={formatMoney(outflows.deposit)} tone="warning" />
              <Metric
                label="Фин. управление"
                value={formatMoney(outflows.financial_management)}
                tone="warning"
              />
              <Metric label="Всего за месяц" value={formatMoney(outflows.total)} />
            </MetricStrip>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <div>
                <p className="type-caption mb-2">По месяцам</p>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="data-table table-cards text-xs">
                    <thead>
                      <tr>
                        <th>Месяц</th>
                        <th className="text-right">Депозит</th>
                        <th className="text-right">Фин. упр.</th>
                        <th className="text-right">Итого</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((row) => (
                        <tr
                          key={row.month}
                          className={cn(row.month === month && "bg-surface-muted font-semibold")}
                        >
                          <td data-label="Месяц" className="text-foreground first-letter:uppercase">
                            {formatMonthLabel(row.month)}
                          </td>
                          <td data-label="Депозит" className="tabular text-right">
                            {formatMoney(row.deposit)}
                          </td>
                          <td data-label="Фин. управление" className="tabular text-right">
                            {formatMoney(row.financial_management)}
                          </td>
                          <td data-label="Итого" className="tabular text-right font-semibold">
                            {formatMoney(row.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <p className="type-caption mb-2">Платежи за {monthLabel}</p>
                {outflows.items.length === 0 ? (
                  <EmptyState>За этот месяц выплат на депозит и фин. управление нет</EmptyState>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
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
                            <td data-label="Статья">
                              <Badge tone={item.payment_type === "deposit" ? "warning" : "default"}>
                                {outflowLabel(item.payment_type)}
                              </Badge>
                            </td>
                            <td data-label="Сумма" className="tabular text-right font-medium">
                              {formatMoney(item.amount)}
                            </td>
                            <td data-label="Дата" className="tabular text-muted">
                              {formatDate(item.payment_date)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <EmptyState>Не удалось загрузить депозит и фин. управление</EmptyState>
        )}
      </Panel>
    </>
  );
}
