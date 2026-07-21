"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge, Card, EmptyState, LoadingState, PageHeader, SectionTitle } from "@/components/ui";
import { auditApi } from "@/lib/api-client";
import { statusLabel } from "@/lib/format";
import type { AuditLogEntry } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

function actionTone(action: string): "default" | "success" | "warning" | "danger" {
  if (action === "create") return "success";
  if (action === "delete") return "danger";
  return "warning";
}

function formatEntry(entry: AuditLogEntry): string {
  if (entry.field_name) {
    const oldVal = entry.old_value ?? "—";
    const newVal = entry.new_value ?? "—";
    return `${entry.field_name}: ${oldVal} → ${newVal}`;
  }
  return statusLabel(entry.action);
}

export default function AuditPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && user.role !== "owner") {
      router.replace("/");
    }
  }, [user, router]);

  useEffect(() => {
    if (user?.role === "owner") {
      auditApi
        .recent(100)
        .then(setEntries)
        .finally(() => setLoading(false));
    }
  }, [user?.role]);

  if (user?.role !== "owner") {
    return <LoadingState text="Доступ только для руководителя" />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Журнал изменений"
        subtitle="Кто и когда менял клиентов, платежи, тарифы и расходы"
      />

      <Card>
        <SectionTitle
          title="Последние события"
          description="Только просмотр — данные не изменяются"
        />
        {loading ? (
          <LoadingState text="Загрузка журнала..." />
        ) : entries.length === 0 ? (
          <EmptyState>Записей пока нет</EmptyState>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="history-item">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={actionTone(entry.action)}>{statusLabel(entry.action)}</Badge>
                    <span className="text-sm font-semibold text-slate-800">
                      {entry.entity_type}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{formatEntry(entry)}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {entry.changed_by_name ?? "Пользователь"} ·{" "}
                    {new Intl.DateTimeFormat("ru-RU", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Europe/Moscow",
                    }).format(new Date(entry.changed_at))}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
