"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MobileBottomNav } from "@/components/MobileBottomNav";
import { LogoMark } from "@/components/ui";
import { APP_CREATOR, APP_NAME } from "@/lib/brand";
import { statusLabel } from "@/lib/format";
import { useAuth } from "@/modules/auth/AuthProvider";

const retailNavItems = [
  { href: "/retail", label: "Дашборд", icon: "◈", shortLabel: "Дашборд" },
  { href: "/retail/contracts", label: "Договоры", icon: "◎", shortLabel: "Договоры" },
  {
    href: "/retail/clients",
    label: "Клиенты",
    icon: "◉",
    shortLabel: "Клиенты",
    investorLabel: "Мои клиенты",
  },
  { href: "/retail/capital", label: "Мой вклад", icon: "◇", shortLabel: "Вклад", investorOnly: true },
  { href: "/retail/investors", label: "Инвесторы", icon: "◌", shortLabel: "Инвест.", ownerOnly: true },
] as Array<{
  href: string;
  label: string;
  icon: string;
  shortLabel: string;
  investorLabel?: string;
  investorOnly?: boolean;
  ownerOnly?: boolean;
}>;

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

  const visibleNav = retailNavItems
    .filter((item) => {
      if (item.ownerOnly && user?.role !== "owner") return false;
      if (item.investorOnly && user?.role !== "investor") return false;
      return true;
    })
    .map((item) => ({
      href: item.href,
      icon: item.icon,
      shortLabel: item.shortLabel,
      label:
        user?.role === "investor" && "investorLabel" in item && item.investorLabel
          ? item.investorLabel
          : item.label,
    }));

  return (
    <div className="min-h-screen mesh-bg">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px]">
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
          <header className="sticky top-0 z-20 border-b border-border bg-surface/95 px-page-x py-2 shadow-soft backdrop-blur lg:px-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <LogoMark className="h-7 w-7 text-[10px] lg:hidden" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground lg:text-xs lg:font-medium lg:text-muted">
                    {pageTitle(pathname)}
                  </p>
                  <p className="truncate text-[11px] text-muted lg:hidden">{APP_NAME}</p>
                </div>
              </div>
              {user && (
                <div className="shrink-0 text-right">
                  <p className="max-w-[120px] truncate text-xs font-medium text-foreground sm:max-w-none">
                    {user.full_name}
                  </p>
                  <button
                    onClick={logout}
                    className="interactive text-[10px] text-muted hover:text-brand-700 lg:hidden"
                  >
                    Выйти
                  </button>
                </div>
              )}
            </div>
          </header>

          <main className="mobile-shell-main min-w-0 flex-1 px-page-x py-page-y lg:px-3 lg:py-2">
            {children}
          </main>

          <MobileBottomNav
            items={visibleNav}
            primaryHrefs={visibleNav.map((item) => item.href)}
            pathname={pathname}
            extraLinks={[{ href: "/login", label: "Юрфирма" }]}
          />
        </div>
      </div>
    </div>
  );
}
