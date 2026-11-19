"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge, Button, DatePicker, FormField, Input, LoadingState, PageHeader } from "@/components/ui";
import { ApiRequestError, overduesApi, scheduleApi } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  collectionCallResultLabel,
  formatDate,
  formatMoney,
  formatShortName,
  todayIsoDate,
} from "@/lib/format";
import type { CollectionCallResult, OverdueQueueItem } from "@/lib/types";

const CALL_RESULTS: CollectionCallResult[] = [
  "reached",
  "promised",
  "no_answer",
  "refused",
  "other",
];

type QueueFilter = "all" | "no_contact" | "promised" | "due_today";

function addDaysIso(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysTone(days: number): "warning" | "danger" {
  return days >= 8 ? "danger" : "warning";
}

function matchesFilter(item: OverdueQueueItem, filter: QueueFilter, today: string): boolean {
  if (filter === "all") return true;
  if (filter === "no_contact") return !item.last_call_result && !item.promised_pay_date;
  if (filter === "promised") return Boolean(item.promised_pay_date);
  return item.promised_pay_date === today;
}

function matchesQuery(item: OverdueQueueItem, query: string): boolean {
  if (!query) return true;
  const haystack = `${item.full_name} ${item.phone}`.toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

export function OverduesQueue() {
  const [items, setItems] = useState<OverdueQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [promiseDraft, setPromiseDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [query, setQuery] = useState("");
  const today = todayIsoDate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await overduesApi.list();
      setItems(data.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось загрузить просрочки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      items.filter(
        (item) => matchesFilter(item, filter, today) && matchesQuery(item, query),
      ),
    [items, filter, query, today],
  );

  const totalDebt = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.overdue_amount || 0), 0),
    [items],
  );

  const filterCounts = useMemo(() => {
    const counts: Record<QueueFilter, number> = {
      all: items.length,
      no_contact: 0,
      promised: 0,
      due_today: 0,
    };
    for (const item of items) {
      if (!item.last_call_result && !item.promised_pay_date) counts.no_contact += 1;
      if (item.promised_pay_date) counts.promised += 1;
      if (item.promised_pay_date === today) counts.due_today += 1;
    }
    return counts;
  }, [items, today]);

  function openWork(item: OverdueQueueItem) {
    if (activeId === item.payment_schedule_id) {
      setActiveId(null);
      return;
    }
    setActiveId(item.payment_schedule_id);
    setNoteDraft(item.manager_note ?? "");
    setPromiseDraft(item.promised_pay_date ?? "");
  }

  function closeWork() {
    setActiveId(null);
  }

  async function submitCollection(
    scheduleId: string,
    data: Parameters<typeof scheduleApi.collection>[1],
    options?: { keepOpen?: boolean },
  ) {
    const keepOpen = Boolean(options?.keepOpen);
    setSaving(true);
    setError(null);
    try {
      await scheduleApi.collection(scheduleId, data);
      if (!keepOpen) closeWork();
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState text="Загрузка просрочек..." />;

  const filters: Array<{ id: QueueFilter; label: string }> = [
    { id: "all", label: "Все" },
    { id: "due_today", label: "Обещал сегодня" },
    { id: "promised", label: "С обещанием" },
    { id: "no_contact", label: "Без контакта" },
  ];

  return (
    <div className="page-stack">
      <PageHeader
        title="Просрочки"
        subtitle={
          items.length > 0
            ? `${items.length} в очереди · ${formatMoney(Math.round(totalDebt))}`
            : "Очередь звонков по долгам"
        }
        action={
          <Button variant="secondary" onClick={() => void load()} disabled={saving}>
            Обновить
          </Button>
        }
      />

      {error ? <p className="alert-danger">{error}</p> : null}

      {items.length === 0 ? (
        <p className="alert-success">Просроченных платежей нет.</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {filters.map((item) => {
                const active = filter === item.id;
                const count = filterCounts[item.id];
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFilter(item.id)}
                    className={cn(
                      "interactive rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "border-brand-600 bg-brand-50 text-brand-800 ring-1 ring-brand-200"
                        : "border-border bg-surface text-muted hover:bg-surface-muted hover:text-foreground",
                    )}
                  >
                    {item.label}
                    <span className="ml-1 tabular text-muted">{count}</span>
                  </button>
                );
              })}
            </div>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск: ФИО или телефон"
              className="sm:max-w-xs"
            />
          </div>

          {visible.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface px-3 py-4 text-sm text-muted">
              По фильтру ничего нет.
            </p>
          ) : (
            <div className="space-y-2">
              {visible.map((item) => {
                const open = activeId === item.payment_schedule_id;
                const promisedToday = item.promised_pay_date === today;
                return (
                  <article
                    key={item.client_id}
                    className={cn(
                      "rounded-lg border bg-surface shadow-soft",
                      open
                        ? "border-brand-300 ring-1 ring-brand-200"
                        : "border-border",
                      promisedToday && "border-l-4 border-l-status-danger-solid",
                    )}
                  >
                    <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <Link
                            href={`/clients/${item.client_id}?tab=payments`}
                            className="text-[15px] font-semibold text-foreground hover:text-brand-700"
                          >
                            {formatShortName(item.full_name)}
                          </Link>
                          <span className="text-xs text-muted">мес. {item.month_number}</span>
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <a
                            href={`tel:${item.phone}`}
                            className="inline-flex min-h-[36px] items-center rounded-md border border-brand-200 bg-brand-50 px-2.5 text-sm font-medium text-brand-800 hover:bg-brand-100"
                          >
                            {item.phone}
                          </a>
                          <Badge tone={daysTone(item.overdue_days)}>
                            {item.overdue_days} дн.
                          </Badge>
                          <span className="text-sm font-semibold tabular text-status-danger-text">
                            {formatMoney(item.overdue_amount)}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {item.last_call_result ? (
                            <span className="rounded-md bg-surface-muted px-2 py-0.5 text-xs text-foreground">
                              {collectionCallResultLabel(item.last_call_result)}
                            </span>
                          ) : (
                            <span className="rounded-md bg-surface-muted px-2 py-0.5 text-xs text-muted">
                              Звонка ещё не было
                            </span>
                          )}
                          {item.promised_pay_date ? (
                            <span
                              className={cn(
                                "rounded-md px-2 py-0.5 text-xs font-medium",
                                promisedToday
                                  ? "bg-status-danger-bg text-status-danger-text"
                                  : "bg-status-warning-bg text-status-warning-text",
                              )}
                            >
                              обещал {formatDate(item.promised_pay_date)}
                            </span>
                          ) : null}
                        </div>

                        {item.manager_note?.trim() ? (
                          <p className="mt-2 line-clamp-2 text-sm text-muted">
                            {item.manager_note}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
                        <Button
                          size="sm"
                          variant={open ? "primary" : "secondary"}
                          onClick={() => openWork(item)}
                        >
                          {open ? "Свернуть" : "Отметить"}
                        </Button>
                        <Link
                          href={`/clients/${item.client_id}?tab=payments`}
                          className="btn-secondary inline-flex min-h-[30px] items-center justify-center rounded-md border px-2.5 py-1 text-xs"
                        >
                          Карточка
                        </Link>
                      </div>
                    </div>

                    {open ? (
                      <div className="space-y-3 border-t border-border bg-surface-muted/60 p-3">
                        <div>
                          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                            Результат звонка
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {CALL_RESULTS.map((result) => (
                              <Button
                                key={result}
                                size="sm"
                                variant={
                                  item.last_call_result === result ? "primary" : "secondary"
                                }
                                disabled={saving}
                                onClick={() =>
                                  void submitCollection(
                                    item.payment_schedule_id,
                                    {
                                      call_result: result,
                                      ...(result === "promised" && promiseDraft
                                        ? { promised_pay_date: promiseDraft }
                                        : {}),
                                    },
                                    { keepOpen: true },
                                  )
                                }
                              >
                                {collectionCallResultLabel(result)}
                              </Button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                            Обещал оплатить
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              { label: "Сегодня", value: today },
                              { label: "Завтра", value: addDaysIso(1) },
                              { label: "+3 дня", value: addDaysIso(3) },
                            ].map((chip) => (
                              <Button
                                key={chip.label}
                                size="sm"
                                variant={promiseDraft === chip.value ? "primary" : "secondary"}
                                disabled={saving}
                                onClick={() => {
                                  setPromiseDraft(chip.value);
                                  void submitCollection(item.payment_schedule_id, {
                                    call_result: "promised",
                                    promised_pay_date: chip.value,
                                  });
                                }}
                              >
                                {chip.label}
                              </Button>
                            ))}
                          </div>
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                            <div className="min-w-0 flex-1">
                              <FormField label="Своя дата">
                                <DatePicker
                                  value={promiseDraft}
                                  onChange={(event) => setPromiseDraft(event.target.value)}
                                  placeholder="дд.мм.гггг"
                                />
                              </FormField>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                disabled={saving || !promiseDraft}
                                onClick={() =>
                                  void submitCollection(item.payment_schedule_id, {
                                    call_result: "promised",
                                    promised_pay_date: promiseDraft,
                                  })
                                }
                              >
                                Сохранить дату
                              </Button>
                              {item.promised_pay_date ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={saving}
                                  onClick={() =>
                                    void submitCollection(item.payment_schedule_id, {
                                      clear_promised_pay_date: true,
                                    })
                                  }
                                >
                                  Сбросить
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div>
                          <FormField label="Заметка">
                            <textarea
                              className="interactive min-h-[72px] w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm shadow-soft outline-none placeholder:text-muted focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
                              rows={2}
                              value={noteDraft}
                              onChange={(e) => setNoteDraft(e.target.value)}
                              placeholder="Договорились, перезвонить, причина…"
                            />
                          </FormField>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              disabled={saving || !noteDraft.trim()}
                              onClick={() =>
                                void submitCollection(item.payment_schedule_id, {
                                  manager_note: noteDraft.trim(),
                                })
                              }
                            >
                              Сохранить заметку
                            </Button>
                            {item.manager_note ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={saving}
                                onClick={() =>
                                  void submitCollection(item.payment_schedule_id, {
                                    clear_manager_note: true,
                                  })
                                }
                              >
                                Очистить
                              </Button>
                            ) : null}
                            <Button size="sm" variant="ghost" onClick={closeWork}>
                              Закрыть
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
