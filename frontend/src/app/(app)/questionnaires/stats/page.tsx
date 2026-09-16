"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button, EmptyState, Input, LoadingState, PageHeader, Select } from "@/components/ui";
import { ApiRequestError, questionnairesApi } from "@/lib/api-client";
import { formatDate, moscowIsoDateOffset, todayIsoDate } from "@/lib/format";
import { canSuperviseLeads, canUseQuestionnaires } from "@/lib/organization-features";
import type { LeadCountsByDay, LeadManagerOption, LeadStats, LeadStatsRow } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";
import { cn } from "@/lib/cn";

type RangeMode = "day" | "period";

function reachRate(row: LeadStatsRow): string {
  if (!row.calls_total) return "—";
  return `${Math.round((row.calls_answered / row.calls_total) * 100)}%`;
}

export default function LeadStatsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [day, setDay] = useState(todayIsoDate());
  const [stats, setStats] = useState<LeadStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rangeMode, setRangeMode] = useState<RangeMode>("day");
  const [singleDay, setSingleDay] = useState(todayIsoDate());
  const [dateFrom, setDateFrom] = useState(() => moscowIsoDateOffset(-13));
  const [dateTo, setDateTo] = useState(todayIsoDate());
  const [managerFilter, setManagerFilter] = useState("");
  const [managers, setManagers] = useState<LeadManagerOption[]>([]);
  const [byDay, setByDay] = useState<LeadCountsByDay | null>(null);
  const [byDayLoading, setByDayLoading] = useState(true);
  const [byDayError, setByDayError] = useState<string | null>(null);

  const allowed = canUseQuestionnaires(user) && user?.role !== "call_center";
  const supervises = canSuperviseLeads(user);

  const effectiveFrom = rangeMode === "day" ? singleDay : dateFrom;
  const effectiveTo = rangeMode === "day" ? singleDay : dateTo;

  useEffect(() => {
    if (!allowed && user) {
      router.replace("/");
    }
  }, [allowed, user, router]);

  useEffect(() => {
    if (!supervises) return;
    void (async () => {
      try {
        setManagers(await questionnairesApi.managers());
      } catch {
        setManagers([]);
      }
    })();
  }, [supervises]);

  useEffect(() => {
    if (!allowed) return;
    void (async () => {
      setLoading(true);
      try {
        setStats(await questionnairesApi.dailyStats(day));
        setError(null);
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Не удалось загрузить статистику");
        setStats(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [allowed, day]);

  useEffect(() => {
    if (!allowed || !supervises) return;
    let cancelled = false;
    void (async () => {
      setByDayLoading(true);
      setByDayError(null);
      try {
        const data = await questionnairesApi.countsByDay({
          date_from: effectiveFrom,
          date_to: effectiveTo,
          manager_id: managerFilter || undefined,
        });
        if (!cancelled) {
          setByDay(data);
          setByDayError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setByDay(null);
          setByDayError(
            err instanceof ApiRequestError ? err.message : "Не удалось загрузить сводку по датам",
          );
        }
      } finally {
        if (!cancelled) setByDayLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, supervises, effectiveFrom, effectiveTo, managerFilter]);

  if (!allowed) {
    return <LoadingState text="Загрузка..." />;
  }

  return (
    <div className="page-stack">
      {supervises ? (
        <section className="page-group">
          <PageHeader
            title="Заведено анкет"
            subtitle="Сводка по дням. Нажмите дату или число — откроется список этих анкет."
            action={
              <div className="flex flex-wrap items-end gap-2">
                <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
                  <button
                    type="button"
                    className={cn(
                      "rounded px-2.5 py-1 text-[11px] font-semibold",
                      rangeMode === "day"
                        ? "bg-brand-600 text-white"
                        : "text-muted hover:text-foreground",
                    )}
                    onClick={() => setRangeMode("day")}
                  >
                    За день
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "rounded px-2.5 py-1 text-[11px] font-semibold",
                      rangeMode === "period"
                        ? "bg-brand-600 text-white"
                        : "text-muted hover:text-foreground",
                    )}
                    onClick={() => setRangeMode("period")}
                  >
                    Период
                  </button>
                </div>

                {rangeMode === "day" ? (
                  <>
                    <div>
                      <label className="mb-0.5 block text-[11px] text-muted">Дата</label>
                      <Input
                        type="date"
                        value={singleDay}
                        max={todayIsoDate()}
                        onChange={(event) => setSingleDay(event.target.value || todayIsoDate())}
                      />
                    </div>
                    <div className="flex gap-1.5 pb-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setSingleDay(todayIsoDate())}
                      >
                        Сегодня
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setSingleDay(moscowIsoDateOffset(-1))}
                      >
                        Вчера
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="mb-0.5 block text-[11px] text-muted">С</label>
                      <Input
                        type="date"
                        value={dateFrom}
                        max={dateTo}
                        onChange={(event) =>
                          setDateFrom(event.target.value || moscowIsoDateOffset(-13))
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[11px] text-muted">По</label>
                      <Input
                        type="date"
                        value={dateTo}
                        max={todayIsoDate()}
                        min={dateFrom}
                        onChange={(event) => setDateTo(event.target.value || todayIsoDate())}
                      />
                    </div>
                    <div className="flex gap-1.5 pb-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setDateFrom(moscowIsoDateOffset(-6));
                          setDateTo(todayIsoDate());
                        }}
                      >
                        7 дней
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setDateFrom(moscowIsoDateOffset(-13));
                          setDateTo(todayIsoDate());
                        }}
                      >
                        14 дней
                      </Button>
                    </div>
                  </>
                )}

                <div className="min-w-[180px]">
                  <label className="mb-0.5 block text-[11px] text-muted">Менеджер</label>
                  <Select
                    value={managerFilter}
                    onChange={(event) => setManagerFilter(event.target.value)}
                  >
                    <option value="">Все менеджеры</option>
                    {managers.map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.full_name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            }
          />

          {byDayError ? <p className="alert-danger">{byDayError}</p> : null}

          {byDayLoading ? (
            <LoadingState text="Загрузка сводки..." />
          ) : byDay && byDay.rows.length > 0 ? (
            <div className="overflow-x-auto lg:rounded-lg lg:border lg:border-border lg:bg-surface lg:shadow-soft">
              <table className="data-table table-cards text-xs">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Заведено</th>
                    <th>По менеджерам</th>
                  </tr>
                </thead>
                <tbody>
                  {byDay.rows.map((row) => {
                    const dayHref = `/questionnaires?created_on=${row.day}${
                      managerFilter ? `&created_by=${managerFilter}` : ""
                    }`;
                    return (
                      <tr key={row.day}>
                        <td data-label="Дата" className="whitespace-nowrap font-medium">
                          {row.leads_added > 0 ? (
                            <Link id={`day-${row.day}`} href={dayHref} className="link-brand">
                              {formatDate(row.day)}
                            </Link>
                          ) : (
                            formatDate(row.day)
                          )}
                        </td>
                        <td data-label="Заведено" className="tabular-nums">
                          {row.leads_added > 0 ? (
                            <Link id={`count-${row.day}`} href={dayHref} className="link-brand">
                              {row.leads_added}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td data-label="По менеджерам">
                          {row.by_manager.length === 0 ? (
                            <span className="text-muted">—</span>
                          ) : (
                            <span className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] leading-snug">
                              {row.by_manager.map((item) =>
                                item.manager_id ? (
                                  <Link
                                    key={item.manager_id}
                                    id={`day-${row.day}-mgr-${item.manager_id}`}
                                    href={`/questionnaires?created_on=${row.day}&created_by=${item.manager_id}`}
                                    className="text-muted hover:text-brand-700"
                                  >
                                    {item.manager_name}: {item.leads_added}
                                  </Link>
                                ) : (
                                  <span key="none" className="text-muted">
                                    {item.manager_name}: {item.leads_added}
                                  </span>
                                ),
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="font-semibold">
                    <td data-label="Дата">Итого</td>
                    <td data-label="Заведено" className="tabular-nums">
                      {byDay.totals}
                    </td>
                    <td data-label="По менеджерам"> </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : byDayError ? null : (
            <EmptyState>
              {rangeMode === "day"
                ? "За этот день анкет не заводили."
                : "За выбранный период анкет не заводили."}
            </EmptyState>
          )}
        </section>
      ) : null}

      <section className="page-group">
        <PageHeader
          title="Статистика лидов за день"
          subtitle={
            supervises
              ? "Срез за один день: звонки, дозвоны, отсев и перевод в клиенты по каждому менеджеру."
              : "Ваши результаты за выбранный день."
          }
          action={
            <Input
              type="date"
              value={day}
              max={todayIsoDate()}
              onChange={(event) => setDay(event.target.value || todayIsoDate())}
            />
          }
        />

        {error ? <p className="alert-danger">{error}</p> : null}

        {loading ? (
          <LoadingState text="Загрузка статистики..." />
        ) : !stats || stats.rows.length === 0 ? (
          error ? null : (
            <EmptyState>За этот день ещё нет ни одного лида и ни одного звонка.</EmptyState>
          )
        ) : (
          <div className="overflow-x-auto lg:rounded-lg lg:border lg:border-border lg:bg-surface lg:shadow-soft">
            <table className="data-table table-cards text-xs">
              <thead>
                <tr>
                  <th>Менеджер</th>
                  <th>Новых лидов</th>
                  <th>Звонков</th>
                  <th>Дозвонов</th>
                  <th>Недозвонов</th>
                  <th>Дозвон, %</th>
                  <th>Некачественных</th>
                  <th>Стали клиентами</th>
                </tr>
              </thead>
              <tbody>
                {stats.rows.map((row) => (
                  <tr key={row.manager_id ?? "none"}>
                    <td data-label="Менеджер" className="font-medium">
                      {row.manager_name}
                    </td>
                    <td data-label="Новых лидов">{row.leads_added}</td>
                    <td data-label="Звонков">{row.calls_total}</td>
                    <td data-label="Дозвонов">{row.calls_answered}</td>
                    <td data-label="Недозвонов">{row.calls_no_answer}</td>
                    <td data-label="Дозвон, %">{reachRate(row)}</td>
                    <td data-label="Некачественных">{row.unqualified}</td>
                    <td data-label="Стали клиентами">{row.converted}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td data-label="Менеджер">Итого</td>
                  <td data-label="Новых лидов">{stats.totals.leads_added}</td>
                  <td data-label="Звонков">{stats.totals.calls_total}</td>
                  <td data-label="Дозвонов">{stats.totals.calls_answered}</td>
                  <td data-label="Недозвонов">{stats.totals.calls_no_answer}</td>
                  <td data-label="Дозвон, %">{reachRate(stats.totals)}</td>
                  <td data-label="Некачественных">{stats.totals.unqualified}</td>
                  <td data-label="Стали клиентами">{stats.totals.converted}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
