"use client";

import { formatDateTime } from "@/lib/format";
import { SectionCard } from "@/modules/questionnaires/form-ui";
import type { QuestionnaireCall } from "@/lib/types";

export function CallHistoryTimeline({ calls }: { calls: QuestionnaireCall[] }) {
  return (
    <SectionCard
      id="history"
      title="История контактов"
      description="Журнал попыток дозвона по этому лиду."
    >
      {calls.length === 0 ? (
        <p className="text-sm text-muted">Звонков пока нет — первая попытка появится здесь.</p>
      ) : (
        <ol className="relative space-y-0 border-l border-border pl-5">
          {calls.map((call) => (
            <li key={call.id} className="relative pb-5 last:pb-0">
              <span
                aria-hidden
                className={`absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-surface ${
                  call.outcome === "answered"
                    ? "bg-status-success-solid"
                    : "bg-status-warning-solid"
                }`}
              />
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="text-sm font-semibold text-foreground">
                  {call.outcome === "answered" ? "Дозвонились" : "Не дозвонились"}
                </p>
                <p className="text-xs text-muted">{formatDateTime(call.created_at)}</p>
              </div>
              <p className="mt-0.5 text-xs text-muted">{call.created_by_name || "—"}</p>
              {call.comment ? (
                <p className="mt-1.5 text-sm leading-snug text-foreground">{call.comment}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
