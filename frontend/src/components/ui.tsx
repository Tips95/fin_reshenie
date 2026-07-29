import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { APP_NAME } from "@/lib/brand";
import { PHONE_PREFIX, applyPhoneInput } from "@/lib/phone";
import { applyPassportInput, PASSPORT_PLACEHOLDER } from "@/lib/passport";

export function LogoMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md border border-brand-600 bg-brand-700 text-[11px] font-bold text-white shadow-soft",
        className,
      )}
    >
      FR
    </div>
  );
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}) {
  const variants = {
    primary:
      "border border-brand-700 bg-brand-700 text-white shadow-soft hover:border-brand-800 hover:bg-brand-800 hover:shadow-card",
    secondary:
      "border border-border bg-surface text-foreground shadow-soft hover:border-border-strong hover:bg-surface-muted hover:shadow-card",
    danger:
      "border border-status-danger-solid bg-status-danger-solid text-white shadow-soft hover:opacity-90 hover:shadow-card",
    ghost:
      "border border-transparent bg-transparent text-muted hover:bg-surface-muted hover:text-foreground",
  };

  // На телефоне минимальная высота поднимается до комфортной для пальца.
  const sizes = {
    sm: "px-2 py-1 text-[11px]",
    md: "px-2.5 py-1 text-xs min-h-[32px] lg:min-h-0",
    lg: "px-3.5 py-2 text-sm min-h-[40px]",
  };

  return (
    <button
      className={cn(
        "interactive inline-flex items-center justify-center gap-1 rounded-md font-medium disabled:cursor-not-allowed disabled:opacity-50",
        sizes[size],
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function ActionMenu({
  label = "Действия",
  children,
  align = "right",
  className,
}: {
  label?: string;
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
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

  return (
    <div ref={containerRef} className={cn("relative inline-block", className)}>
      <Button
        type="button"
        variant="secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
      >
        •••
      </Button>
      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute z-40 mt-1 min-w-[180px] rounded-md border border-border bg-surface p-1 shadow-hover",
            align === "right" ? "right-0" : "left-0",
          )}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function ActionMenuItem({
  tone = "default",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "default" | "danger" }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(tone === "danger" ? "action-menu-item-danger" : "action-menu-item", className)}
      {...props}
    />
  );
}

export function Input({
  className,
  type,
  onWheel,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        "interactive w-full rounded-md border border-border bg-surface px-2 py-1 text-xs shadow-soft outline-none placeholder:text-muted focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20",
        type === "number" &&
          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        className,
      )}
      onWheel={(event) => {
        if (type === "number") {
          event.currentTarget.blur();
        }
        onWheel?.(event);
      }}
      {...props}
    />
  );
}

export function PhoneInput({
  className,
  value,
  onValueChange,
  onFocus,
  onBlur,
  allowEmpty = false,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <Input
      type="tel"
      className={className}
      value={value}
      placeholder="+7 928 000-00-00"
      inputMode="tel"
      autoComplete="tel"
      onFocus={(event) => {
        if (!value && !allowEmpty) {
          onValueChange(PHONE_PREFIX);
        }
        onFocus?.(event);
      }}
      onBlur={(event) => {
        if (allowEmpty && value === PHONE_PREFIX) {
          onValueChange("");
        }
        onBlur?.(event);
      }}
      onChange={(event) => onValueChange(applyPhoneInput(value, event.target.value))}
      {...props}
    />
  );
}

export function PassportInput({
  className,
  value,
  onValueChange,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "inputMode"> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <Input
      type="text"
      className={className}
      value={value}
      placeholder={PASSPORT_PLACEHOLDER}
      inputMode="numeric"
      autoComplete="off"
      maxLength={12}
      onChange={(event) => onValueChange(applyPassportInput(value, event.target.value))}
      {...props}
    />
  );
}

export function Toast({
  message,
  tone = "success",
  onClose,
}: {
  message: string;
  tone?: "success" | "error" | "info";
  onClose?: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => onClose?.(), 4000);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);

  const tones = {
    success: "border-status-success-border bg-status-success-bg text-status-success-text",
    error: "border-status-danger-border bg-status-danger-bg text-status-danger-text",
    info: "border-status-neutral-border bg-surface text-status-neutral-text shadow-card",
  };

  return (
    <div
      className={cn(
        "interactive fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-2 rounded-lg border px-3 py-2 text-xs shadow-hover",
        tones[tone],
      )}
      role="status"
    >
      <span className="flex-1">{message}</span>
      {onClose && (
        <button
          type="button"
          className="interactive text-current/60 hover:text-current"
          onClick={onClose}
          aria-label="Закрыть"
        >
          ×
        </button>
      )}
    </div>
  );
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "interactive w-full rounded-md border border-border bg-surface px-2 py-1 text-xs shadow-soft outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20",
        className,
      )}
      {...props}
    />
  );
}

