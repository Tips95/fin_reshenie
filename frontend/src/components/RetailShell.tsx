"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoMark } from "@/components/ui";
import { cn } from "@/lib/cn";
import { APP_CREATOR, APP_NAME } from "@/lib/brand";
import { statusLabel } from "@/lib/format";
import { useAuth } from "@/modules/auth/AuthProvider";

const retailNavItems = [
  { href: "/retail", label: "Дашборд", icon: "◈", ownerOnly: false, investorOnly: false },
  { href: "/retail/contracts", label: "Договоры", icon: "◎", ownerOnly: false, investorOnly: false },
  { href: "/retail/clients", label: "Клиенты", icon: "◉", ownerOnly: false, investorOnly: false, investorLabel: "Мои клиенты" },
  { href: "/retail/capital", label: "Мой вклад", icon: "◇", ownerOnly: false, investorOnly: true },
  { href: "/retail/investors", label: "Инвесторы", icon: "◌", ownerOnly: true, investorOnly: false },
] as const;

function pageTitle(pathname: string): string {
  if (pathname === "/retail") return "Дашборд";
  if (pathname.startsWith("/retail/contracts/")) return "Договор";
  if (pathname.startsWith("/retail/contracts")) return "Договоры";
  if (pathname.startsWith("/retail/clients/")) return "Клиент";
  if (pathname.startsWith("/retail/clients")) return "Клиенты";
  if (pathname.startsWith("/retail/capital")) return "Мой вклад";
  if (pathname.startsWith("/retail/investors")) return "Инвесторы";
  return "Товарная рассрочка";
}

export function RetailShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const visibleNav = retailNavItems.filter((item) => {
    if (item.ownerOnly && user?.role !== "owner") return false;
    if (item.investorOnly && user?.role !== "investor") return false;
    return true;
  });

  return (
    <div className="min-h-screen mesh-bg">
      <div className="mx-auto flex min-h-screen max-w-[1440px]">
        <aside className="sticky top-0 hidden h-screen w-52 shrink-0 flex-col border-r border-brand-900 bg-brand-950 px-2 py-2 text-white shadow-card lg:flex">
          <div className="flex items-center gap-2 border-b border-brand-800 pb-2">
            <LogoMark />
            <div>
              <p className="text-sm font-semibold leading-tight">Товарная рассрочка</p>
              <p className="text-[10px] leading-tight text-brand-300">Отдельный контур</p>
            </div>
          </div>

          <nav className="mt-2 space-y-0.5">
            {visibleNav.map((item) => {
              const active =
                item.href === "/retail"
                  ? pathname === "/retail"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? "nav-item-active" : "nav-item-inactive"}
                >
                  <span className="w-4 text-center text-[11px] opacity-70">{item.icon}</span>
                  {user?.role === "investor" && "investorLabel" in item && item.investorLabel
                    ? item.investorLabel
                    : item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-2 border-t border-brand-800 pt-3">
            <Link
              href="/login"
              className="interactive block rounded-md border border-brand-700 px-2 py-1.5 text-xs text-brand-200 hover:border-brand-600 hover:bg-brand-800 hover:text-white"
            >
              Юрфирма
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
          <header className="sticky top-0 z-20 border-b border-border bg-surface px-page-x py-1.5 shadow-soft lg:px-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted">{pageTitle(pathname)}</p>
                <p className="text-[11px] text-muted">{APP_NAME}</p>
              </div>
              {user && (
                <div className="text-right">
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
                const active =
                  item.href === "/retail"
                    ? pathname === "/retail"
                    : pathname.startsWith(item.href);
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
                    {user?.role === "investor" && "investorLabel" in item && item.investorLabel
                      ? item.investorLabel
                      : item.label}
                  </Link>
                );
              })}
            </nav>
          </header>
          <main className="flex-1 px-page-x py-page-y lg:px-3 lg:py-2">{children}</main>
        </div>
      </div>
    </div>
  );
}
