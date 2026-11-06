"use client";

import { useState } from "react";

import { Button } from "@/components/ui";
import { ApiRequestError, questionnairesApi } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatDateTime, statusLabel } from "@/lib/format";
import { SectionCard, textareaClass } from "@/modules/questionnaires/form-ui";
import type { Questionnaire } from "@/lib/types";

export function LeadComments({
  item,
  agentMode,
  onUpdated,
  onError,
}: {
  item: Questionnaire;
  agentMode: boolean;
  onUpdated: (next: Questionnaire) => void;
  onError: (message: string) => void;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const comments = item.comments ?? [];

  async function send() {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    try {
      onUpdated(await questionnairesApi.addComment(item.id, text));
      setBody("");
    } catch (error) {
      onError(error instanceof ApiRequestError ? error.message : "Не удалось отправить комментарий");
    } finally {
      setSending(false);
    }
  }

  return (
    <SectionCard
      id="comments"
      title={agentMode ? "Вопросы куратору" : "Комментарии"}
      description={
        agentMode
          ? "Спросите куратора про этого клиента — ответ появится здесь."
          : item.source_agent_name
            ? `Переписка с удалённым менеджером ${item.source_agent_name} и офисом.`
            : "Заметки и вопросы по лиду для коллег."
      }
    >
      {comments.length === 0 ? (
        <p className="text-sm text-muted">Пока нет сообщений.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((comment) => {
            const fromAgent = comment.author_role === "agent";
            return (
              <li
                key={comment.id}
                className={cn(
                  "rounded-lg border px-3 py-2",
                  fromAgent ? "border-border bg-surface-muted" : "border-brand-600/20 bg-surface",
                )}
              >
                <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
                  <span className="font-semibold text-foreground">{comment.author_name || "—"}</span>
                  {comment.author_role ? <span>{statusLabel(comment.author_role)}</span> : null}
                  <span>{formatDateTime(comment.created_at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-line text-sm leading-snug text-foreground">
                  {comment.body}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 space-y-2">
        <textarea
          className={textareaClass}
          value={body}
          maxLength={4000}
          placeholder={agentMode ? "Например: клиент спрашивает, можно ли сохранить машину" : "Ответ или заметка"}
          onChange={(event) => setBody(event.target.value)}
        />
        <Button type="button" size="sm" disabled={sending || !body.trim()} onClick={() => void send()}>
          {sending ? "Отправка..." : "Отправить"}
        </Button>
      </div>
    </SectionCard>
  );
}
