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
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-slate-700 bg-slate-800 px-3 py-3 text-white lg:flex">
          <div className="flex items-center gap-2 border-b border-slate-700 pb-3">
            <LogoMark />
            <div>
              <p className="text-sm font-semibold leading-tight">{APP_NAME}</p>
              <p className="text-[10px] leading-tight text-slate-400">{APP_TAGLINE}</p>
            </div>
          </div>

          <nav className="mt-3 space-y-0.5">
            {visibleNav.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : item.href === "/clients/collection"
                    ? pathname.startsWith("/clients/collection")
                    : item.href === "/clients/contracts"
                      ? pathname.startsWith("/clients/contracts") ||
                        (pathname.startsWith("/clients/") &&
                          !pathname.startsWith("/clients/collection"))
                      : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded px-2 py-1.5 text-xs font-medium",
                    active
                      ? "bg-slate-700 text-white"
                      : "text-slate-300 hover:bg-slate-700/70 hover:text-white",
                  )}
                >
                  <span className="w-4 text-center text-[11px] opacity-70">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-2 border-t border-slate-700 pt-3">
            <Link
              href="/login"
              className="block rounded border border-slate-600 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
            >
              Товарная рассрочка
            </Link>
            {user && (
              <div className="rounded border border-slate-700 px-2 py-2">
                <p className="text-xs font-medium">{user.full_name}</p>
                <p className="text-[10px] text-slate-400">{statusLabel(user.role)}</p>
                <button
                  onClick={logout}
                  className="mt-1.5 text-[10px] text-slate-400 hover:text-white"
                >
                  Выйти
                </button>
              </div>
            )}
            <div className="text-[10px] leading-relaxed text-slate-500">
              <p>{APP_CREATOR.role}</p>
              <p>{APP_CREATOR.name}</p>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white px-3 py-2 lg:px-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 lg:hidden">
                <LogoMark className="h-7 w-7 text-[10px]" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{APP_NAME}</p>
                </div>
              </div>
              <div className="hidden lg:block">
                <p className="text-xs font-medium text-slate-600">{pageTitle(pathname)}</p>
              </div>
              {user && (
                <div className="text-right lg:hidden">
                  <p className="text-xs font-medium text-slate-900">{user.full_name}</p>
                  <button onClick={logout} className="text-[10px] text-slate-500 hover:underline">
                    Выйти
                  </button>
                </div>
              )}
            </div>
            <nav className="mt-2 flex gap-1 overflow-x-auto lg:hidden">
              {visibleNav.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : item.href === "/clients/collection"
                      ? pathname.startsWith("/clients/collection")
                      : item.href === "/clients/contracts"
                        ? pathname.startsWith("/clients/contracts") ||
                          (pathname.startsWith("/clients/") &&
                            !pathname.startsWith("/clients/collection"))
                        : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "whitespace-nowrap rounded px-2 py-1 text-[11px] font-medium",
                      active ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </header>

          <main className="flex-1 px-3 py-3 lg:px-4 lg:py-4">{children}</main>
        </div>
      </div>
    </div>
  );
}
