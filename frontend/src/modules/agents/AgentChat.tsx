"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button, Input } from "@/components/ui";
import { ApiRequestError, agentChatApi } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import type { AgentChatMessage } from "@/lib/types";
import { textareaClass } from "@/modules/questionnaires/form-ui";

const POLL_MS = 15000;

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.message : fallback;
}

/** Лента сообщений с полем ввода; `load` должен быть стабильным (useCallback). */
export function ChatPanel({
  load,
  send,
  placeholder,
  emptyText,
}: {
  load: () => Promise<AgentChatMessage[]>;
  send: (body: string) => Promise<unknown>;
  placeholder: string;
  emptyText: string;
}) {
  const [messages, setMessages] = useState<AgentChatMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      setMessages(await load());
      setError(null);
    } catch (err) {
      setError(errorText(err, "Не удалось загрузить сообщения"));
    }
  }, [load]);

  useEffect(() => {
    setMessages(null);
    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const count = messages?.length ?? 0;
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [count]);

  async function submit() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await send(text);
      setBody("");
      await refresh();
    } catch (err) {
      setError(errorText(err, "Не удалось отправить сообщение"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <div ref={listRef} className="h-[55vh] min-h-[280px] space-y-2 overflow-y-auto p-3 sm:p-4">
        {messages === null ? (
          <p className="text-sm text-muted">Загрузка...</p>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">{emptyText}</p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "max-w-[85%] rounded-xl border px-3 py-2",
                message.mine
                  ? "ml-auto border-brand-200 bg-brand-50"
                  : message.from_agent
                    ? "border-border bg-surface-muted"
                    : "border-border bg-surface",
              )}
            >
              <p className="text-xs text-muted">
                <span className="font-semibold text-foreground">{message.mine ? "Вы" : message.author_name}</span>
                {!message.mine && !message.from_agent ? " · куратор" : null}
                {" · "}
                {formatDateTime(message.created_at)}
              </p>
              <p className="mt-0.5 whitespace-pre-line break-words text-sm leading-snug text-foreground">
                {message.body}
              </p>
            </div>
          ))
        )}
      </div>
      <div className="space-y-2 border-t border-border p-3">
        {error ? <p className="alert-danger text-sm">{error}</p> : null}
        <textarea
          className={textareaClass}
          rows={2}
          value={body}
          maxLength={4000}
          placeholder={placeholder}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="hidden text-xs text-muted sm:block">Ctrl + Enter — отправить</p>
          <Button type="button" disabled={sending || !body.trim()} onClick={() => void submit()}>
            {sending ? "Отправка..." : "Отправить"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function WhatsAppGroupLink({ url, label = "Вступить в группу куратора в WhatsApp" }: { url: string; label?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="interactive inline-flex items-center justify-center rounded-md bg-[#25D366] px-3.5 py-2 text-sm font-semibold text-white shadow-soft hover:bg-[#20bd5a]"
    >
      {label}
    </a>
  );
}

/** Куратор публикует ссылку-приглашение в свою группу WhatsApp для подопечных. */
export function WhatsAppGroupEditor() {
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  useEffect(() => {
    agentChatApi
      .whatsappGroup()
      .then(({ url: current }) => {
        setSaved(current);
        setUrl(current ?? "");
      })
      .catch(() => setSaved(null));
  }, []);

  async function save(next: string | null) {
    setBusy(true);
    setMessage(null);
    try {
      const { url: stored } = await agentChatApi.setWhatsappGroup(next);
      setSaved(stored);
      setUrl(stored ?? "");
      setMessage({
        tone: "success",
        text: stored ? "Ссылка опубликована — подопечные видят её в кабинете и в чате." : "Ссылка убрана.",
      });
    } catch (err) {
      setMessage({ tone: "danger", text: errorText(err, "Не удалось сохранить ссылку") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">
        Создайте группу в WhatsApp, откройте её → «Пригласить по ссылке» → скопируйте ссылку и вставьте сюда.
        Её увидят ваши подопечные удалённые менеджеры.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[220px] flex-1">
          <Input
            value={url}
            placeholder="https://chat.whatsapp.com/..."
            onChange={(event) => setUrl(event.target.value)}
          />
        </div>
        <Button
          type="button"
          disabled={busy || !url.trim() || url.trim() === saved}
          onClick={() => void save(url.trim())}
        >
          {saved ? "Обновить" : "Опубликовать"}
        </Button>
        {saved ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void save(null)}>
            Убрать
          </Button>
        ) : null}
      </div>
      {saved ? <WhatsAppGroupLink url={saved} label="Открыть мою группу" /> : null}
      {message ? <p className={`alert-${message.tone} text-sm`}>{message.text}</p> : null}
    </div>
  );
}
