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
  { href: "/clients/collection", label: "Сбор документов", icon: "◫" },
  { href: "/clients/contracts", label: "Договоры", icon: "◎" },
  { href: "/analytics", label: "Аналитика", icon: "◉", ownerOnly: true },
  { href: "/tasks", label: "Задачи", icon: "◐" },
  { href: "/expenses", label: "Расходы", icon: "◇", ownerOnly: true },
  { href: "/audit", label: "Журнал", icon: "▣", ownerOnly: true },
  { href: "/users", label: "Команда", icon: "◌", ownerOnly: true },
  { href: "/pricing", label: "Тарифы", icon: "◆", ownerOnly: true },
] as Array<{
  href: string;
  label: string;
  icon: string;
  ownerOnly?: boolean;
}>;

function pageTitle(pathname: string): string {
  if (pathname === "/") return "Дашборд";
  if (pathname.startsWith("/clients/")) return "Карточка клиента";
  if (pathname.startsWith("/clients/collection")) return "Сбор документов";
  if (pathname.startsWith("/clients/contracts")) return "Договоры";
  if (pathname.startsWith("/clients")) return "Клиенты";
  if (pathname.startsWith("/analytics")) return "Аналитика";
  if (pathname.startsWith("/tasks")) return "Задачи";
  if (pathname.startsWith("/expenses")) return "Расходы";
  if (pathname.startsWith("/audit")) return "Журнал";
  if (pathname.startsWith("/users")) return "Команда";
  if (pathname.startsWith("/pricing")) return "Тарифы";
  return "Панель управления";
}

function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/clients/collection") return pathname.startsWith("/clients/collection");
  if (href === "/clients/contracts") {
    return (
      pathname.startsWith("/clients/contracts") ||
      (pathname.startsWith("/clients/") && !pathname.startsWith("/clients/collection"))
    );
  }
  return pathname.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const visibleNav = navItems.filter((item) => {
    if (item.ownerOnly && user?.role !== "owner") return false;
    return true;
  });

  return (
    <div className="min-h-screen mesh-bg">
      <div className="mx-auto flex min-h-screen max-w-[1440px]">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-brand-900 bg-brand-950 px-3 py-3 text-white shadow-card lg:flex">
          <div className="flex items-center gap-2 border-b border-brand-800 pb-3">
            <LogoMark />
            <div>
              <p className="text-sm font-semibold leading-tight">{APP_NAME}</p>
              <p className="text-[10px] leading-tight text-brand-300">{APP_TAGLINE}</p>
            </div>
          </div>

          <nav className="mt-3 space-y-0.5">
            {visibleNav.map((item) => {
              const active = isNavActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? "nav-item-active" : "nav-item-inactive"}
                >
                  <span className="w-4 text-center text-[11px] opacity-70">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-2 border-t border-brand-800 pt-3">
            <Link
              href="/login"
              className="interactive block rounded-md border border-brand-700 px-2 py-1.5 text-xs text-brand-200 hover:border-brand-600 hover:bg-brand-800 hover:text-white"
            >
              Товарная рассрочка
            </Link>
            {user && (
              <div className="rounded-md border border-brand-800 bg-brand-900/50 px-2 py-2">
                <p className="text-xs font-medium">{user.full_name}</p>
                <p className="text-[10px] text-brand-300">{statusLabel(user.role)}</p>
                <button
                  onClick={logout}
                  className="interactive mt-1.5 text-[10px] text-brand-300 hover:text-white"
                >
                  Выйти
                </button>
              </div>
            )}
            <div className="text-[10px] leading-relaxed text-brand-400">
              <p>{APP_CREATOR.role}</p>
              <p>{APP_CREATOR.name}</p>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-border bg-surface px-page-x py-2 shadow-soft lg:px-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 lg:hidden">
                <LogoMark className="h-7 w-7 text-[10px]" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{APP_NAME}</p>
                </div>
              </div>
              <div className="hidden lg:block">
                <p className="text-xs font-medium text-muted">{pageTitle(pathname)}</p>
              </div>
              {user && (
                <div className="text-right lg:hidden">
                  <p className="text-xs font-medium text-foreground">{user.full_name}</p>
                  <button
                    onClick={logout}
                    className="interactive text-[10px] text-muted hover:text-brand-700"
                  >
                    Выйти
                  </button>
                </div>
              )}
            </div>
            <nav className="mt-2 flex gap-1 overflow-x-auto lg:hidden">
              {visibleNav.map((item) => {
                const active = isNavActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "interactive whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
                      active
                        ? "bg-brand-700 text-white shadow-soft"
                        : "bg-surface-muted text-muted hover:bg-brand-50 hover:text-brand-800",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </header>

          <main className="flex-1 px-page-x py-page-y lg:px-4 lg:py-4">{children}</main>
        </div>
      </div>
    </div>
  );
}
