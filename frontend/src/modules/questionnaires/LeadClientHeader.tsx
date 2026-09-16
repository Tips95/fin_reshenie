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

  return (
    <header className="rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-start gap-4">
        <InitialsAvatar name={item.full_name} phone={item.phone} />

        <div className="min-w-0 flex-1">
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

          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs text-muted">Телефон</dt>
              <dd className="mt-0.5 font-medium tabular-nums">
                {tel ? (
                  <a href={tel} className="text-foreground hover:text-brand-700">
                    {phoneLabel}
                  </a>
                ) : (
                  phoneLabel
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Регион</dt>
              <dd className="mt-0.5 font-medium">
                {item.registration_region?.trim() || "Не указано"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Последний контакт</dt>
              <dd className="mt-0.5 font-medium">
                {item.last_call_at ? formatDateTime(item.last_call_at) : "Ещё не звонили"}
              </dd>
            </div>
            {item.next_call_at ? (
              <div>
                <dt className="text-xs text-muted">Перезвонить</dt>
                <dd className="mt-0.5 font-semibold text-status-warning-text">
                  {formatDate(item.next_call_at)}
                </dd>
              </div>
            ) : null}
            {item.appointment_at ? (
              <div>
                <dt className="text-xs text-muted">Приём</dt>
                <dd
                  className={
                    appointmentDue
                      ? "mt-0.5 font-semibold text-status-danger-text"
                      : "mt-0.5 font-semibold text-brand-700"
                  }
                >
                  {formatDate(item.appointment_at)}
                  {appointmentDue ? " · сегодня" : ""}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end">
          {tel ? (
            <Button type="button" size="sm" onClick={() => {
              window.location.href = tel;
            }}>
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
