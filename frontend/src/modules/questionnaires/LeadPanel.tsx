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
import { fieldClass } from "@/modules/questionnaires/form-ui";
import type { LeadManagerOption, Questionnaire } from "@/lib/types";

type OpenForm = "answered" | "no_answer" | "unqualify" | "appointment" | null;

export function LeadPanel({
  item,
  managers,
  canAssign,
  onUpdated,
  onError,
  openForm: controlledOpen,
  onOpenFormChange,
}: {
  item: Questionnaire;
  managers: LeadManagerOption[];
  canAssign: boolean;
  onUpdated: (next: Questionnaire) => void;
  onError: (message: string) => void;
  openForm?: OpenForm;
  onOpenFormChange?: (next: OpenForm) => void;
}) {
  const [internalOpen, setInternalOpen] = useState<OpenForm>(null);
  const openForm = controlledOpen !== undefined ? controlledOpen : internalOpen;
  function setOpenForm(next: OpenForm) {
    onOpenFormChange?.(next);
    if (controlledOpen === undefined) setInternalOpen(next);
  }

  const [comment, setComment] = useState("");
  const [nextCallAt, setNextCallAt] = useState(addDaysIsoDate(1));
  const [appointmentAt, setAppointmentAt] = useState(
    item.appointment_at?.slice(0, 10) || addDaysIsoDate(1),
  );
  const [appointmentNote, setAppointmentNote] = useState(item.appointment_note || "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const converted = item.lead_status === "converted";
  const appointmentDue = isLeadAppointmentDue(item);

  function closeForm() {
    setOpenForm(null);
    setComment("");
    setReason("");
    setNextCallAt(addDaysIsoDate(1));
    setAppointmentAt(item.appointment_at?.slice(0, 10) || addDaysIsoDate(1));
    setAppointmentNote(item.appointment_note || "");
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
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone={leadStatusTone(item.lead_status)}>{leadStatusLabel(item.lead_status)}</Badge>
        <span className="text-xs text-muted">
          Попыток: {item.call_attempts}
          {item.last_call_at ? ` · ${formatDateTime(item.last_call_at)}` : ""}
        </span>
        {item.next_call_at ? (
          <span className="text-xs font-semibold text-status-warning-text">
            Перезвонить {formatDate(item.next_call_at)}
          </span>
        ) : null}
        {item.appointment_at ? (
          <span
            className={
              appointmentDue
                ? "text-xs font-semibold text-status-danger-text"
                : "text-xs font-semibold text-brand-700"
            }
          >
            Приём {formatDate(item.appointment_at)}
            {appointmentDue ? " · сегодня" : ""}
          </span>
        ) : null}
      </div>

      {item.appointment_note ? (
        <p className="rounded-lg bg-surface-muted/70 px-3 py-2 text-xs leading-snug text-muted">
          К визиту: {item.appointment_note}
        </p>
      ) : null}

      {item.lead_status === "unqualified" && item.unqualified_reason ? (
        <p className="rounded-lg bg-status-danger-bg px-3 py-2 text-xs leading-snug text-status-danger-text">
          Некачественный лид: {item.unqualified_reason}
        </p>
      ) : null}

      {converted ? (
        <p className="text-xs text-muted">Лид переведён в клиента — статусы обзвона больше не меняются.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Статус звонка</p>
          <div
            role="group"
            aria-label="Статус звонка"
            className="inline-flex flex-wrap rounded-lg border border-border bg-surface-muted p-0.5"
          >
            <button
              type="button"
              disabled={busy}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-surface hover:text-foreground disabled:opacity-50"
              onClick={() => setOpenForm("answered")}
            >
              ✓ Дозвонились
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-surface hover:text-foreground disabled:opacity-50"
              onClick={() => setOpenForm("no_answer")}
            >
              Не дозвонились
            </button>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy || item.lead_status === "unqualified"}
              onClick={() => {
                setAppointmentAt(item.appointment_at?.slice(0, 10) || addDaysIsoDate(1));
                setAppointmentNote(item.appointment_note || "");
                setOpenForm("appointment");
              }}
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
                variant="ghost"
                disabled={busy}
                onClick={() => setOpenForm("unqualify")}
              >
                Некачественный
              </Button>
            )}
          </div>
        </div>
      )}

      {openForm === "answered" || openForm === "no_answer" ? (
        <div className="grid gap-3 rounded-xl border border-border bg-surface-muted/40 p-3 sm:grid-cols-[1fr_180px]">
          <FormField label="Комментарий к звонку">
            <Input
              className={fieldClass}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={
                openForm === "answered" ? "О чём договорились" : "Сбросил, вне зоны, занят..."
              }
            />
          </FormField>
          <FormField label={openForm === "no_answer" ? "Перезвонить" : "Перезвонить (если нужно)"}>
            <Input
              className={fieldClass}
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
        <div className="space-y-3 rounded-xl border border-border bg-surface-muted/40 p-3">
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <FormField label="Дата приёма">
              <Input
                className={fieldClass}
                type="date"
                min={todayIsoDate()}
                value={appointmentAt}
                onChange={(event) => setAppointmentAt(event.target.value)}
              />
            </FormField>
            <FormField label="Комментарий">
              <Input
                className={fieldClass}
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
                className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-muted hover:border-brand-600 hover:text-brand-700"
                onClick={() => setAppointmentAt(addDaysIsoDate(preset.days))}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
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

      {openForm === "unqualify" ? (
        <div className="space-y-3 rounded-xl border border-border bg-surface-muted/40 p-3">
          <FormField label="Почему лид некачественный">
            <textarea
              className="interactive min-h-[88px] w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none placeholder:text-muted/80 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Не тот регион, долг меньше 300 тысяч, ошиблись номером..."
            />
          </FormField>
          <div className="flex gap-2">
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
        <p className="text-xs text-muted">
          Менеджер: {item.assigned_manager_name || item.created_by_name || "не закреплён"}
        </p>
      )}
    </div>
  );
}

export type LeadPanelOpenForm = OpenForm;
