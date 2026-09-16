"use client";

import { useState } from "react";

import { Badge, Button, FormField, Input, Select } from "@/components/ui";
import { ApiRequestError, questionnairesApi } from "@/lib/api-client";
import {
  addDaysIsoDate,
  formatDate,
  formatDateTime,
  isLeadAppointmentDue,
  leadStatusLabel,
  leadStatusTone,
  todayIsoDate,
} from "@/lib/format";
import type { LeadManagerOption, Questionnaire } from "@/lib/types";

type OpenForm = "answered" | "no_answer" | "unqualified" | "appointment" | null;

const textareaClass =
  "interactive min-h-[56px] w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-soft outline-none placeholder:text-muted focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";

function tomorrowIsoDate(): string {
  return addDaysIsoDate(1);
}

export function LeadPanel({
  item,
  managers,
  canAssign,
  onUpdated,
  onError,
}: {
  item: Questionnaire;
  managers: LeadManagerOption[];
  canAssign: boolean;
  onUpdated: (next: Questionnaire) => void;
  onError: (message: string) => void;
}) {
  const [openForm, setOpenForm] = useState<OpenForm>(null);
  const [comment, setComment] = useState("");
  const [nextCallAt, setNextCallAt] = useState(tomorrowIsoDate());
  const [appointmentAt, setAppointmentAt] = useState(item.appointment_at?.slice(0, 10) || tomorrowIsoDate());
  const [appointmentNote, setAppointmentNote] = useState(item.appointment_note || "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const converted = item.lead_status === "converted";
  const appointmentDue = isLeadAppointmentDue(item);

  function closeForm() {
    setOpenForm(null);
    setComment("");
    setReason("");
    setNextCallAt(tomorrowIsoDate());
    setAppointmentAt(item.appointment_at?.slice(0, 10) || tomorrowIsoDate());
    setAppointmentNote(item.appointment_note || "");
  }

  function openAppointmentForm() {
    setAppointmentAt(item.appointment_at?.slice(0, 10) || tomorrowIsoDate());
    setAppointmentNote(item.appointment_note || "");
    setOpenForm("appointment");
  }

  async function run(action: () => Promise<Questionnaire>, fallback: string) {
    setBusy(true);
    try {
      onUpdated(await action());
      closeForm();
    } catch (error) {
      onError(error instanceof ApiRequestError ? error.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="surface-card space-y-3 px-3 py-2.5 lg:px-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Badge tone={leadStatusTone(item.lead_status)}>{leadStatusLabel(item.lead_status)}</Badge>
        <span className="text-[11px] text-muted">
          Попыток дозвона: {item.call_attempts}
          {item.last_call_at ? ` · последний ${formatDateTime(item.last_call_at)}` : ""}
        </span>
        {item.next_call_at ? (
          <span className="text-[11px] font-semibold text-status-warning-text">
            Перезвонить {formatDate(item.next_call_at)}
          </span>
        ) : null}
        {item.appointment_at ? (
          <span
            className={
              appointmentDue
                ? "text-[11px] font-semibold text-status-danger-text"
                : "text-[11px] font-semibold text-brand-700"
            }
          >
            Приём {formatDate(item.appointment_at)}
            {appointmentDue ? " · сегодня" : ""}
          </span>
        ) : null}
      </div>

      {item.appointment_note ? (
        <p className="rounded-md bg-surface-muted/60 px-2.5 py-2 text-[11px] leading-snug text-muted">
          К визиту: {item.appointment_note}
        </p>
      ) : null}

      {item.lead_status === "unqualified" && item.unqualified_reason ? (
        <p className="rounded-md bg-status-danger-bg px-2.5 py-2 text-[11px] leading-snug text-status-danger-text">
          Некачественный лид: {item.unqualified_reason}
        </p>
      ) : null}

      {converted ? (
        <p className="text-[11px] text-muted">
          Лид переведён в клиента — статусы обзвона больше не меняются.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => setOpenForm("answered")}>
            Дозвонились
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => setOpenForm("no_answer")}
          >
            Не дозвонились
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy || item.lead_status === "unqualified"}
            onClick={openAppointmentForm}
          >
            {item.appointment_at ? "Изменить приём" : "Записать на приём"}
          </Button>
          {item.lead_status === "unqualified" ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run(() => questionnairesApi.reopen(item.id), "Не удалось вернуть лид в работу")
              }
            >
              Вернуть в работу
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => setOpenForm("unqualified")}
            >
              Некачественный
            </Button>
          )}
        </div>
      )}

      {openForm === "answered" || openForm === "no_answer" ? (
        <div className="grid gap-2 rounded-md border border-border bg-surface-muted/30 px-2.5 py-2 sm:grid-cols-[1fr_170px]">
          <FormField label="Комментарий к звонку">
            <Input
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={
                openForm === "answered" ? "О чём договорились" : "Сбросил, вне зоны, занят..."
              }
            />
          </FormField>
          <FormField
            label={openForm === "no_answer" ? "Перезвонить" : "Перезвонить (если нужно)"}
          >
            <Input
              type="date"
              min={todayIsoDate()}
              value={openForm === "answered" && !nextCallAt ? "" : nextCallAt}
              onChange={(event) => setNextCallAt(event.target.value)}
            />
          </FormField>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    questionnairesApi.logCall(item.id, {
                      outcome: openForm,
                      comment: comment.trim() || null,
                      next_call_at: nextCallAt || null,
                    }),
                  "Не удалось записать звонок",
                )
              }
            >
              {busy ? "Сохранение..." : "Записать звонок"}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={closeForm}>
              Отмена
            </Button>
          </div>
        </div>
      ) : null}

      {openForm === "appointment" ? (
        <div className="space-y-2 rounded-md border border-border bg-surface-muted/30 px-2.5 py-2">
          <div className="grid gap-2 sm:grid-cols-[170px_1fr]">
            <FormField label="Дата приёма">
              <Input
                type="date"
                min={todayIsoDate()}
                value={appointmentAt}
                onChange={(event) => setAppointmentAt(event.target.value)}
              />
            </FormField>
            <FormField label="Комментарий">
              <Input
                value={appointmentNote}
                onChange={(event) => setAppointmentNote(event.target.value)}
                placeholder="Подойдёт после обеда, с супругой..."
              />
            </FormField>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { label: "Завтра", days: 1 },
                { label: "Через неделю", days: 7 },
                { label: "Через месяц", days: 30 },
              ] as const
            ).map((preset) => (
              <button
                key={preset.days}
                type="button"
                className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-medium text-muted hover:border-brand-600 hover:text-brand-700"
                onClick={() => setAppointmentAt(addDaysIsoDate(preset.days))}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy || !appointmentAt}
              onClick={() =>
                void run(
                  () =>
                    questionnairesApi.setAppointment(item.id, {
                      appointment_at: appointmentAt,
                      appointment_note: appointmentNote.trim() || null,
                    }),
                  "Не удалось записать на приём",
                )
              }
            >
              {busy ? "Сохранение..." : "Сохранить запись"}
            </Button>
            {item.appointment_at ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      questionnairesApi.setAppointment(item.id, {
                        appointment_at: null,
                        appointment_note: null,
                      }),
                    "Не удалось снять запись",
                  )
                }
              >
                Снять запись
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={closeForm}>
              Отмена
            </Button>
          </div>
        </div>
      ) : null}

      {openForm === "unqualified" ? (
        <div className="space-y-2 rounded-md border border-border bg-surface-muted/30 px-2.5 py-2">
          <FormField label="Почему лид некачественный">
            <textarea
              className={textareaClass}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Не тот регион, долг меньше 300 тысяч, ошиблись номером..."
            />
          </FormField>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="danger"
              disabled={busy || !reason.trim()}
              onClick={() =>
                void run(
                  () => questionnairesApi.unqualify(item.id, reason.trim()),
                  "Не удалось отметить лид",
                )
              }
            >
              {busy ? "Сохранение..." : "Отметить некачественным"}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={closeForm}>
              Отмена
            </Button>
          </div>
        </div>
      ) : null}

      {canAssign ? (
        <FormField label="Закреплён за менеджером">
          <Select
            value={item.assigned_manager_id ?? ""}
            disabled={busy}
            onChange={(event) =>
              void run(
                () => questionnairesApi.assign(item.id, event.target.value || null),
                "Не удалось переназначить лид",
              )
            }
          >
            <option value="">Не закреплён</option>
            {managers.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.full_name}
              </option>
            ))}
          </Select>
        </FormField>
      ) : (
        <p className="text-[11px] text-muted">
          Менеджер: {item.assigned_manager_name || item.created_by_name || "не закреплён"}
        </p>
      )}

      {item.calls.length > 0 ? (
        <div className="space-y-1 border-t border-border pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            История звонков
          </p>
          <ul className="space-y-1">
            {item.calls.map((call) => (
              <li key={call.id} className="flex flex-wrap items-baseline gap-x-2 text-[11px]">
                <span
                  className={
                    call.outcome === "answered"
                      ? "font-semibold text-status-success-text"
                      : "font-semibold text-status-warning-text"
                  }
                >
                  {call.outcome === "answered" ? "Дозвон" : "Недозвон"}
                </span>
                <span className="text-muted">{formatDateTime(call.created_at)}</span>
                <span className="text-muted">{call.created_by_name || "—"}</span>
                {call.comment ? <span className="text-foreground">{call.comment}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
