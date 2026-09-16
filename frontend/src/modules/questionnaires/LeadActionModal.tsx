"use client";

import { useEffect, useState } from "react";

import { Button, FormField, Input, Modal } from "@/components/ui";
import { ApiRequestError, questionnairesApi } from "@/lib/api-client";
import { addDaysIsoDate, todayIsoDate } from "@/lib/format";
import { fieldClass } from "@/modules/questionnaires/form-ui";
import type { Questionnaire } from "@/lib/types";

export type LeadActionKind = "answered" | "no_answer" | "unqualify" | "appointment" | null;

const TITLES: Record<Exclude<LeadActionKind, null>, string> = {
  answered: "Дозвонились",
  no_answer: "Не дозвонились",
  appointment: "Запись на приём",
  unqualify: "Некачественный лид",
};

export function LeadActionModal({
  item,
  kind,
  onClose,
  onUpdated,
  onError,
}: {
  item: Questionnaire;
  kind: LeadActionKind;
  onClose: () => void;
  onUpdated: (next: Questionnaire) => void;
  onError: (message: string) => void;
}) {
  const [comment, setComment] = useState("");
  const [nextCallAt, setNextCallAt] = useState(addDaysIsoDate(1));
  const [appointmentAt, setAppointmentAt] = useState(
    item.appointment_at?.slice(0, 10) || addDaysIsoDate(1),
  );
  const [appointmentNote, setAppointmentNote] = useState(item.appointment_note || "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!kind) return;
    setComment("");
    setReason("");
    setNextCallAt(addDaysIsoDate(1));
    setAppointmentAt(item.appointment_at?.slice(0, 10) || addDaysIsoDate(1));
    setAppointmentNote(item.appointment_note || "");
  }, [kind, item.appointment_at, item.appointment_note]);

  async function run(action: () => Promise<Questionnaire>, fallback: string) {
    setBusy(true);
    try {
      onUpdated(await action());
      onClose();
    } catch (error) {
      onError(error instanceof ApiRequestError ? error.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  function callbackDateForSubmit(): string | null {
    if (kind === "no_answer") {
      return nextCallAt || addDaysIsoDate(1);
    }
    return nextCallAt || null;
  }

  if (!kind) return null;

  return (
    <Modal open onClose={busy ? () => undefined : onClose} title={TITLES[kind]}>
      {kind === "answered" || kind === "no_answer" ? (
        <div className="space-y-3">
          <FormField label="Комментарий к звонку">
            <Input
              className={fieldClass}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={
                kind === "answered" ? "О чём договорились" : "Сбросил, вне зоны, занят..."
              }
              autoFocus
            />
          </FormField>
          <FormField
            label={kind === "no_answer" ? "Перезвонить" : "Перезвонить (если нужно)"}
          >
            <Input
              className={fieldClass}
              type="date"
              min={kind === "no_answer" ? addDaysIsoDate(1) : todayIsoDate()}
              value={kind === "answered" && !nextCallAt ? "" : nextCallAt || addDaysIsoDate(1)}
              onChange={(event) => setNextCallAt(event.target.value)}
            />
          </FormField>
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              Отмена
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    questionnairesApi.logCall(item.id, {
                      outcome: kind,
                      comment: comment.trim() || null,
                      next_call_at: callbackDateForSubmit(),
                    }),
                  "Не удалось записать звонок",
                )
              }
            >
              {busy ? "Сохранение..." : "Записать звонок"}
            </Button>
          </div>
        </div>
      ) : null}

      {kind === "appointment" ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <FormField label="Дата приёма">
              <Input
                className={fieldClass}
                type="date"
                min={todayIsoDate()}
                value={appointmentAt}
                onChange={(event) => setAppointmentAt(event.target.value)}
                autoFocus
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
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              Отмена
            </Button>
            {item.appointment_at ? (
              <Button
                type="button"
                variant="secondary"
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
            <Button
              type="button"
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
          </div>
        </div>
      ) : null}

      {kind === "unqualify" ? (
        <div className="space-y-3">
          <FormField label="Почему лид некачественный">
            <textarea
              className="interactive min-h-[88px] w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none placeholder:text-muted/80 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Не тот регион, долг меньше 300 тысяч, ошиблись номером..."
              autoFocus
            />
          </FormField>
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              Отмена
            </Button>
            <Button
              type="button"
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
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
