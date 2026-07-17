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
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-white/10 bg-gradient-to-b from-emerald-950 via-emerald-900 to-emerald-800 px-5 py-6 text-white lg:flex">
          <div className="flex items-center gap-3">
            <LogoMark />
            <div>
              <p className="text-lg font-bold tracking-tight">Товарная рассрочка</p>
              <p className="text-[11px] leading-tight text-emerald-300/90">Отдельный бизнес-контур</p>
            </div>
          </div>

          <nav className="mt-10 space-y-1.5">
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
                    "group flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-all duration-200",
                    active
                      ? "bg-white/12 text-white shadow-inner ring-1 ring-white/10"
                      : "text-emerald-300 hover:bg-white/8 hover:text-white",
                  )}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-base">
                    {item.icon}
                  </span>
                  {user?.role === "investor" && "investorLabel" in item && item.investorLabel
                    ? item.investorLabel
                    : item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-4">
            <Link
              href="/login"
              className="block rounded-2xl bg-white/8 p-4 text-sm font-medium text-emerald-100 ring-1 ring-white/10 hover:bg-white/12"
            >
              Перейти в юрфирму
            </Link>
            {user && (
              <div className="rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
                <p className="text-sm font-semibold">{user.full_name}</p>
                <p className="text-xs text-emerald-300">{statusLabel(user.role)}</p>
                <button
                  onClick={logout}
                  className="mt-3 text-xs font-medium text-emerald-100 transition hover:text-white"
                >
                  Выйти
                </button>
              </div>
            )}
            <div className="text-[10px] leading-relaxed text-emerald-400/80">
              <p>{APP_CREATOR.role}</p>
              <p className="text-emerald-300/90">{APP_CREATOR.name}</p>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/75 px-4 py-4 backdrop-blur-xl lg:px-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                  {pageTitle(pathname)}
                </p>
                <p className="text-sm text-slate-500">{APP_NAME}</p>
              </div>
              {user && (
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-900">{user.full_name}</p>
                  <button onClick={logout} className="text-xs text-emerald-700 hover:underline">
                    Выйти
                  </button>
                </div>
              )}
            </div>
            <nav className="mt-3 flex gap-2 overflow-x-auto lg:hidden">
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
                      "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition",
                      active ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-600",
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
          <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
