"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import {
  Badge,
  Button,
  EmptyState,
  Input,
  LoadingState,
  PageHeader,
  Select,
} from "@/components/ui";
import { ApiRequestError, questionnairesApi } from "@/lib/api-client";
import { formatDate, formatMoney, isLeadAppointmentDue, isLeadCallbackDue, leadStatusLabel, leadStatusTone } from "@/lib/format";
import { formatPhoneDisplay, phoneToTelHref } from "@/lib/phone";
import type { LeadManagerOption, LeadStatus, QuestionnaireBrief } from "@/lib/types";
import {
  canOpenClientCards,
  canSuperviseLeads,
  canUseQuestionnaires,
  isCollectionStaff,
} from "@/lib/organization-features";
import { useAuth } from "@/modules/auth/AuthProvider";

type StatusFilter = LeadStatus | "all" | "due" | "appointment";

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "due", label: "Пора перезвонить" },
  { value: "appointment", label: "Приём сегодня" },
  { value: "new", label: "Новые" },
  { value: "in_progress", label: "В работе" },
  { value: "no_answer", label: "Не дозвонились" },
  { value: "unqualified", label: "Некачественные" },
  { value: "converted", label: "Клиенты" },
];

function leadTitle(item: QuestionnaireBrief): string {
  const name = item.full_name.trim();
  if (name) return name;
  const phone = formatPhoneDisplay(item.phone);
  return phone === "—" ? "Без имени" : phone;
}

function leadQueueRank(item: QuestionnaireBrief): number {
  if (isLeadAppointmentDue(item)) return 0;
  if (isLeadCallbackDue(item)) return 1;
  if (item.lead_status === "new") return 2;
  if (item.lead_status === "in_progress") return 3;
  if (item.lead_status === "no_answer") return 4;
  if (item.lead_status === "unqualified") return 5;
  return 6;
}

function matchesStatus(item: QuestionnaireBrief, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "due") return isLeadCallbackDue(item);
  if (filter === "appointment") return isLeadAppointmentDue(item);
  return item.lead_status === filter;
}

function formatCallbackCell(nextCallAt: string | null): { text: string; due: boolean } {
  if (!nextCallAt) return { text: "—", due: false };
  const day = nextCallAt.slice(0, 10);
  const due = isLeadCallbackDue({ lead_status: "no_answer", next_call_at: nextCallAt });
  return { text: formatDate(day), due };
}

function formatAppointmentCell(item: QuestionnaireBrief): { text: string; due: boolean } {
  if (!item.appointment_at) return { text: "—", due: false };
  return {
    text: formatDate(item.appointment_at.slice(0, 10)),
    due: isLeadAppointmentDue(item),
  };
}

function QuestionnairesPageContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<QuestionnaireBrief[]>([]);
  const [managers, setManagers] = useState<LeadManagerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const canEdit = canUseQuestionnaires(user);
  const hideAmounts = isCollectionStaff(user);
  const supervises = canSuperviseLeads(user);
  const showClientLinks = canOpenClientCards(user);

  const createdOn = searchParams.get("created_on") || "";
  const createdBy = searchParams.get("created_by") || "";
  const assignedManager = searchParams.get("manager_id") || "";
  // При просмотре «за день» менеджер = кто завёл; иначе — закреплённый.
  const managerFilter = createdOn ? createdBy : assignedManager;

  function patchQuery(next: { created_on?: string; created_by?: string; manager_id?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    router.replace(query ? `/questionnaires?${query}` : "/questionnaires");
  }

  useEffect(() => {
    if (!canEdit && user) {
      router.replace("/");
    }
  }, [canEdit, user, router]);

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
    if (!canEdit) return;
    const handle = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const data = await questionnairesApi.list({
            search: search.trim().length >= 2 ? search.trim() : undefined,
            created_on: createdOn || undefined,
            created_by_id: createdOn && createdBy ? createdBy : undefined,
            manager_id: !createdOn && assignedManager ? assignedManager : undefined,
          });
          setItems(data);
          setError(null);
        } catch (err) {
          setError(err instanceof ApiRequestError ? err.message : "Не удалось загрузить лиды");
        } finally {
          setLoading(false);
        }
      })();
    }, search.trim().length >= 2 ? 250 : 0);
    return () => window.clearTimeout(handle);
  }, [canEdit, search, createdOn, createdBy, assignedManager]);

  const counts = useMemo(() => {
    const next: Record<StatusFilter, number> = {
      all: items.length,
      due: 0,
      appointment: 0,
      new: 0,
      in_progress: 0,
      no_answer: 0,
      unqualified: 0,
      converted: 0,
    };
    for (const item of items) {
      next[item.lead_status] += 1;
      if (isLeadCallbackDue(item)) next.due += 1;
      if (isLeadAppointmentDue(item)) next.appointment += 1;
    }
    return next;
  }, [items]);

  const visibleItems = useMemo(
    () =>
      items
        .filter((item) => matchesStatus(item, statusFilter))
        .slice()
        .sort((left, right) => {
          const rank = leadQueueRank(left) - leadQueueRank(right);
          if (rank !== 0) return rank;
          const appointmentCmp = (left.appointment_at || "").localeCompare(right.appointment_at || "");
          if (appointmentCmp !== 0) return appointmentCmp;
          return (left.next_call_at || "").localeCompare(right.next_call_at || "");
        }),
    [items, statusFilter],
  );

  const creatorName = managers.find((manager) => manager.id === createdBy)?.full_name;

  if (!canEdit) {
    return <LoadingState text="Загрузка..." />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Лиды и анкеты"
        subtitle={
          hideAmounts
            ? "Все лиды компании. Если клиент ещё не создан — можно начать сбор документов."
            : "Заводите каждого, кому звоните. Анкета сохраняется в любой момент — обязателен только телефон."
        }
        action={
          <Button type="button" onClick={() => router.push("/questionnaires/new")}>
            Новый лид
          </Button>
        }
      />

      {createdOn ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-soft">
          <span>
            Анкеты за <span className="font-semibold">{formatDate(createdOn)}</span>
            {creatorName ? (
              <>
                {" "}
                · завёл <span className="font-semibold">{creatorName}</span>
              </>
            ) : null}
          </span>
          <button
            type="button"
            className="interactive text-brand-700 hover:text-brand-600"
            onClick={() => patchQuery({ created_on: "", created_by: "" })}
          >
            Сбросить дату
          </button>
          <Link id="link-back-stats" href="/questionnaires/stats" className="link-brand">
            К статистике
          </Link>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((filter) => {
          const active = statusFilter === filter.value;
          const count = counts[filter.value];
          const dueIdle = filter.value === "due" && !active && count > 0;
          return (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatusFilter(filter.value)}
              className={
                active
                  ? "interactive rounded-full bg-brand-600 px-3 py-1 text-[11px] font-semibold text-white shadow-soft"
                  : dueIdle
                    ? "interactive rounded-full border border-status-warning-border bg-status-warning-bg px-3 py-1 text-[11px] font-semibold text-status-warning-text"
                    : "interactive rounded-full border border-border bg-surface px-3 py-1 text-[11px] text-muted hover:text-foreground"
              }
            >
              {filter.label}
              <span className="ml-1 tabular-nums opacity-80">{count}</span>
            </button>
          );
        })}
      </div>

      <div
        className={
          supervises
            ? "grid gap-2 sm:grid-cols-[1fr_160px_220px]"
            : "grid gap-2 sm:grid-cols-[1fr]"
        }
      >
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск по ФИО или телефону"
        />
        {supervises ? (
          <Input
            type="date"
            value={createdOn}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(event) => {
              const value = event.target.value;
              patchQuery({
                created_on: value,
                created_by: value ? createdBy : "",
                manager_id: value ? "" : assignedManager,
              });
            }}
            title="Дата заведения"
          />
        ) : null}
        {supervises ? (
          <Select
            value={managerFilter}
            onChange={(event) => {
              const value = event.target.value;
              if (createdOn) {
                patchQuery({ created_by: value });
              } else {
                patchQuery({ manager_id: value });
              }
            }}
          >
            <option value="">{createdOn ? "Все, кто завёл" : "Все менеджеры"}</option>
            {managers.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.full_name}
              </option>
            ))}
          </Select>
        ) : null}
      </div>

      {error ? <p className="alert-danger">{error}</p> : null}

      {loading ? (
        <LoadingState text="Загрузка лидов..." />
      ) : items.length === 0 ? (
        <EmptyState
          action={
            createdOn ? (
              <Button type="button" onClick={() => patchQuery({ created_on: "", created_by: "" })}>
                Показать все лиды
              </Button>
            ) : (
              <Button type="button" onClick={() => router.push("/questionnaires/new")}>
                Добавить лид
              </Button>
            )
          }
        >
          {createdOn
            ? "За эту дату анкет нет."
            : "Здесь пусто. Заводите лид сразу, как набрали номер — даже если разговор не состоялся."}
        </EmptyState>
      ) : visibleItems.length === 0 ? (
        <EmptyState>В этом статусе сейчас никого нет.</EmptyState>
      ) : (
        <div className="overflow-x-auto lg:rounded-lg lg:border lg:border-border lg:bg-surface lg:shadow-soft">
          <table className="data-table table-cards text-xs">
            <thead>
              <tr>
                <th>Клиент</th>
                <th>Телефон</th>
                <th>Статус</th>
                <th>Звонки</th>
                <th>Перезвон</th>
                <th>Приём</th>
                <th>Менеджер</th>
                {hideAmounts ? null : <th>Стоимость</th>}
                <th>Клиент заведён</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => {
                const due = isLeadCallbackDue(item) || isLeadAppointmentDue(item);
                const callback = formatCallbackCell(item.next_call_at);
                const appointment = formatAppointmentCell(item);
                const tel = phoneToTelHref(item.phone);
                const phoneLabel = formatPhoneDisplay(item.phone);
                return (
                  <tr key={item.id} className={due ? "is-callback-due" : undefined}>
                    <td data-label="Клиент">
                      <Link href={`/questionnaires/${item.id}`} className="font-medium text-brand-700">
                        {leadTitle(item)}
                      </Link>
                      {item.lead_status === "unqualified" && item.unqualified_reason ? (
                        <p className="mt-0.5 text-[11px] leading-tight text-muted">
                          {item.unqualified_reason}
                        </p>
                      ) : null}
                    </td>
                    <td data-label="Телефон" className="whitespace-nowrap">
                      {tel ? (
                        <a
                          id={`tel-${item.id}`}
                          href={tel}
                          className="inline-block whitespace-nowrap tabular-nums text-foreground"
                        >
                          {phoneLabel}
                        </a>
                      ) : (
                        <span className="inline-block whitespace-nowrap tabular-nums">{phoneLabel}</span>
                      )}
                    </td>
                    <td data-label="Статус">
                      <Badge tone={leadStatusTone(item.lead_status)}>
                        {leadStatusLabel(item.lead_status)}
                      </Badge>
                    </td>
                    <td data-label="Звонки">{item.call_attempts || "—"}</td>
                    <td data-label="Перезвон">
                      <span className={callback.due ? "font-semibold text-status-warning-text" : undefined}>
                        {callback.text}
                      </span>
                    </td>
                    <td data-label="Приём">
                      <span className={appointment.due ? "font-semibold text-status-danger-text" : undefined}>
                        {appointment.text}
                      </span>
                    </td>
                    <td data-label="Менеджер">
                      {item.assigned_manager_name || item.created_by_name || "—"}
                    </td>
                    {hideAmounts ? null : (
                      <td data-label="Стоимость">
                        {item.service_cost ? formatMoney(item.service_cost) : "—"}
                      </td>
                    )}
                    <td data-label="Клиент заведён">
                      {item.client_id ? (
                        showClientLinks ? (
                          <Link href={`/clients/${item.client_id}`} className="link-brand">
                            Карточка
                          </Link>
                        ) : (
                          "заведён"
                        )
                      ) : hideAmounts ? (
                        <span className="font-semibold text-status-warning-text">нужен сбор</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function QuestionnairesPage() {
  return (
    <Suspense fallback={<LoadingState text="Загрузка..." />}>
      <QuestionnairesPageContent />
    </Suspense>
  );
}
