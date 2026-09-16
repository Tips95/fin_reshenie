"use client";

import { useState } from "react";

import { Badge, Button, FormField, Select } from "@/components/ui";
import { ApiRequestError, questionnairesApi } from "@/lib/api-client";
import {
  formatDate,
  formatDateTime,
  isLeadAppointmentDue,
  leadStatusLabel,
  leadStatusTone,
} from "@/lib/format";
import type { LeadActionKind } from "@/modules/questionnaires/LeadActionModal";
import type { LeadManagerOption, Questionnaire } from "@/lib/types";

export function LeadPanel({
  item,
  managers,
  canAssign,
  onUpdated,
  onError,
  onOpenAction,
}: {
  item: Questionnaire;
  managers: LeadManagerOption[];
  canAssign: boolean;
  onUpdated: (next: Questionnaire) => void;
  onError: (message: string) => void;
  onOpenAction: (kind: Exclude<LeadActionKind, null>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const converted = item.lead_status === "converted";
  const appointmentDue = isLeadAppointmentDue(item);

  async function reopen() {
    setBusy(true);
    try {
      onUpdated(await questionnairesApi.reopen(item.id));
    } catch (error) {
      onError(error instanceof ApiRequestError ? error.message : "Не удалось вернуть лид в работу");
    } finally {
      setBusy(false);
    }
  }

  async function assign(managerId: string | null) {
    setBusy(true);
    try {
      onUpdated(await questionnairesApi.assign(item.id, managerId));
    } catch (error) {
      onError(error instanceof ApiRequestError ? error.message : "Не удалось переназначить лид");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="status-panel" className="scroll-mt-24 space-y-3 rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5">
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
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Действия</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => onOpenAction("answered")}
            >
              Дозвонились
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => onOpenAction("no_answer")}
            >
              Не дозвонились
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy || item.lead_status === "unqualified"}
              onClick={() => onOpenAction("appointment")}
            >
              {item.appointment_at ? "Изменить приём" : "Записать на приём"}
            </Button>
            {item.lead_status === "unqualified" ? (
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void reopen()}>
                Вернуть в работу
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() => onOpenAction("unqualify")}
              >
                Некачественный лид
              </Button>
            )}
          </div>
        </div>
      )}

      {canAssign ? (
        <FormField label="Закреплён за менеджером">
          <Select
            value={item.assigned_manager_id ?? ""}
            disabled={busy}
            onChange={(event) => void assign(event.target.value || null)}
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