export function Card({
  id,
  className,
  children,
  variant = "default",
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
  variant?: "default" | "accent";
}) {
  const variants = {
    default: "surface-card-hover p-card",
    accent: "interactive rounded-lg border border-brand-200 bg-brand-50 p-card shadow-soft hover:shadow-card",
  };

  return (
    <div id={id} className={cn(variants[variant], className)}>
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const tones = {
    default: "border border-status-neutral-border bg-status-neutral-bg text-status-neutral-text",
    success: "border border-status-success-border bg-status-success-bg text-status-success-text",
    warning: "border border-status-warning-border bg-status-warning-bg text-status-warning-text",
    danger: "border border-status-danger-border bg-status-danger-bg text-status-danger-text",
  };

  return (
    <span className={cn("inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
  back,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  back?: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      {back}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
        <div>
          <h1 className="text-lg font-semibold leading-tight text-foreground">{title}</h1>
          {subtitle && <p className="mt-0.5 type-hint">{subtitle}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}

export function BackLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="back-link">
      <span aria-hidden>←</span>
      {children}
    </Link>
  );
}

export function SectionTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-1.5 flex flex-wrap items-start justify-between gap-2 border-b border-border pb-1.5">
      <div>
        <h2 className="section-title">{title}</h2>
        {description && <p className="mt-0.5 type-hint">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span>{children}</span>
      {action}
    </div>
  );
}

export function ProgressBar({
  value,
  tone = "default",
}: {
  value: number;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const fills = {
    default: "bg-status-neutral-solid",
    success: "bg-status-success-solid",
    warning: "bg-status-warning-solid",
    danger: "bg-status-danger-solid",
  };

  return (
    <div className="h-1 overflow-hidden rounded-sm bg-surface-muted">
      <div
        className={cn("interactive h-full", fills[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function FormField({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string | null;
}) {
  return (
    <div>
      <label className="mb-0.5 block text-xs font-medium text-muted">{label}</label>
      {children}
      {error ? <p className="mt-0.5 text-[11px] text-status-danger-text">{error}</p> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "brand";
  hint?: string;
}) {
  const valueColors = {
    default: "text-foreground",
    success: "text-status-success-text",
    warning: "text-status-warning-text",
    danger: "text-status-danger-text",
    brand: "text-brand-700",
  };

  return (
    <Card className="p-2.5">
      <p className="type-caption">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold leading-tight", valueColors[tone])}>{value}</p>
      {hint && <p className="mt-0.5 type-hint">{hint}</p>}
    </Card>
  );
}

export function LoadingState({ text = "Загрузка..." }: { text?: string }) {
  return (
    <div className="interactive flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted shadow-soft">
      <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-brand-700" />
      {text}
    </div>
  );
}

export function BrandFooter() {
  return (
    <p className="text-center text-[11px] text-muted">
      {APP_NAME} · финансовая платформа для юридической компании
    </p>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (total <= pageSize) {
    return null;
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted">
      <p>
        Показано {from}–{to} из {total}
      </p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          ← Назад
        </Button>
        <span className="px-2">
          {page} / {totalPages}
        </span>
        <Button
          type="button"
          variant="secondary"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Вперёд →
        </Button>
      </div>
    </div>
  );
}

export function CollapsibleCard({
  id,
  title,
  description,
  badge,
  defaultOpen = false,
  open,
  onOpenChange,
  children,
  className,
}: {
  id?: string;
  title: string;
  description?: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;

  function toggleOpen() {
    const next = !isOpen;
    if (open === undefined) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  }

  return (
    <Card id={id} className={cn("overflow-hidden p-0", className)}>
      <button
        type="button"
        className="collapsible-summary w-full text-left"
        aria-expanded={isOpen}
        onClick={toggleOpen}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="section-title">{title}</h2>
            {badge}
          </div>
          {description && <p className="mt-0.5 type-hint">{description}</p>}
        </div>
        <span className={cn("collapsible-chevron", isOpen && "rotate-180")} aria-hidden>
          ▼
        </span>
      </button>
      {isOpen ? <div className="border-t border-border p-card">{children}</div> : null}
    </Card>
  );
}
