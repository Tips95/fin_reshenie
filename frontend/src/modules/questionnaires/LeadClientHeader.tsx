"use client";

import {
  ActionMenu,
  ActionMenuItem,
  Badge,
  Button,
  Modal,
} from "@/components/ui";
import {
  formatDate,
  formatDateTime,
  isLeadAppointmentDue,
  leadStatusLabel,
  leadStatusTone,
} from "@/lib/format";
import { formatPhoneDisplay, phoneToTelHref } from "@/lib/phone";
import { InitialsAvatar } from "@/modules/questionnaires/form-ui";
import type { Questionnaire } from "@/lib/types";

export function LeadClientHeader({
  item,
  canDelete,
  deleting,
  creatingClient,
  onCallAnswered,
  onCallNoAnswer,
  onBookAppointment,
  onUnqualify,
  onCreateClient,
  onOpenClient,
  onDelete,
  canOpenClient,
}: {
  item: Questionnaire;
  canDelete: boolean;
  deleting: boolean;
  creatingClient: boolean;
  onCallAnswered: () => void;
  onCallNoAnswer: () => void;
  onBookAppointment: () => void;
  onUnqualify: () => void;
  onCreateClient: () => void;
  onOpenClient: () => void;
  onDelete: () => void;
  canOpenClient: boolean;
}) {
  const title = item.full_name.trim() || formatPhoneDisplay(item.phone) || "Лид без имени";
  const phoneLabel = formatPhoneDisplay(item.phone);
  const tel = phoneToTelHref(item.phone);
  const appointmentDue = isLeadAppointmentDue(item);
  const converted = item.lead_status === "converted";
  const unqualified = item.lead_status === "unqualified";

  return (
    <header className="rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-start gap-3 sm:gap-4">
        <InitialsAvatar name={item.full_name} phone={item.phone} />

        <div className="min-w-0 flex-1 basis-[12rem]">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {title}
            </h1>
            <Badge tone={leadStatusTone(item.lead_status)}>{leadStatusLabel(item.lead_status)}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            {item.client_id ? "Привязан к карточке клиента" : "Клиент ещё не заведён"}
            {item.assigned_manager_name || item.created_by_name
              ? ` · ${item.assigned_manager_name || item.created_by_name}`
              : ""}
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:max-w-full sm:justify-end">
          {tel ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                window.location.href = tel;
              }}
            >
              Позвонить
            </Button>
          ) : null}
          {!converted ? (
            <>
              <Button type="button" size="sm" variant="secondary" onClick={onCallAnswered}>
                Дозвонились
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={onCallNoAnswer}>
                Не дозвонились
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={onBookAppointment}>
                {item.appointment_at ? "Изменить приём" : "Записать на приём"}
              </Button>
              {!unqualified ? (
                <Button type="button" size="sm" variant="danger" onClick={onUnqualify}>
                  Некачественный
                </Button>
              ) : null}
            </>
          ) : null}
          {item.client_id ? (
            canOpenClient ? (
              <Button type="button" size="sm" variant="secondary" onClick={onOpenClient}>
                Карточка клиента
              </Button>
            ) : null
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={creatingClient}
              onClick={onCreateClient}
            >
              {creatingClient ? "Создание..." : "Создать клиента"}
            </Button>
          )}
          {canDelete ? (
            <ActionMenu label="Дополнительные действия" align="right">
              <ActionMenuItem tone="danger" disabled={deleting} onClick={onDelete}>
                {deleting ? "Удаление..." : "Удалить анкету"}
              </ActionMenuItem>
            </ActionMenu>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">Телефон</p>
          <p className="mt-0.5 truncate text-sm font-medium tabular-nums">
            {tel ? (
              <a href={tel} className="text-foreground hover:text-brand-700">
                {phoneLabel}
              </a>
            ) : (
              phoneLabel
            )}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted">Регион</p>
          <p className="mt-0.5 truncate text-sm font-medium">
            {item.registration_region?.trim() || "Не указано"}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted">Последний контакт</p>
          <p className="mt-0.5 truncate text-sm font-medium">
            {item.last_call_at ? formatDateTime(item.last_call_at) : "Ещё не звонили"}
          </p>
        </div>
        {item.next_call_at ? (
          <div className="min-w-0">
            <p className="text-xs text-muted">Перезвонить</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-status-warning-text">
              {formatDate(item.next_call_at)}
            </p>
          </div>
        ) : null}
        {item.appointment_at ? (
          <div className="min-w-0">
            <p className="text-xs text-muted">Приём</p>
            <p
              className={
                appointmentDue
                  ? "mt-0.5 truncate text-sm font-semibold text-status-danger-text"
                  : "mt-0.5 truncate text-sm font-semibold text-brand-700"
              }
            >
              {formatDate(item.appointment_at)}
              {appointmentDue ? " · сегодня" : ""}
            </p>
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function DeleteLeadModal({
  open,
  onClose,
  onConfirm,
  deleting,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  deleting: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Удалить анкету?"
      description="Карточка клиента (если уже создана) не будет затронута. Это действие необратимо для записи лида."
    >
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" disabled={deleting} onClick={onClose}>
          Отмена
        </Button>
        <Button type="button" variant="danger" disabled={deleting} onClick={onConfirm}>
          {deleting ? "Удаление..." : "Удалить"}
        </Button>
      </div>
    </Modal>
  );
}
