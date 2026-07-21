import Link from "next/link";
import { useEffect } from "react";

import { cn } from "@/lib/cn";
import { APP_NAME } from "@/lib/brand";
import { PHONE_PREFIX, applyPhoneInput } from "@/lib/phone";

export function LogoMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded border border-slate-600 bg-slate-700 text-[11px] font-bold text-white",
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
    primary: "border border-brand-700 bg-brand-700 text-white hover:bg-brand-800",
    secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    danger: "border border-rose-700 bg-rose-700 text-white hover:bg-rose-800",
    ghost: "border border-transparent bg-transparent text-slate-600 hover:bg-slate-100",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded px-2.5 py-1.5 text-xs font-medium disabled:opacity-50",
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
        "w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-[13px] outline-none placeholder:text-slate-400 focus:border-brand-600 focus:ring-1 focus:ring-brand-600/30",
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
    success: "border-emerald-300 bg-emerald-50 text-emerald-900",
    error: "border-rose-300 bg-rose-50 text-rose-900",
    info: "border-slate-300 bg-white text-slate-700",
  };

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-2 rounded border px-3 py-2 text-xs",
        tones[tone],
      )}
      role="status"
    >
      <span className="flex-1">{message}</span>
      {onClose && (
        <button
          type="button"
          className="text-current/60 hover:text-current"
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
        "w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-[13px] outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600/30",
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
    default: "rounded border border-slate-200 bg-white p-3",
    glass: "rounded border border-slate-200 bg-white p-3",
    accent: "rounded border border-slate-300 bg-slate-50 p-3",
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
    default: "bg-slate-100 text-slate-700 border border-slate-200",
    success: "bg-emerald-50 text-emerald-800 border border-emerald-200",
    warning: "bg-amber-50 text-amber-900 border border-amber-200",
    danger: "bg-rose-50 text-rose-800 border border-rose-200",
  };

  return (
    <span className={cn("inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium", tones[tone])}>
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
    <div className="space-y-2">
      {back}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
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
    <div className="mb-2 flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2">
      <div>
        <h2 className="section-title">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
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
    default: "bg-slate-400",
    success: "bg-emerald-600",
    warning: "bg-amber-600",
    danger: "bg-rose-600",
  };

  return (
    <div className="h-1 overflow-hidden rounded-sm bg-slate-200">
      <div
        className={cn("h-full", fills[tone])}
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
      <label className="mb-0.5 block text-xs font-medium text-slate-600">{label}</label>
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
  const valueColors = {
    default: "text-slate-900",
    success: "text-emerald-700",
    warning: "text-amber-700",
    danger: "text-rose-700",
    brand: "text-slate-900",
    accent: "text-slate-900",
  };

  return (
    <Card className="p-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold leading-tight", valueColors[tone])}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </Card>
  );
}

export function LoadingState({ text = "Загрузка..." }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-4 text-xs text-slate-500">
      <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600" />
      {text}
    </div>
  );
}

export function BrandFooter() {
  return (
    <p className="text-center text-[11px] text-slate-400">
      {APP_NAME} · финансовая платформа для юридической компании
    </p>
  );
}
