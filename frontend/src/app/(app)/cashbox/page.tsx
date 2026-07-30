"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  PageHeader,
  SectionTitle,
  StatCard,
  Toast,
} from "@/components/ui";
import {
  ApiRequestError,
  cashboxApi,
  documentCollectionApi,
  mandatoryPaymentsApi,
  paymentsApi,
} from "@/lib/api-client";
import { formatDate, formatMoney, formatMonthLabel, formatShortName, statusLabel } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { CashboxOverview } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

type CashboxTab = "schedule" | "collection" | "mandatory";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CashboxPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [month, setMonth] = useState(currentMonth);
  const [paymentDate, setPaymentDate] = useState(todayIso);
  const [data, setData] = useState<CashboxOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [tab, setTab] = useState<CashboxTab>("schedule");
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  const isOwner = user?.role === "owner";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await cashboxApi.overview(month));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось загрузить кассу");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    if (user && !isOwner) {
      router.replace("/");
      return;
    }
    if (isOwner) void load();
  }, [isOwner, load, router, user]);

  const tabs = useMemo(
    () =>
      [
        { id: "schedule" as const, label: "Рассрочка", count: data?.schedule_totals.count ?? 0 },
        { id: "collection" as const, label: "Сбор документов", count: data?.collection_totals.count ?? 0 },
        { id: "mandatory" as const, label: "Обязательные", count: data?.mandatory_totals.count ?? 0 },
      ],
    [data],
  );

  async function runAction(key: string, action: () => Promise<unknown>, successText: string) {
    setSavingId(key);
    try {
      await action();
      setToast({ message: successText, tone: "success" });
      await load();
    } catch (err) {
      setToast({
        message: err instanceof ApiRequestError ? err.message : "Не удалось записать платёж",
        tone: "error",
      });
    } finally {
      setSavingId(null);
    }
  }

  if (!isOwner) return <LoadingState text="Перенаправление..." />;

  return (
    <div className="page-groups">
      <PageHeader
        title="Касса"
        subtitle="Всё, что осталось получить, в одном списке — без захода в карточки"
        action={
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value || currentMonth())}
            className="w-[150px]"
          />
        }
      />

      {error && <p className="alert-danger">{error}</p>}

      {loading || !data ? (
        <LoadingState text="Загрузка кассы..." />
      ) : (
        <>
          <div className="page-group">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <StatCard label={`Собрано за ${formatMonthLabel(month)}`} value={formatMoney(data.collected_in_month)} />
              <StatCard label="Осталось получить" value={formatMoney(data.expected_total)} tone="warning" />
              <StatCard label="Платежей в очереди" value={data.schedule_totals.count} />
              <StatCard
                label="Из них просрочено"
                value={data.overdue_count}
                tone={data.overdue_count > 0 ? "danger" : "success"}
              />
            </div>
          </div>

          <div className="page-group">
            <Card>
              <SectionTitle
                title="Очередь поступлений"
                description="Дата платежа применяется ко всем записям на этой странице."
                action={
                  <Input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-[150px]"
                  />
                }
              />

              <div className="mb-2 flex flex-wrap gap-1.5">
                {tabs.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={cn(
                      "interactive rounded-md border px-2.5 py-1 text-xs font-medium",
                      tab === item.id
                        ? "border-brand-600 bg-brand-50 text-brand-800"
                        : "border-border bg-surface text-muted hover:bg-surface-muted",
                    )}
                  >
                    {item.label}
                    <span className="ml-1.5 text-[11px] opacity-70">{item.count}</span>
                  </button>
                ))}
              </div>

              {tab === "schedule" &&
                (data.schedule_items.length === 0 ? (
                  <EmptyState>Все платежи по рассрочке за этот период получены.</EmptyState>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="data-table table-cards">
                      <thead>
                        <tr>
                          <th>Клиент</th>
                          <th>Месяц</th>
                          <th>Срок</th>
                          <th className="text-right">План</th>
                          <th className="text-right">Остаток</th>
                          <th className="text-right">Действие</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.schedule_items.map((item) => (
                          <tr key={item.schedule_id}>
                            <td data-label="Клиент">
                              <Link href={`/clients/${item.client_id}`} className="link-brand font-medium">
                                {formatShortName(item.client_name)}
                              </Link>
                              <div className="type-hint">{item.phone}</div>
                            </td>
                            <td data-label="Месяц">
                              <div className="flex flex-wrap items-center gap-1">
                                <span>№{item.month_number}</span>
                                {item.is_overdue && (
                                  <Badge tone="danger">Просрочка {item.overdue_days} дн.</Badge>
                                )}
                                {item.is_deferred && <Badge tone="warning">Отсрочен</Badge>}
                              </div>
                            </td>
                            <td data-label="Срок">{formatDate(item.due_date)}</td>
                            <td data-label="План" className="text-right">
                              {formatMoney(item.planned_amount)}
                            </td>
                            <td data-label="Остаток" className="text-right font-medium">
                              {formatMoney(item.remainder)}
                            </td>
                            <td data-label="Действие" className="text-right">
                              <Button
                                size="sm"
                                disabled={savingId === item.schedule_id}
                                onClick={() =>
                                  runAction(
                                    item.schedule_id,
                                    () =>
                                      paymentsApi.create({
                                        client_id: item.client_id,
                                        payment_schedule_id: item.schedule_id,
                                        amount: item.remainder,
                                        payment_date: paymentDate,
                                        comment: "Внесено из кассы",
                                      }),
                                    `Платёж ${formatMoney(item.remainder)} записан`,
                                  )
                                }
                              >
                                {savingId === item.schedule_id ? "..." : "Оплатить"}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}

              {tab === "collection" &&
                (data.collection_items.length === 0 ? (
                  <EmptyState>Все сборы документов оплачены.</EmptyState>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="data-table table-cards">
                      <thead>
                        <tr>
                          <th>Клиент</th>
                          <th>Договор</th>
                          <th>Ожидает</th>
                          <th className="text-right">К оплате</th>
                          <th className="text-right">Действие</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.collection_items.map((item) => (
                          <tr key={item.client_id}>
                            <td data-label="Клиент">
                              <Link href={`/clients/${item.client_id}`} className="link-brand font-medium">
                                {formatShortName(item.client_name)}
                              </Link>
                              <div className="type-hint">{item.phone}</div>
                            </td>
                            <td data-label="Договор">{formatDate(item.contract_date)}</td>
                            <td data-label="Ожидает">
                              {item.waiting_days > 30 ? (
                                <Badge tone="warning">{item.waiting_days} дн.</Badge>
                              ) : (
                                <span>{item.waiting_days} дн.</span>
                              )}
                            </td>
                            <td data-label="К оплате" className="text-right font-medium">
                              {formatMoney(item.total_amount)}
                            </td>
                            <td data-label="Действие" className="text-right">
                              <Button
                                size="sm"
                                disabled={savingId === item.client_id}
                                onClick={() =>
                                  runAction(
                                    item.client_id,
                                    () => documentCollectionApi.recordPayment(item.client_id, paymentDate),
                                    `Сбор документов по ${formatShortName(item.client_name)} зафиксирован`,
                                  )
                                }
                              >
                                {savingId === item.client_id ? "..." : "Оплачено"}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}

              {tab === "mandatory" &&
                (data.mandatory_items.length === 0 ? (
                  <EmptyState>
                    Обязательных платежей к получению нет. Плановые суммы задаются в карточке клиента.
                  </EmptyState>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="data-table table-cards">
                      <thead>
                        <tr>
                          <th>Клиент</th>
                          <th>Платёж</th>
                          <th className="text-right">План</th>
                          <th className="text-right">Остаток</th>
                          <th className="text-right">Действие</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.mandatory_items.map((item) => (
                          <tr key={item.mandatory_payment_id}>
                            <td data-label="Клиент">
                              <Link href={`/clients/${item.client_id}`} className="link-brand font-medium">
                                {formatShortName(item.client_name)}
                              </Link>
                              <div className="type-hint">{item.phone}</div>
                            </td>
                            <td data-label="Платёж">{statusLabel(item.payment_type)}</td>
                            <td data-label="План" className="text-right">
                              {formatMoney(item.planned_amount)}
                            </td>
                            <td data-label="Остаток" className="text-right font-medium">
                              {formatMoney(item.remainder)}
                            </td>
                            <td data-label="Действие" className="text-right">
                              <Button
                                size="sm"
                                disabled={savingId === item.mandatory_payment_id}
                                onClick={() =>
                                  runAction(
                                    item.mandatory_payment_id,
                                    () =>
                                      mandatoryPaymentsApi.record(
                                        item.client_id,
                                        item.mandatory_payment_id,
                                        { amount: item.remainder, payment_date: paymentDate },
                                      ),
                                    `Платёж ${formatMoney(item.remainder)} записан`,
                                  )
                                }
                              >
                                {savingId === item.mandatory_payment_id ? "..." : "Внести"}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
            </Card>
          </div>
        </>
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  );
}
