"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Button,
  EmptyState,
  Input,
  LoadingState,
  PageHeader,
} from "@/components/ui";
import { ApiRequestError, questionnairesApi } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/format";
import type { QuestionnaireBrief } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

export default function QuestionnairesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<QuestionnaireBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const canEdit = user?.role === "owner" || user?.role === "manager";

  useEffect(() => {
    if (user?.role === "call_center") {
      router.replace("/");
    }
  }, [user?.role, router]);

  useEffect(() => {
    if (!canEdit) return;
    const handle = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const data = await questionnairesApi.list({
            search: search.trim().length >= 2 ? search.trim() : undefined,
          });
          setItems(data);
          setError(null);
        } catch (err) {
          setError(err instanceof ApiRequestError ? err.message : "Не удалось загрузить анкеты");
        } finally {
          setLoading(false);
        }
      })();
    }, search.trim().length >= 2 ? 250 : 0);
    return () => window.clearTimeout(handle);
  }, [canEdit, search]);

  if (!canEdit) {
    return <LoadingState text="Загрузка..." />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Анкеты клиентов"
        subtitle="Первичный отбор на банкротство. Все заполненные анкеты сохраняются."
        action={
          <Button type="button" onClick={() => router.push("/questionnaires/new")}>
            Новая анкета
          </Button>
        }
      />

      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Поиск по ФИО или телефону"
      />

      {error ? <p className="alert-danger">{error}</p> : null}

      {loading ? (
        <LoadingState text="Загрузка анкет..." />
      ) : items.length === 0 ? (
        <EmptyState
          action={
            <Button type="button" onClick={() => router.push("/questionnaires/new")}>
              Заполнить анкету
            </Button>
          }
        >
          Анкет пока нет. Когда приходит новый клиент, менеджер заполняет анкету здесь.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table table-cards text-xs">
            <thead>
              <tr>
                <th>ФИО</th>
                <th>Телефон</th>
                <th>Регион</th>
                <th>Стоимость</th>
                <th>Дата</th>
                <th>Клиент</th>
                <th>Кто заполнил</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td data-label="ФИО">
                    <Link href={`/questionnaires/${item.id}`} className="font-medium text-brand-700">
                      {item.full_name}
                    </Link>
                  </td>
                  <td data-label="Телефон">{item.phone || "—"}</td>
                  <td data-label="Регион">{item.registration_region || "—"}</td>
                  <td data-label="Стоимость">
                    {item.service_cost ? formatMoney(item.service_cost) : "—"}
                  </td>
                  <td data-label="Дата">{item.filled_date ? formatDate(item.filled_date) : "—"}</td>
                  <td data-label="Клиент">
                    {item.client_id ? (
                      <Link href={`/clients/${item.client_id}`} className="link-brand">
                        Карточка
                      </Link>
                    ) : (
                      "не создан"
                    )}
                  </td>
                  <td data-label="Кто заполнил">{item.created_by_name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
