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
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-slate-700 bg-slate-800 px-3 py-3 text-white lg:flex">
          <div className="flex items-center gap-2 border-b border-slate-700 pb-3">
            <LogoMark />
            <div>
              <p className="text-sm font-semibold leading-tight">Товарная рассрочка</p>
              <p className="text-[10px] leading-tight text-slate-400">Отдельный контур</p>
            </div>
          </div>

          <nav className="mt-3 space-y-0.5">
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
                    "flex items-center gap-2 rounded px-2 py-1.5 text-xs font-medium",
                    active
                      ? "bg-slate-700 text-white"
                      : "text-slate-300 hover:bg-slate-700/70 hover:text-white",
                  )}
                >
                  <span className="w-4 text-center text-[11px] opacity-70">{item.icon}</span>
                  {user?.role === "investor" && "investorLabel" in item && item.investorLabel
                    ? item.investorLabel
                    : item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-2 border-t border-slate-700 pt-3">
            <Link
              href="/login"
              className="block rounded border border-slate-600 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
            >
              Юрфирма
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
              <div>
                <p className="text-xs font-medium text-slate-600">{pageTitle(pathname)}</p>
                <p className="text-[11px] text-slate-400">{APP_NAME}</p>
              </div>
              {user && (
                <div className="text-right">
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
                  item.href === "/retail"
                    ? pathname === "/retail"
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
                    {user?.role === "investor" && "investorLabel" in item && item.investorLabel
                      ? item.investorLabel
                      : item.label}
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
