"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoMark } from "@/components/ui";
import { cn } from "@/lib/cn";
import { APP_CREATOR, APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { statusLabel } from "@/lib/format";
import { useAuth } from "@/modules/auth/AuthProvider";

const navItems = [
  { href: "/", label: "Дашборд", icon: "◈" },
  { href: "/clients", label: "Клиенты", icon: "◎" },
  { href: "/analytics", label: "Аналитика", icon: "◉", financeOnly: true },
  { href: "/tasks", label: "Задачи", icon: "◐", financeOnly: true },
  { href: "/expenses", label: "Расходы", icon: "◇", ownerOnly: true },
  { href: "/audit", label: "Журнал", icon: "▣", ownerOnly: true },
  { href: "/users", label: "Команда", icon: "◌", ownerOnly: true },
  { href: "/pricing", label: "Тарифы", icon: "◆", ownerOnly: true },
] as Array<{
  href: string;
  label: string;
  icon: string;
  ownerOnly?: boolean;
  financeOnly?: boolean;
}>;

function pageTitle(pathname: string): string {
  if (pathname === "/") return "Дашборд";
  if (pathname.startsWith("/clients/")) return "Карточка клиента";
  if (pathname.startsWith("/clients")) return "Клиенты";
  if (pathname.startsWith("/analytics")) return "Аналитика";
  if (pathname.startsWith("/tasks")) return "Задачи";
  if (pathname.startsWith("/expenses")) return "Расходы";
  if (pathname.startsWith("/audit")) return "Журнал";
  if (pathname.startsWith("/users")) return "Команда";
  if (pathname.startsWith("/pricing")) return "Тарифы";
  return "Панель управления";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const visibleNav = navItems.filter((item) => {
    if (item.ownerOnly && user?.role !== "owner") return false;
    if (item.financeOnly && user?.role === "call_center") return false;
    return true;
  });

  return (
    <div className="min-h-screen mesh-bg">
      <div className="mx-auto flex min-h-screen max-w-[1440px]">
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-white/10 bg-gradient-to-b from-brand-950 via-brand-900 to-brand-800 px-5 py-6 text-white lg:flex">
          <div className="flex items-center gap-3">
            <LogoMark />
            <div>
              <p className="text-lg font-bold tracking-tight">{APP_NAME}</p>
              <p className="text-[11px] leading-tight text-brand-400/90">{APP_TAGLINE}</p>
            </div>
          </div>

          <nav className="mt-10 space-y-1.5">
            {visibleNav.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-all duration-200",
                    active
                      ? "bg-white/12 text-white shadow-inner ring-1 ring-white/10"
                      : "text-brand-300 hover:bg-white/8 hover:text-white",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg text-base transition",
                      active
                        ? "bg-accent/20 text-accent-soft"
                        : "bg-white/5 text-brand-300 group-hover:bg-white/10 group-hover:text-white",
                    )}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-4">
            <Link
              href="/login"
              className="block rounded-2xl bg-white/8 p-4 text-sm font-medium text-brand-100 ring-1 ring-white/10 hover:bg-white/12"
            >
              Перейти в товарную рассрочку
            </Link>
            {user && (
              <div className="rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
                <p className="text-sm font-semibold">{user.full_name}</p>
                <p className="text-xs text-brand-300">{statusLabel(user.role)}</p>
                <button
                  onClick={logout}
                  className="mt-3 text-xs font-medium text-accent-soft transition hover:text-white"
                >
                  Выйти из системы
                </button>
              </div>
            )}
            <div className="text-[10px] leading-relaxed text-brand-400/80">
              <p>{APP_CREATOR.role}</p>
              <p className="text-brand-300/90">{APP_CREATOR.name}</p>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/75 px-4 py-4 backdrop-blur-xl lg:px-8">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 lg:hidden">
                <LogoMark className="h-9 w-9 text-xs" />
                <div>
                  <p className="font-bold text-slate-900">{APP_NAME}</p>
                  <p className="text-xs text-slate-500">{APP_TAGLINE}</p>
                </div>
              </div>
              <div className="hidden lg:block">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
                  {pageTitle(pathname)}
                </p>
              </div>
              {user && (
                <div className="text-right lg:hidden">
                  <p className="text-sm font-medium text-slate-900">{user.full_name}</p>
                  <button
                    onClick={logout}
                    className="text-xs text-brand-600 hover:underline"
                  >
                    Выйти
                  </button>
                </div>
              )}
            </div>
            <nav className="mt-3 flex gap-2 overflow-x-auto lg:hidden">
              {visibleNav.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition",
                      active
                        ? "bg-brand-700 text-white"
                        : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </header>

          <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
