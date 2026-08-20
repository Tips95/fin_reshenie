"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { cn } from "@/lib/cn";

const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"] as const;

const MONTHS_FULL = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
] as const;

const MONTHS_SHORT = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
] as const;

type ParsedDate = { year: number; month: number; day: number };

function parseIsoDate(value: string | undefined): ParsedDate | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function parseIsoMonth(value: string | undefined): { year: number; month: number } | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function toIsoDate({ year, month, day }: ParsedDate): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toIsoMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function todayParts(): ParsedDate {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

function formatRuDate(value: string | undefined): string {
  const parsed = parseIsoDate(value);
  if (!parsed) return "";
  return `${String(parsed.day).padStart(2, "0")}.${String(parsed.month).padStart(2, "0")}.${parsed.year}`;
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (year < 1950 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function expandYear(year: number): number {
  if (year >= 100) return year;
  return year >= 50 ? 1900 + year : 2000 + year;
}

/** Пустая строка, ISO-дата или null, если ввод ещё неполный/некорректный. */
function parseFlexibleDate(raw: string): string | "" | null {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const iso = parseIsoDate(trimmed);
  if (iso && isRealDate(iso.year, iso.month, iso.day)) {
    return toIsoDate(iso);
  }

  const dotted = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/.exec(trimmed);
  if (dotted) {
    const day = Number(dotted[1]);
    const month = Number(dotted[2]);
    const year = expandYear(Number(dotted[3]));
    if (isRealDate(year, month, day)) {
      return toIsoDate({ year, month, day });
    }
    return null;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 8) {
    const day = Number(digits.slice(0, 2));
    const month = Number(digits.slice(2, 4));
    const year = Number(digits.slice(4, 8));
    if (isRealDate(year, month, day)) {
      return toIsoDate({ year, month, day });
    }
    return null;
  }

  return null;
}

function formatDisplayMonth(value: string | undefined): string {
  const parsed = parseIsoMonth(value);
  if (!parsed) return "Выберите месяц";
  const date = new Date(parsed.year, parsed.month - 1, 1);
  return new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function buildCalendarDays(year: number, month: number): Array<{ day: number; inMonth: boolean }> {
  const first = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0).getDate();
  const mondayOffset = (first.getDay() + 6) % 7;
  const cells: Array<{ day: number; inMonth: boolean }> = [];

  const prevMonthLast = new Date(year, month - 1, 0).getDate();
  for (let index = mondayOffset - 1; index >= 0; index -= 1) {
    cells.push({ day: prevMonthLast - index, inMonth: false });
  }
  for (let day = 1; day <= lastDay; day += 1) {
    cells.push({ day, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: cells.length - lastDay, inMonth: false });
  }
  return cells;
}

function emitChange(
  onChange: ((event: ChangeEvent<HTMLInputElement>) => void) | undefined,
  value: string,
) {
  onChange?.({
    target: { value },
  } as ChangeEvent<HTMLInputElement>);
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={className}
      aria-hidden
    >
      <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
      <path d="M8 3.5v4M16 3.5v4M3.5 10h17" strokeLinecap="round" />
    </svg>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
      <path
        d={direction === "left" ? "M12 4l-6 6 6 6" : "M8 4l6 6-6 6"}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return { open, setOpen, rootRef };
}

const triggerClassName =
  "interactive flex w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-2 py-1 text-left text-xs shadow-soft outline-none transition-colors hover:border-border-strong focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 disabled:cursor-not-allowed disabled:opacity-50";

type PickerBaseProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> & {
  value?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function DatePicker({
  value = "",
  onChange,
  className,
  disabled,
  required,
  id,
  name,
  placeholder,
}: PickerBaseProps) {
  const { open, setOpen, rootRef } = usePopover();
  const selected = parseIsoDate(value);
  const today = todayParts();
  const initialView = selected ?? today;
  const [viewYear, setViewYear] = useState(initialView.year);
  const [viewMonth, setViewMonth] = useState(initialView.month);
  const [typed, setTyped] = useState(() => formatRuDate(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    const parsed = parseIsoDate(value);
    if (parsed) {
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    }
    if (!focusedRef.current) {
      setTyped(formatRuDate(value));
    }
  }, [value]);

  const days = useMemo(() => buildCalendarDays(viewYear, viewMonth), [viewYear, viewMonth]);

  function pickDay(day: number) {
    const next = toIsoDate({ year: viewYear, month: viewMonth, day });
    emitChange(onChange, next);
    setTyped(formatRuDate(next));
    setOpen(false);
  }

  function shiftMonth(delta: number) {
    const date = new Date(viewYear, viewMonth - 1 + delta, 1);
    setViewYear(date.getFullYear());
    setViewMonth(date.getMonth() + 1);
  }

  function commitTyped(raw: string) {
    const parsed = parseFlexibleDate(raw);
    if (parsed === "") {
      emitChange(onChange, "");
      setTyped("");
      return;
    }
    if (parsed) {
      emitChange(onChange, parsed);
      setTyped(formatRuDate(parsed));
      return;
    }
    setTyped(formatRuDate(value));
  }

  function handleTypedChange(next: string) {
    const cleaned = next.replace(/[^\d.\-/]/g, "").slice(0, 10);
    setTyped(cleaned);
    const parsed = parseFlexibleDate(cleaned);
    if (parsed === "") {
      emitChange(onChange, "");
      return;
    }
    if (parsed) {
      emitChange(onChange, parsed);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="flex items-stretch gap-1">
        <input
          type="text"
          autoComplete="off"
          id={id}
          disabled={disabled}
          required={required}
          placeholder={placeholder || "дд.мм.гггг"}
          value={typed}
          aria-label="Дата, можно ввести вручную"
          className="interactive min-h-[40px] w-full rounded-md border border-border bg-surface px-2 py-1 text-sm shadow-soft outline-none placeholder:text-muted focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-[32px] lg:text-xs"
          onFocus={() => {
            focusedRef.current = true;
          }}
          onBlur={() => {
            focusedRef.current = false;
            commitTyped(typed);
          }}
          onChange={(event) => handleTypedChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitTyped(typed);
            }
          }}
        />
        <button
          type="button"
          disabled={disabled}
          aria-label="Открыть календарь"
          aria-haspopup="dialog"
          aria-expanded={open}
          className="interactive flex w-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-brand-600 shadow-soft hover:border-brand-600 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => setOpen((current) => !current)}
        >
          <CalendarIcon className="h-4 w-4" />
        </button>
      </div>
      {name ? <input type="hidden" name={name} value={value} required={required} /> : null}
      {open ? (
        <div
          role="dialog"
          aria-label="Выбор даты"
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-[min(100vw-2rem,18rem)] rounded-xl border border-border bg-surface p-3 shadow-hover"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              className="interactive rounded-md border border-border p-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
              aria-label="Предыдущий месяц"
              onClick={() => shiftMonth(-1)}
            >
              <Chevron direction="left" />
            </button>
            <p className="text-sm font-semibold capitalize text-foreground">
              {MONTHS_FULL[viewMonth - 1]} {viewYear}
            </p>
            <button
              type="button"
              className="interactive rounded-md border border-border p-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
              aria-label="Следующий месяц"
              onClick={() => shiftMonth(1)}
            >
              <Chevron direction="right" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((label) => (
              <span
                key={label}
                className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted"
              >
                {label}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((cell, index) => {
              if (!cell.inMonth) {
                return <span key={`pad-${index}`} className="h-9" aria-hidden />;
              }
              const isSelected =
                selected?.year === viewYear &&
                selected.month === viewMonth &&
                selected.day === cell.day;
              const isToday =
                today.year === viewYear && today.month === viewMonth && today.day === cell.day;
              return (
                <button
                  key={`${viewYear}-${viewMonth}-${cell.day}`}
                  type="button"
                  onClick={() => pickDay(cell.day)}
                  className={cn(
                    "interactive h-9 rounded-lg text-xs font-medium transition-colors",
                    isSelected
                      ? "bg-brand-600 text-white shadow-soft"
                      : isToday
                        ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200"
                        : "text-foreground hover:bg-surface-muted",
                  )}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
            <button
              type="button"
              className="interactive text-xs font-medium text-brand-700 hover:text-brand-600"
              onClick={() => {
                const next = toIsoDate(today);
                emitChange(onChange, next);
                setTyped(formatRuDate(next));
                setViewYear(today.year);
                setViewMonth(today.month);
                setOpen(false);
              }}
            >
              Сегодня
            </button>
            {value ? (
              <button
                type="button"
                className="interactive text-xs font-medium text-muted hover:text-foreground"
                onClick={() => {
                  emitChange(onChange, "");
                  setTyped("");
                  setOpen(false);
                }}
              >
                Очистить
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MonthPicker({
  value = "",
  onChange,
  className,
  disabled,
  required,
  id,
  name,
}: PickerBaseProps) {
  const { open, setOpen, rootRef } = usePopover();
  const selected = parseIsoMonth(value);
  const today = todayParts();
  const [viewYear, setViewYear] = useState(selected?.year ?? today.year);

  useEffect(() => {
    const parsed = parseIsoMonth(value);
    if (parsed) setViewYear(parsed.year);
  }, [value]);

  function pickMonth(month: number) {
    emitChange(onChange, toIsoMonth(viewYear, month));
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={triggerClassName}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={cn("truncate capitalize", !value && "text-muted")}>
          {formatDisplayMonth(value)}
        </span>
        <CalendarIcon className="h-4 w-4 shrink-0 text-brand-600" />
      </button>
      {name ? <input type="hidden" name={name} value={value} required={required} /> : null}
      {open ? (
        <div
          role="dialog"
          aria-label="Выбор месяца"
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-[min(100vw-2rem,16rem)] rounded-xl border border-border bg-surface p-3 shadow-hover"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              className="interactive rounded-md border border-border p-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
              aria-label="Предыдущий год"
              onClick={() => setViewYear((year) => year - 1)}
            >
              <Chevron direction="left" />
            </button>
            <p className="text-sm font-semibold text-foreground">{viewYear}</p>
            <button
              type="button"
              className="interactive rounded-md border border-border p-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
              aria-label="Следующий год"
              onClick={() => setViewYear((year) => year + 1)}
            >
              <Chevron direction="right" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {MONTHS_SHORT.map((label, index) => {
              const month = index + 1;
              const isSelected = selected?.year === viewYear && selected.month === month;
              const isCurrent = today.year === viewYear && today.month === month;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => pickMonth(month)}
                  className={cn(
                    "interactive rounded-lg px-2 py-2 text-xs font-semibold capitalize transition-colors",
                    isSelected
                      ? "bg-brand-600 text-white shadow-soft"
                      : isCurrent
                        ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200"
                        : "text-foreground hover:bg-surface-muted",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
            <button
              type="button"
              className="interactive text-xs font-medium text-brand-700 hover:text-brand-600"
              onClick={() => {
                emitChange(onChange, toIsoMonth(today.year, today.month));
                setViewYear(today.year);
                setOpen(false);
              }}
            >
              Текущий месяц
            </button>
            {value ? (
              <button
                type="button"
                className="interactive text-xs font-medium text-muted hover:text-foreground"
                onClick={() => {
                  emitChange(onChange, "");
                  setOpen(false);
                }}
              >
                Очистить
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
