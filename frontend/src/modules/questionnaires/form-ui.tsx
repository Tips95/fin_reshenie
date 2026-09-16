"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

export const fieldClass =
  "min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground shadow-soft outline-none placeholder:text-muted/80 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15";

export const textareaClass =
  "interactive min-h-[88px] w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm shadow-soft outline-none placeholder:text-muted/80 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15";

export function YesNo({
  value,
  onChange,
  yesLabel = "Да",
  noLabel = "Нет",
}: {
  value: boolean | null;
  onChange: (value: boolean) => void;
  yesLabel?: string;
  noLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      className="inline-flex h-10 shrink-0 items-center rounded-lg border border-border bg-surface-muted p-0.5"
    >
      <button
        type="button"
        role="radio"
        aria-checked={value === true}
        className={cn(
          "inline-flex h-9 min-w-[64px] items-center justify-center rounded-md px-3.5 text-sm font-medium transition-colors",
          value === true
            ? "bg-brand-600 text-white shadow-soft"
            : "text-muted hover:bg-surface hover:text-foreground",
        )}
        onClick={() => onChange(true)}
      >
        {yesLabel}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === false}
        className={cn(
          "inline-flex h-9 min-w-[64px] items-center justify-center rounded-md px-3.5 text-sm font-medium transition-colors",
          value === false
            ? "bg-chrome text-chrome-text shadow-soft"
            : "text-muted hover:bg-surface hover:text-foreground",
        )}
        onClick={() => onChange(false)}
      >
        {noLabel}
      </button>
    </div>
  );
}

export function QuestionRow({
  title,
  hint,
  required,
  error,
  field,
  children,
  details,
}: {
  title: string;
  hint?: string;
  required?: boolean;
  error?: string;
  field?: string;
  children: ReactNode;
  details?: ReactNode;
}) {
  return (
    <div
      data-field={field}
      className={cn(
        "rounded-xl px-3 py-3",
        error ? "bg-status-danger-bg ring-1 ring-status-danger-border" : "hover:bg-surface-muted/50",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-5 text-foreground">
            {title}
            {required ? <span className="text-brand-600"> *</span> : null}
          </p>
          {hint ? <p className="mt-0.5 text-xs leading-snug text-muted">{hint}</p> : null}
        </div>
        {children}
      </div>
      {details ? <div className="mt-3 max-w-2xl">{details}</div> : null}
      {error ? <p className="mt-1.5 text-xs text-status-danger-text">{error}</p> : null}
    </div>
  );
}

export function SectionCard({
  id,
  title,
  description,
  action,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-xl border border-border bg-surface shadow-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

export function InitialsAvatar({ name, phone }: { name: string; phone?: string }) {
  const source = name.trim() || phone?.trim() || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
      : source.slice(0, 2).toUpperCase();

  return (
    <div
      aria-hidden
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-base font-semibold tracking-wide text-brand-700 ring-1 ring-brand-100 sm:h-16 sm:w-16 sm:text-lg"
    >
      {initials}
    </div>
  );
}

export function MetricTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3.5 py-3 shadow-soft">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function SaveBar({
  dirty,
  saving,
  submitLabel,
  progressLabel,
  ready,
  onDiscard,
  extraActions,
}: {
  dirty: boolean;
  saving: boolean;
  submitLabel: string;
  progressLabel: string;
  ready: boolean;
  onDiscard?: () => void;
  extraActions?: ReactNode;
}) {
  return (
    <div className="sticky bottom-[calc(var(--mobile-nav-height)+var(--safe-area-bottom)+0.5rem)] z-20 mt-4 rounded-xl border border-border bg-surface/95 px-3 py-2.5 shadow-hover backdrop-blur sm:px-4 lg:bottom-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto min-w-0">
          {dirty ? (
            <p className="text-sm font-medium text-foreground">Есть несохранённые изменения</p>
          ) : ready ? (
            <p className="text-sm text-status-success-text">Анкета заполнена полностью</p>
          ) : (
            <p className="text-sm text-muted">{progressLabel}</p>
          )}
        </div>
        {dirty && onDiscard ? (
          <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={onDiscard}>
            Отменить
          </Button>
        ) : null}
        <Button type="submit" disabled={saving || (!dirty && Boolean(onDiscard))}>
          {saving ? "Сохранение..." : submitLabel}
        </Button>
        {extraActions}
      </div>
    </div>
  );
}

export const LEAD_SECTIONS = [
  { id: "overview", label: "Обзор" },
  { id: "contacts", label: "Контакты" },
  { id: "credits", label: "Кредиты" },
  { id: "family", label: "Доходы и семья" },
  { id: "property", label: "Имущество" },
  { id: "notes", label: "Примечания" },
  { id: "history", label: "История" },
] as const;

export type LeadSectionId = (typeof LEAD_SECTIONS)[number]["id"];
