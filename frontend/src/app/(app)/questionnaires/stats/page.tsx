"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { EmptyState, Input, LoadingState, PageHeader } from "@/components/ui";
import { ApiRequestError, questionnairesApi } from "@/lib/api-client";
import { todayIsoDate } from "@/lib/format";
import { canSuperviseLeads, canUseQuestionnaires } from "@/lib/organization-features";
import type { LeadStats, LeadStatsRow } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

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
  const allowed = canUseQuestionnaires(user) && user?.role !== "call_center";
  const supervises = canSuperviseLeads(user);

  useEffect(() => {
    if (!allowed && user) {
      router.replace("/");
    }
  }, [allowed, user, router]);

  useEffect(() => {
    if (!allowed) return;
    void (async () => {
      setLoading(true);
      try {
        setStats(await questionnairesApi.dailyStats(day));
        setError(null);
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Не удалось загрузить статистику");
      } finally {
        setLoading(false);
      }
    })();
  }, [allowed, day]);

  if (!allowed) {
    return <LoadingState text="Загрузка..." />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Статистика лидов за день"
        subtitle={
          supervises
            ? "Сколько каждый менеджер завёл лидов, сколько звонил, дозвонился, отсеял и довёл до клиента."
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

      {loading || !stats ? (
        <LoadingState text="Загрузка статистики..." />
      ) : stats.rows.length === 0 ? (
        <EmptyState>За этот день ещё нет ни одного лида и ни одного звонка.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
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
    </div>
  );
}
