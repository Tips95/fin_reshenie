"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  Badge,
  Button,
  Input,
  LoadingState,
  PageHeader,
  Panel,
  StatCard,
} from "@/components/ui";
import { ApiRequestError, dashboardApi } from "@/lib/api-client";
import {
  collectionCallResultLabel,
  formatDate,
  formatMoney,
  formatMonthLabel,
  formatShortName,
  todayIsoDate,
} from "@/lib/format";
import type { CollectorDashboard as CollectorDashboardData } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";
import { PaymentRemindersModal } from "@/modules/overdues/PaymentRemindersModal";

function currentMonthKey(): string {
  return todayIsoDate().slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number);
  const date = new Date(year, mon - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const LINK = "interactive text-[13px] font-semibold text-brand-700 hover:text-brand-600";

export function CollectorDashboard() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentMonthKey);
  const [data, setData] = useState<CollectorDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [remindersOpen, setRemindersOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const summary = await dashboardApi.collector(month);
      setData(summary);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось загрузить дашборд");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) return <LoadingState text="Загрузка дашборда..." />;
  if (!data) {
    return (
      <div className="page-stack">
        <PageHeader title="Дашборд" subtitle={user?.full_name ?? "Коллектор"} />
        {error ? <p className="alert-danger">{error}</p> : null}
        <Button variant="secondary" onClick={() => void load()}>
          Повторить
        </Button>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Дашборд"
        subtitle={`${user?.full_name ?? "Коллектор"} · ${formatMonthLabel(data.period_month)}`}
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setMonth((value) => shiftMonth(value, -1))}
            >
              ←
            </Button>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-[10.5rem]"
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setMonth((value) => shiftMonth(value, 1))}
            >
              →
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading}>
              Обновить
            </Button>
            <Button size="sm" onClick={() => setRemindersOpen(true)}>
              WhatsApp
            </Button>
          </div>
        }
      />

      <PaymentRemindersModal
        open={remindersOpen}
        onClose={() => setRemindersOpen(false)}
        month={month}
      />

      {error ? <p className="alert-danger">{error}</p> : null}

      <div className="space-y-4">
        <div>
          <p className="type-caption">Выбранный месяц</p>
          <p className="mb-2 text-xs text-muted">
            Срок платежа в этом месяце. Старая просрочка сюда не входит и с этой суммой не складывается.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <StatCard
              label="Ожидается по графику месяца"
              value={formatMoney(data.expected_this_month)}
              tone="brand"
              hint="Ещё не оплачено, срок в выбранном месяце"
            />
            <StatCard
              label="Уже собрано в месяце"
              value={formatMoney(data.collected_this_month)}
              tone="success"
              hint="Фактически поступило"
            />
          </div>
        </div>
        <div>
          <p className="type-caption">Уже просрочено на сегодня</p>
          <p className="mb-2 text-xs text-muted">
            Отдельная сумма: долги прошлых месяцев. К «ожидается по графику» её не прибавляют.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <StatCard
              label="Просрочка"
              value={formatMoney(data.overdue_amount)}
              tone="danger"
              hint={`${data.clients_overdue} клиент. · не часть месяца`}
            />
            <StatCard
              label="Обещал сегодня"
              value={String(data.promised_today_count)}
              tone={data.promised_today_count > 0 ? "warning" : "default"}
            />
            <StatCard
              label="Без контакта"
              value={String(data.no_contact_count)}
              tone={data.no_contact_count > 0 ? "warning" : "default"}
              hint="Просрочка без звонка"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel
          title="К оплате в этом месяце"
          description="Только срок в выбранном месяце. Просрочка прошлых месяцев в этом списке не сидит."
          action={
            <Link href="/clients/contracts" className={LINK}>
              Договоры
            </Link>
          }
        >
          {data.due_this_month_preview.length === 0 ? (
            <p className="text-sm text-muted">В этом месяце ожиданий нет.</p>
          ) : (
            <div className="space-y-2">
              {data.due_this_month_preview.map((item) => (
                <div
                  key={item.payment_schedule_id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/clients/${item.client_id}?tab=payments`}
                      className="text-sm font-semibold text-foreground hover:text-brand-700"
                    >
                      {formatShortName(item.full_name)}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted">
                      <a href={`tel:${item.phone}`} className="link-brand">
                        {item.phone}
                      </a>
                      {" · "}мес. {item.month_number} · до {formatDate(item.due_date)}
                    </p>
                  </div>
                  <p className="tabular text-sm font-semibold text-foreground">
                    {formatMoney(item.remainder)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Обещал сегодня"
          description="Дата обещанной оплаты наступила"
          dot="danger"
          action={
            <Link href="/overdues" className={LINK}>
              Очередь
            </Link>
          }
        >
          {data.promised_today_preview.length === 0 ? (
            <p className="text-sm text-muted">На сегодня обещаний нет.</p>
          ) : (
            <div className="space-y-2">
              {data.promised_today_preview.map((item) => (
                <div
                  key={item.payment_schedule_id}
                  className="rounded-md border border-status-danger-border bg-status-danger-bg/40 px-2.5 py-2"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <Link
                      href={`/clients/${item.client_id}?tab=payments`}
                      className="text-sm font-semibold text-foreground hover:text-brand-700"
                    >
                      {formatShortName(item.full_name)}
                    </Link>
                    <p className="tabular text-sm font-semibold text-status-danger-text">
                      {formatMoney(item.overdue_amount)}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    <a href={`tel:${item.phone}`} className="link-brand">
                      {item.phone}
                    </a>
                    {" · "}обещал {formatDate(item.promised_pay_date)}
                  </p>
                  {item.manager_note?.trim() ? (
                    <p className="mt-1 line-clamp-2 text-xs text-foreground">{item.manager_note}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Просрочки"
        description={`${data.clients_overdue} клиент. · ${formatMoney(data.overdue_amount)}`}
        dot="danger"
        action={
          <Link href="/overdues" className={LINK}>
            Все
          </Link>
        }
      >
        {data.overdue_preview.length === 0 ? (
          <p className="alert-success">Просроченных платежей нет.</p>
        ) : (
          <div className="space-y-2">
            {data.overdue_preview.map((item) => (
              <div
                key={item.client_id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border px-2.5 py-2"
              >
                <div className="min-w-0">
                  <Link
                    href={`/clients/${item.client_id}?tab=payments`}
                    className="text-sm font-semibold text-foreground hover:text-brand-700"
                  >
                    {formatShortName(item.full_name)}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted">
                    <a href={`tel:${item.phone}`} className="link-brand">
                      {item.phone}
                    </a>
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Badge tone="danger">{item.overdue_days} дн.</Badge>
                    {item.last_call_result ? (
                      <Badge tone="default">
                        {collectionCallResultLabel(item.last_call_result)}
                      </Badge>
                    ) : (
                      <Badge tone="warning">Без контакта</Badge>
                    )}
                    {item.promised_pay_date ? (
                      <Badge tone="warning">обещал {formatDate(item.promised_pay_date)}</Badge>
                    ) : null}
                  </div>
                </div>
                <p className="tabular text-sm font-semibold text-status-danger-text">
                  {formatMoney(item.overdue_amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
