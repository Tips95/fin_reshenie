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

  const canUseTasks = user?.role === "owner" || user?.role === "manager";

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
    if (!canUseTasks) {
      router.replace("/");
      return;
    }
    void loadData();
  }, [loadData, router, canUseTasks]);

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

  if (!canUseTasks) return <LoadingState text="Перенаправление..." />;
  if (loading) return <LoadingState text="Загрузка задач..." />;

  return (
    <div className="page-stack">
      <PageHeader
        title="Задачи и воронка"
        subtitle="Звонки по просрочкам: клиенты платят с 25 числа до конца месяца"
      />

      {error && (
        <p className="alert-danger">
          {error}
        </p>
      )}

      <Card>
        <SectionTitle
          title="Воронка процедуры"
          description="Сколько клиентов на каждом этапе. Нажмите на этап, чтобы отфильтровать список клиентов."
        />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {funnel?.stages.map((item) => {
            const active = stageFilter === item.stage;
            return (
              <button
                key={item.stage}
                type="button"
                onClick={() => setStageFilter(active ? "" : item.stage)}
                className={`interactive rounded-md border p-2.5 text-left shadow-soft ${
                  active
                    ? "border-brand-600 bg-brand-50 ring-1 ring-brand-200"
                    : "border-border bg-surface hover:bg-surface-muted"
                }`}
              >
                <p className="type-caption">{procedureStageLabel(item.stage)}</p>
                <p className="mt-1 text-lg font-semibold leading-tight text-foreground">
                  {item.count}
                </p>
              </button>
            );
          })}
        </div>
        {stageFilter && (
          <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-border pt-2">
            <p className="text-xs text-muted">Фильтр: {procedureStageLabel(stageFilter)}</p>
            <Link href={`/clients?procedure_stage=${stageFilter}`} className="link-brand text-xs">
              Открыть клиентов →
            </Link>
            <button
              type="button"
              onClick={() => setStageFilter("")}
              className="text-xs text-muted hover:text-foreground"
            >
              Сбросить
            </button>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle
          title="Открытые задачи"
          description="Просрочки и напоминания зафиксировать первый платёж по новым клиентам от менеджеров."
          action={
            <Badge tone={tasks.length > 0 ? "danger" : "success"}>
              Открытых: {tasks.length}
            </Badge>
          }
        />
        {tasks.length === 0 ? (
          <p className="alert-success text-center">Открытых задач нет.</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="rounded-md border border-border bg-surface-muted p-2.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {task.task_type === "overdue_payment" ? (
                        <Badge tone={bucketTone(task.overdue_days)}>
                          {overdueBucketLabel(task.overdue_days)}
                        </Badge>
                      ) : (
                        <Badge tone="warning">{statusLabel(task.task_type)}</Badge>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm font-semibold text-foreground">{task.title}</p>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      {task.client_name && (
                        <Link
                          href={`/clients/${task.client_id}`}
                          className="link-brand font-medium"
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
                        <span className="font-medium text-status-danger-text">
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
