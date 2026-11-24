"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge, Button, LoadingState, Modal } from "@/components/ui";
import { ApiRequestError, paymentRemindersApi } from "@/lib/api-client";
import { formatDate, formatMoney, formatMonthLabel, formatShortName } from "@/lib/format";
import type {
  PaymentRemindersPreview,
  PaymentRemindersSendResponse,
} from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  month: string;
};

export function PaymentRemindersModal({ open, onClose, month }: Props) {
  const [preview, setPreview] = useState<PaymentRemindersPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PaymentRemindersSendResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setPreview(await paymentRemindersApi.preview(month));
    } catch (err) {
      setPreview(null);
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

  async function handleSend() {
    if (!preview?.green_api_configured) return;
    setSending(true);
    setError(null);
    try {
      const response = await paymentRemindersApi.send({ month });
      setResult(response);
      setPreview(await paymentRemindersApi.preview(month));
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Не удалось отправить напоминания",
      );
    } finally {
      setSending(false);
    }
  }

  const sendable = preview
    ? preview.total - preview.without_phone_count
    : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Напомнить в WhatsApp"
      description={`Платежи за ${formatMonthLabel(month)}: обычные и с просрочкой`}
    >
      {loading && !preview ? <LoadingState text="Готовим список..." /> : null}

      {error ? <p className="alert-danger mb-3">{error}</p> : null}

      {preview ? (
        <div className="space-y-3">
          {!preview.green_api_configured ? (
            <p className="alert-warning">
              Green API ещё не подключён. Руководитель: откройте{" "}
              <a href="/settings" className="link-brand font-semibold">
                Настройки компании
              </a>{" "}
              и сохраните apiUrl, idInstance и apiTokenInstance из консоли Green API.
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniStat label="Всего" value={String(preview.total)} />
            <MiniStat label="К оплате" value={String(preview.due_count)} />
            <MiniStat label="Просрочка" value={String(preview.overdue_count)} />
            <MiniStat label="Без телефона" value={String(preview.without_phone_count)} />
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

          <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-md border border-border p-2">
            {preview.items.length === 0 ? (
              <p className="px-1 py-2 text-sm text-muted">
                Нет клиентов к напоминанию за выбранный месяц.
              </p>
            ) : (
              preview.items.map((item) => (
                <div
                  key={item.client_id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-surface-muted"
                >
                  <div className="min-w-0">
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
                    </p>
                  </div>
                  <p className="tabular text-sm font-semibold">{formatMoney(item.amount)}</p>
                </div>
              ))
            )}
          </div>

          {preview.items[0] ? (
            <details className="rounded-md border border-border px-3 py-2 text-xs text-muted">
              <summary className="cursor-pointer font-medium text-foreground">
                Пример текста
              </summary>
              <pre className="mt-2 whitespace-pre-wrap font-sans leading-relaxed">
                {preview.items[0].message}
              </pre>
            </details>
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
                sendable === 0
              }
            >
              {sending
                ? "Отправляем..."
                : `Отправить${sendable > 0 ? ` · ${sendable}` : ""}`}
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
