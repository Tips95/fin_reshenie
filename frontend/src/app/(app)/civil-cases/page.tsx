"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge, Button, EmptyState, Input, LoadingState, PageHeader } from "@/components/ui";
import { ApiRequestError, civilCasesApi } from "@/lib/api-client";
import { civilCaseStageLabel, formatDate, formatMoney } from "@/lib/format";
import { canCreateCivilCase, canUseCivilCases } from "@/lib/organization-features";
import type { CivilCaseBrief, CivilCaseStage } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

const STAGES: Array<{ value: "" | CivilCaseStage; label: string }> = [
  { value: "", label: "Все" },
  { value: "intake", label: "Новые" },
  { value: "documents", label: "Документы" },
  { value: "submitted", label: "В органе" },
  { value: "completed", label: "Исполнены" },
];

function stageTone(stage: CivilCaseStage): "default" | "success" | "warning" | "danger" {
  if (stage === "completed") return "success";
  if (stage === "submitted") return "warning";
  if (stage === "documents") return "warning";
  return "default";
}

export default function CivilCasesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<CivilCaseBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<"" | CivilCaseStage>("");
  const canView = canUseCivilCases(user);
  const canCreate = canCreateCivilCase(user);

  useEffect(() => {
    if (!canView && user) {
      router.replace("/");
    }
  }, [canView, user, router]);

  useEffect(() => {
    if (!canView) return;
    const handle = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const data = await civilCasesApi.list({
            search: search.trim().length >= 2 ? search.trim() : undefined,
            stage: stage || undefined,
          });
          setItems(data);
          setError(null);
        } catch (err) {
          setError(err instanceof ApiRequestError ? err.message : "Не удалось загрузить дела");
        } finally {
          setLoading(false);
        }
      })();
    }, search.trim().length >= 2 ? 250 : 0);
    return () => window.clearTimeout(handle);
  }, [canView, search, stage]);

  if (!canView) {
    return <LoadingState text="Загрузка..." />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Гражданские дела"
        subtitle={
          canCreate
            ? "Менеджер заводит клиента, исполнитель ведёт дело по этапам"
            : "Ваши дела: документы, подача в орган, отметка об исполнении"
        }
        action={
          canCreate ? (
            <Button type="button" onClick={() => router.push("/civil-cases/new")}>
              Новое дело
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {STAGES.map((item) => (
          <button
            key={item.value || "all"}
            type="button"
            className={
              stage === item.value
                ? "rounded-md bg-brand-gradient px-2 py-1 text-[11px] font-medium text-white shadow-brand"
                : "interactive rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-muted hover:border-border-strong"
            }
            onClick={() => setStage(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Поиск по ФИО или телефону"
      />

      {error ? <p className="alert-danger">{error}</p> : null}

      {loading ? (
        <LoadingState text="Загрузка дел..." />
      ) : items.length === 0 ? (
        <EmptyState
          action={
            canCreate ? (
              <Button type="button" onClick={() => router.push("/civil-cases/new")}>
                Завести дело
              </Button>
            ) : undefined
          }
        >
          {canCreate
            ? "Дел пока нет. Менеджер заводит клиента сюда, исполнитель ведёт его дальше."
            : "Вам пока не назначили гражданские дела."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table table-cards text-xs">
            <thead>
              <tr>
                <th>ФИО</th>
                <th>Телефон</th>
                <th>Цена</th>
                <th>Дата обращения</th>
                <th>Предмет</th>
                <th>Этап</th>
                <th>Исполнитель</th>
                <th>Клиент</th>
                <th>Пакет</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td data-label="ФИО">
                    <Link href={`/civil-cases/${item.id}`} className="font-medium text-brand-700">
                      {item.full_name}
                    </Link>
                  </td>
                  <td data-label="Телефон">{item.phone || "—"}</td>
                  <td data-label="Цена">{formatMoney(item.price)}</td>
                  <td data-label="Дата обращения">{formatDate(item.appeal_date)}</td>
                  <td data-label="Предмет" className="max-w-[280px] truncate">
                    {item.subject}
                  </td>
                  <td data-label="Этап">
                    <Badge tone={stageTone(item.stage)}>{civilCaseStageLabel(item.stage)}</Badge>
                  </td>
                  <td data-label="Исполнитель">{item.assigned_executor_name || "не назначен"}</td>
                  <td data-label="Клиент">{item.client_documents_count ?? 0}</td>
                  <td data-label="Пакет">{item.prepared_documents_count ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
