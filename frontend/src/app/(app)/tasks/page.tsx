"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge, Button, Card, LoadingState, PageHeader, SectionTitle } from "@/components/ui";
import { ApiRequestError, funnelApi, tasksApi } from "@/lib/api-client";
import { formatDate, formatMoney, overdueBucketLabel, procedureStageLabel, statusLabel } from "@/lib/format";
import type { FunnelOverview, ManagerTask, ProcedureStage } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

function bucketTone(days: number | null): "default" | "success" | "warning" | "danger" {
  if (!days) return "default";
  if (days >= 15) return "danger";
  if (days >= 8) return "danger";
  if (days >= 4) return "warning";
  return "warning";
}

export default function TasksPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [funnel, setFunnel] = useState<FunnelOverview | null>(null);
  const [tasks, setTasks] = useState<ManagerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<ProcedureStage | "">("");

  const showFinance = user?.role === "owner" || user?.role === "manager";

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [funnelData, taskData] = await Promise.all([
        funnelApi.overview(),
        tasksApi.list("open"),
      ]);
      setFunnel(funnelData);
      setTasks(taskData);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось загрузить данные");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!showFinance) {
      router.replace("/");
      return;
    }
    void loadData();
  }, [loadData, router, showFinance]);

  async function handleTaskAction(taskId: string, status: "done" | "dismissed") {
    setSavingId(taskId);
    setError(null);
    setTasks((current) => current.filter((task) => task.id !== taskId));
    try {
      await tasksApi.update(taskId, { status });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось обновить задачу");
      await loadData();
    } finally {
      setSavingId(null);
    }
  }

  if (!showFinance) return <LoadingState text="Перенаправление..." />;
  if (loading) return <LoadingState text="Загрузка задач..." />;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Задачи и воронка"
        subtitle="Звонки по просрочкам: клиенты платят с 25 числа до конца месяца"
      />

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      <Card>
        <SectionTitle
          title="Воронка процедуры"
          description="Сколько клиентов на каждом этапе. Нажмите на этап, чтобы отфильтровать список клиентов."
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {funnel?.stages.map((item) => {
            const active = stageFilter === item.stage;
            return (
              <button
                key={item.stage}
                type="button"
                onClick={() => setStageFilter(active ? "" : item.stage)}
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  active
                    ? "border-brand-400 bg-brand-50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-brand-300 hover:bg-slate-50"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {procedureStageLabel(item.stage)}
                </p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{item.count}</p>
              </button>
            );
          })}
        </div>
        {stageFilter && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="text-sm text-slate-600">
              Фильтр: {procedureStageLabel(stageFilter)}
            </p>
            <Link
              href={`/clients?procedure_stage=${stageFilter}`}
              className="text-sm font-semibold text-brand-700 hover:text-brand-600"
            >
              Открыть клиентов →
            </Link>
            <button
              type="button"
              onClick={() => setStageFilter("")}
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              Сбросить
            </button>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle
          title="Задачи по просрочкам"
          description="Появляются после конца месяца, если платёж не поступил. «Выполнено» — звонок сделан; задача вернётся только при усилении просрочки (4, 8, 15+ дней)."
          action={
            <Badge tone={tasks.length > 0 ? "danger" : "success"}>
              Открытых: {tasks.length}
            </Badge>
          }
        />
        {tasks.length === 0 ? (
          <p className="rounded-xl bg-emerald-50 px-4 py-8 text-center text-sm text-emerald-700">
            Открытых задач нет — все просрочки обработаны или оплачены.
          </p>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={bucketTone(task.overdue_days)}>
                        {overdueBucketLabel(task.overdue_days)}
                      </Badge>
                      <Badge tone="default">{statusLabel(task.task_type)}</Badge>
                    </div>
                    <p className="mt-2 font-semibold text-slate-900">{task.title}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                      {task.client_name && (
                        <Link
                          href={`/clients/${task.client_id}`}
                          className="font-medium text-brand-700 hover:text-brand-600"
                        >
                          {task.client_name}
                        </Link>
                      )}
                      {task.client_phone && <span>{task.client_phone}</span>}
                      {task.manager_name && <span>Менеджер: {task.manager_name}</span>}
                      {task.payment_window_label && (
                        <span>Окно оплаты: {task.payment_window_label}</span>
                      )}
                      {task.remainder_amount && (
                        <span className="font-medium text-rose-700">
                          Долг: {formatMoney(task.remainder_amount)}
                        </span>
                      )}
                      {task.schedule_due_date && (
                        <span>Платёж в графике: {formatDate(task.schedule_due_date)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={savingId === task.id}
                      onClick={() => handleTaskAction(task.id, "done")}
                    >
                      {savingId === task.id ? "..." : "Выполнено"}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={savingId === task.id}
                      onClick={() => handleTaskAction(task.id, "dismissed")}
                    >
                      Отклонить
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
