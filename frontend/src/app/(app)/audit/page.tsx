"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Badge,
  Card,
  EmptyState,
  Input,
  LoadingState,
  PageHeader,
  Pagination,
  SectionTitle,
  Select,
} from "@/components/ui";
import { auditApi } from "@/lib/api-client";
import { statusLabel } from "@/lib/format";
import type { AuditLogEntry } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

const AUDIT_PAGE_SIZE = 20;

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
  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

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

  const entityOptions = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.entity_type))).sort(),
    [entries],
  );
  const actionOptions = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.action))).sort(),
    [entries],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (entityFilter && entry.entity_type !== entityFilter) return false;
      if (actionFilter && entry.action !== actionFilter) return false;
      if (!query) return true;
      return [entry.changed_by_name, entry.field_name, entry.old_value, entry.new_value]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [entries, entityFilter, actionFilter, search]);

  useEffect(() => {
    setPage(1);
  }, [entityFilter, actionFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / AUDIT_PAGE_SIZE));
  const pageEntries = filtered.slice((page - 1) * AUDIT_PAGE_SIZE, page * AUDIT_PAGE_SIZE);

  if (user?.role !== "owner") {
    return <LoadingState text="Доступ только для руководителя" />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Журнал изменений"
        subtitle="Кто и когда менял клиентов, платежи, тарифы и расходы"
      />

      <Card>
        <SectionTitle
          title="Последние события"
          description="Только просмотр — данные не изменяются"
        />

        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <Select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
            <option value="">Все объекты</option>
            {entityOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
          <Select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="">Все действия</option>
            {actionOptions.map((option) => (
              <option key={option} value={option}>
                {statusLabel(option)}
              </option>
            ))}
          </Select>
          <Input
            placeholder="Поиск по автору или полю"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <LoadingState text="Загрузка журнала..." />
        ) : filtered.length === 0 ? (
          <EmptyState>
            {entries.length === 0 ? "Записей пока нет" : "Ничего не найдено по фильтрам"}
          </EmptyState>
        ) : (
          <>
            <div className="space-y-2">
              {pageEntries.map((entry) => (
                <div key={entry.id} className="history-item">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={actionTone(entry.action)}>{statusLabel(entry.action)}</Badge>
                      <span className="text-sm font-semibold text-foreground">
                        {entry.entity_type}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted">{formatEntry(entry)}</p>
                    <p className="mt-1 type-hint">
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

            <Pagination
              page={page}
              pageSize={AUDIT_PAGE_SIZE}
              total={filtered.length}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>
    </div>
  );
}
