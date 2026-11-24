"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge, Button, LoadingState, Modal } from "@/components/ui";
import { ApiRequestError, paymentRemindersApi } from "@/lib/api-client";
import { formatDate, formatMoney, formatMonthLabel, formatShortName } from "@/lib/format";
import type {
  PaymentReminderItem,
  PaymentRemindersPreview,
  PaymentRemindersSendResponse,
} from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  month: string;
};

const TEXTAREA_CLASS =
  "interactive min-h-[96px] w-full rounded-lg border border-border bg-surface px-3 py-2 text-[13px] outline-none placeholder:text-muted focus:border-brand-600 focus:shadow-[var(--focus-ring)] focus:ring-0";

function selectableIds(items: PaymentReminderItem[]): string[] {
  return items.filter((item) => item.has_phone).map((item) => item.client_id);
}

/** «Иванов Иван» из ФИО. */
function surnameAndName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]} ${parts[1]}`;
  return parts[0] ?? "клиент";
}

function formatAmountRu(amount: string): string {
  const num = Number(amount);
  if (!Number.isFinite(num)) return amount;
  return `${num.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

function formatDateRu(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

function applyTemplate(
  template: string,
  item: Pick<PaymentReminderItem, "full_name" | "amount" | "due_date">,
): string {
  return template
    .replaceAll("{name}", surnameAndName(item.full_name))
    .replaceAll("{amount}", formatAmountRu(item.amount))
    .replaceAll("{date}", formatDateRu(item.due_date));
}

function buildMessages(
  items: PaymentReminderItem[],
  dueTemplate: string,
  overdueTemplate: string,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const item of items) {
    const template = item.kind === "overdue" ? overdueTemplate : dueTemplate;
    next[item.client_id] = applyTemplate(template, item);
  }
  return next;
}

export function PaymentRemindersModal({ open, onClose, month }: Props) {
  const [preview, setPreview] = useState<PaymentRemindersPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dueTemplate, setDueTemplate] = useState("");
  const [overdueTemplate, setOverdueTemplate] = useState("");
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PaymentRemindersSendResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setActiveClientId(null);
    try {
      const data = await paymentRemindersApi.preview(month);
      setPreview(data);
      setDueTemplate(data.due_template);
      setOverdueTemplate(data.overdue_template);
      setMessages(buildMessages(data.items, data.due_template, data.overdue_template));
      setSelected(new Set(selectableIds(data.items)));
    } catch (err) {
      setPreview(null);
      setSelected(new Set());
      setMessages({});
      setError(
        err instanceof ApiRequestError ? err.message : "Не удалось загрузить список получателей",
      );
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const phoneIds = useMemo(
    () => (preview ? selectableIds(preview.items) : []),
    [preview],
  );
  const selectedCount = phoneIds.filter((id) => selected.has(id)).length;
  const allSelected = phoneIds.length > 0 && selectedCount === phoneIds.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const activeItem =
    preview?.items.find((item) => item.client_id === activeClientId) ??
    preview?.items.find((item) => selected.has(item.client_id) && item.has_phone) ??
    null;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(phoneIds));
  }

  function toggleOne(clientId: string, hasPhone: boolean) {
    if (!hasPhone) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  function applyTemplatesToAll() {
    if (!preview) return;
    setMessages(buildMessages(preview.items, dueTemplate, overdueTemplate));
  }

  async function handleSend() {
    if (!preview?.green_api_configured || selectedCount === 0) return;
    const clientIds = phoneIds.filter((id) => selected.has(id));
    const payloadMessages: Record<string, string> = {};
    for (const id of clientIds) {
      const text = (messages[id] ?? "").trim();
      if (text) payloadMessages[id] = text;
    }
    setSending(true);
    setError(null);
    try {
      const response = await paymentRemindersApi.send({
        month,
        client_ids: clientIds,
        messages: payloadMessages,
      });
      setResult(response);
      const data = await paymentRemindersApi.preview(month);
      setPreview(data);
      setMessages(buildMessages(data.items, dueTemplate, overdueTemplate));
      const sentIds = new Set(
        response.items.filter((item) => item.status === "sent").map((item) => item.client_id),
      );
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of sentIds) next.delete(id);
        return next;
      });
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Не удалось отправить напоминания",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Напомнить в WhatsApp"
      description={`Платежи за ${formatMonthLabel(month)}: выберите получателей и при необходимости поправьте текст`}
    >
      {loading && !preview ? <LoadingState text="Готовим список..." /> : null}

      {error ? <p className="alert-danger mb-3">{error}</p> : null}

      {preview ? (
        <div className="space-y-3">
          {!preview.green_api_configured ? (
            <p className="alert-warning">
              Green API ещё не подключён. Откройте{" "}
              <a href="/settings" className="link-brand font-semibold">
                Настройки
              </a>{" "}
              и сохраните apiUrl, idInstance и apiTokenInstance из Green API.
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniStat label="Всего" value={String(preview.total)} />
            <MiniStat label="К оплате" value={String(preview.due_count)} />
            <MiniStat label="Просрочка" value={String(preview.overdue_count)} />
            <MiniStat label="Выбрано" value={String(selectedCount)} />
          </div>

          <div className="space-y-2 rounded-md border border-border p-2.5">
            <p className="text-xs font-semibold text-foreground">Шаблоны текста</p>
            <p className="text-[11px] text-muted">
              Подстановки: <code>{"{name}"}</code> — фамилия и имя,{" "}
              <code>{"{amount}"}</code> — сумма, <code>{"{date}"}</code> — дата.
            </p>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted">К оплате в месяце</span>
              <textarea
                className={TEXTAREA_CLASS}
                value={dueTemplate}
                onChange={(e) => setDueTemplate(e.target.value)}
                disabled={sending}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted">Просрочка</span>
              <textarea
                className={TEXTAREA_CLASS}
                value={overdueTemplate}
                onChange={(e) => setOverdueTemplate(e.target.value)}
                disabled={sending}
              />
            </label>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={applyTemplatesToAll}
              disabled={sending || preview.items.length === 0}
            >
              Применить шаблоны ко всем
            </Button>
          </div>

          {preview.already_sent_this_month > 0 ? (
            <p className="text-xs text-muted">
              Уже отправлено в этом месяце: {preview.already_sent_this_month} клиент.
            </p>
          ) : null}

          {result ? (
            <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm">
              <p className="font-semibold text-foreground">Результат рассылки</p>
              <p className="mt-1 text-muted">
                Отправлено: {result.sent} · Ошибки: {result.failed} · Пропущено: {result.skipped}
              </p>
              {result.items.filter((item) => item.status === "failed").length > 0 ? (
                <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-xs text-status-danger-text">
                  {result.items
                    .filter((item) => item.status === "failed")
                    .map((item) => (
                      <li key={item.client_id}>
                        {formatShortName(item.full_name)}: {item.error ?? "ошибка"}
                      </li>
                    ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-md border border-border">
            <label className="flex cursor-pointer items-center gap-2 border-b border-border bg-surface-muted px-2.5 py-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                className="accent-brand-700"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={toggleAll}
                disabled={phoneIds.length === 0 || sending}
              />
              <span>
                Выбрать всех с WhatsApp
                {phoneIds.length > 0 ? ` (${phoneIds.length})` : ""}
              </span>
            </label>

            <div className="max-h-48 space-y-0.5 overflow-y-auto p-1.5">
              {preview.items.length === 0 ? (
                <p className="px-1 py-2 text-sm text-muted">
                  Нет клиентов к напоминанию за выбранный месяц.
                </p>
              ) : (
                preview.items.map((item) => {
                  const checked = selected.has(item.client_id);
                  const isActive = activeItem?.client_id === item.client_id;
                  return (
                    <div
                      key={item.client_id}
                      className={`flex flex-wrap items-start justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-surface-muted ${
                        isActive ? "bg-surface-muted" : ""
                      } ${!item.has_phone ? "opacity-60" : ""}`}
                    >
                      <div className="flex min-w-0 items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1 accent-brand-700"
                          checked={checked && item.has_phone}
                          disabled={!item.has_phone || sending}
                          onChange={() => toggleOne(item.client_id, item.has_phone)}
                        />
                        <button
                          type="button"
                          className="min-w-0 text-left"
                          disabled={!item.has_phone}
                          onClick={() => setActiveClientId(item.client_id)}
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-semibold text-foreground">
                              {formatShortName(item.full_name)}
                            </span>
                            <Badge tone={item.kind === "overdue" ? "danger" : "default"}>
                              {item.kind === "overdue" ? "Просрочка" : "К оплате"}
                            </Badge>
                            {!item.has_phone ? <Badge tone="warning">Нет WA</Badge> : null}
                            {item.last_sent_at ? <Badge tone="default">Уже слали</Badge> : null}
                          </div>
                          <p className="mt-0.5 text-xs text-muted">
                            {item.phone} · до {formatDate(item.due_date)}
                            {item.has_phone ? " · нажмите, чтобы править текст" : ""}
                          </p>
                        </button>
                      </div>
                      <p className="tabular text-sm font-semibold">{formatMoney(item.amount)}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {activeItem ? (
            <label className="block space-y-1 rounded-md border border-border p-2.5">
              <span className="text-xs font-semibold text-foreground">
                Текст для {surnameAndName(activeItem.full_name)}
              </span>
              <textarea
                className={`${TEXTAREA_CLASS} min-h-[140px]`}
                value={messages[activeItem.client_id] ?? ""}
                onChange={(e) =>
                  setMessages((prev) => ({
                    ...prev,
                    [activeItem.client_id]: e.target.value,
                  }))
                }
                disabled={sending}
              />
            </label>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose} disabled={sending}>
              Закрыть
            </Button>
            <Button
              type="button"
              onClick={() => void handleSend()}
              disabled={
                sending ||
                loading ||
                !preview.green_api_configured ||
                selectedCount === 0
              }
            >
              {sending
                ? "Отправляем..."
                : `Отправить${selectedCount > 0 ? ` · ${selectedCount}` : ""}`}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-2.5 py-2">
      <p className="type-caption">{label}</p>
      <p className="tabular text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
