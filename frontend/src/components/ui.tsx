import Link from "next/link";
import { useEffect } from "react";

import { cn } from "@/lib/cn";
import { APP_NAME } from "@/lib/brand";
import { PHONE_PREFIX, applyPhoneInput } from "@/lib/phone";

export function LogoMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 via-brand-700 to-brand-900 text-sm font-bold tracking-tight text-white shadow-lg shadow-brand-700/30",
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
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const variants = {
    primary:
      "bg-gradient-to-r from-brand-600 to-brand-700 text-white shadow-md shadow-brand-700/25 hover:from-brand-500 hover:to-brand-600 hover:shadow-lg",
    secondary:
      "border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-brand-400/40 hover:bg-brand-50/50",
    danger:
      "bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-md shadow-rose-600/20 hover:from-rose-500 hover:to-red-500",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100/80",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10",
        className,
      )}
      {...props}
    />
  );
}

export function PhoneInput({
  className,
  value,
  onValueChange,
  onFocus,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <Input
      type="tel"
      className={className}
      value={value}
      placeholder="+7 928 000-00-00"
      onFocus={(event) => {
        if (!value) {
          onValueChange(PHONE_PREFIX);
        }
        onFocus?.(event);
      }}
      onChange={(event) => onValueChange(applyPhoneInput(value, event.target.value))}
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
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    error: "border-rose-200 bg-rose-50 text-rose-800",
    info: "border-slate-200 bg-white text-slate-700",
  };

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-lg",
        tones[tone],
      )}
      role="status"
    >
      <span className="flex-1">{message}</span>
      {onClose && (
        <button
          type="button"
          className="text-current/60 transition hover:text-current"
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
        "w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm shadow-sm outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10",
        className,
      )}
      {...props}
    />
  );
}

export function Card({
  className,
  children,
  variant = "default",
}: {
  className?: string;
  children: React.ReactNode;
  variant?: "default" | "glass" | "accent";
}) {
  const variants = {
    default: "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card",
    glass: "glass-card rounded-2xl p-5",
    accent:
      "rounded-2xl border border-accent/20 bg-gradient-to-br from-white via-white to-accent-soft/30 p-5 shadow-card",
  };

  return <div className={cn(variants[variant], className)}>{children}</div>;
}

export function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const tones = {
    default: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
    success: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    warning: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
    danger: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  };

  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone])}>
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
    <div className="space-y-4">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="relative pl-4">
          <span className="absolute left-0 top-1 h-[calc(100%-4px)] w-1 rounded-full bg-gradient-to-b from-brand-400 via-brand-600 to-accent" />
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>}
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
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="section-title">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

export function ProgressBar({
  value,
  tone = "default",
}: {
  value: number;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const fills = {
    default: "bg-slate-300",
    success: "bg-gradient-to-r from-emerald-400 to-emerald-600",
    warning: "bg-gradient-to-r from-amber-300 to-amber-500",
    danger: "bg-gradient-to-r from-rose-400 to-red-600",
  };

  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div
        className={cn("h-full rounded-full transition-all duration-500", fills[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
      {children}
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
  tone?: "default" | "success" | "warning" | "danger" | "brand" | "accent";
  hint?: string;
}) {
  const tones = {
    default: "from-slate-500 to-slate-700",
    success: "from-emerald-500 to-emerald-700",
    warning: "from-amber-500 to-orange-600",
    danger: "from-rose-500 to-red-600",
    brand: "from-brand-400 to-brand-700",
    accent: "from-amber-400 to-accent",
  };

  const valueColors = {
    default: "text-slate-900",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-rose-600",
    brand: "text-brand-600",
    accent: "text-amber-700",
  };

  return (
    <Card className="relative overflow-hidden transition hover:shadow-soft">
      <div
        className={cn(
          "absolute left-0 top-0 h-full w-1 rounded-r-full bg-gradient-to-b",
          tones[tone],
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-20 blur-2xl",
          tone === "accent" ? "bg-accent" : tone === "brand" ? "bg-brand-400" : "bg-slate-300",
        )}
      />
      <p className="relative pl-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={cn("relative mt-3 pl-3 text-2xl font-bold tracking-tight", valueColors[tone])}>
        {value}
      </p>
      {hint && <p className="relative mt-1 pl-3 text-xs text-slate-400">{hint}</p>}
    </Card>
  );
}

export function LoadingState({ text = "Загрузка..." }: { text?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-8 text-sm text-slate-500 shadow-card">
      <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
      {text}
    </div>
  );
}

export function BrandFooter() {
  return (
    <p className="text-center text-xs text-slate-400">
      {APP_NAME} · финансовая платформа для юридической компании
    </p>
  );
}
