"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MobileBottomNav } from "@/components/MobileBottomNav";
import { LogoMark } from "@/components/ui";
import { APP_CREATOR } from "@/lib/brand";
import { statusLabel } from "@/lib/format";
import { cn } from "@/lib/cn";
import { getOrganizationFeatures } from "@/lib/organization-features";
import { WORKSPACE_LABELS } from "@/lib/workspace";
import { useOpenTasksCount } from "@/modules/tasks/useOpenTasksCount";
import { useAuth } from "@/modules/auth/AuthProvider";

const navItems = [
  { href: "/", label: "Дашборд", icon: "◈", shortLabel: "Дашборд" },
  {
    href: "/questionnaires",
    label: "Анкеты",
    icon: "▤",
    shortLabel: "Анкеты",
    roles: ["owner", "manager"],
  },
  {
    href: "/clients/collection",
    label: "Сбор документов",
    icon: "◫",
    shortLabel: "Сбор",
    feature: "document_collection" as const,
  },
  { href: "/clients/contracts", label: "Договоры", icon: "◎", shortLabel: "Договоры" },
  {
    href: "/analytics",
    label: "Аналитика",
    icon: "◉",
    ownerOnly: true,
    feature: "analytics" as const,
  },
  {
    href: "/tasks",
    label: "Задачи",
    icon: "◐",
    shortLabel: "Задачи",
    roles: ["owner", "manager"],
    feature: "tasks" as const,
  },
  {
    href: "/expenses",
    label: "Расходы",
    icon: "◇",
    ownerOnly: true,
    feature: "expenses" as const,
  },
  { href: "/audit", label: "Журнал", icon: "▣", ownerOnly: true },
  { href: "/users", label: "Команда", icon: "◌", ownerOnly: true },
  {
    href: "/pricing",
    label: "Тарифы",
    icon: "◆",
    ownerOnly: true,
    feature: "pricing" as const,
  },
  { href: "/settings", label: "Настройки", icon: "⚙", shortLabel: "Настр.", ownerOnly: true },
] as Array<{
  href: string;
  label: string;
  icon: string;
  shortLabel?: string;
  ownerOnly?: boolean;
  roles?: string[];
  feature?: keyof ReturnType<typeof getOrganizationFeatures>;
}>;

function pageTitle(pathname: string): string {
  if (pathname === "/") return "Дашборд";
  if (pathname.startsWith("/questionnaires")) return "Анкеты";
  if (pathname.startsWith("/clients/collection")) return "Сбор документов";
  if (pathname.startsWith("/clients/contracts")) return "Договоры";
  if (pathname.startsWith("/clients/")) return "Карточка клиента";
  if (pathname.startsWith("/clients")) return "Клиенты";
  if (pathname.startsWith("/analytics")) return "Аналитика";
  if (pathname.startsWith("/tasks")) return "Задачи";
  if (pathname.startsWith("/expenses")) return "Расходы";
  if (pathname.startsWith("/audit")) return "Журнал";
  if (pathname.startsWith("/users")) return "Команда";
  if (pathname.startsWith("/pricing")) return "Тарифы";
  if (pathname.startsWith("/settings")) return "Настройки";
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
  const openTasksCount = useOpenTasksCount();
  const features = getOrganizationFeatures(user);
  const companyName = user?.organization_name || WORKSPACE_LABELS.legal;

  const visibleNav = navItems.filter((item) => {
    if (item.ownerOnly && user?.role !== "owner") return false;
    if (item.roles && !item.roles.includes(user?.role ?? "")) return false;
    if (item.feature && !features[item.feature]) return false;
    return true;
  });

  const mobilePrimary = ["/", "/clients/contracts", "/tasks", "/settings"].filter((href) =>
    visibleNav.some((item) => item.href === href),
  );
  if (visibleNav.some((item) => item.href === "/questionnaires")) {
    mobilePrimary.splice(1, 0, "/questionnaires");
  }
  if (features.document_collection && !mobilePrimary.includes("/clients/collection")) {
    mobilePrimary.splice(mobilePrimary.includes("/questionnaires") ? 2 : 1, 0, "/clients/collection");
  }

  return (
    <div className="min-h-screen mesh-bg">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px]">
        <aside className="app-sidebar sticky top-0 hidden h-screen w-52 shrink-0 flex-col px-2 py-2 shadow-card lg:flex">
          <div className="flex items-center gap-2 border-b border-chrome-border pb-2">
            <LogoMark />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">{companyName}</p>
              <p className="text-[11px] leading-tight text-chrome-muted">{WORKSPACE_LABELS.legal}</p>
            </div>
          </div>

          <nav className="mt-2 space-y-0.5">
            {visibleNav.map((item) => {
              const active = isNavActive(pathname, item.href);
              const badge = item.href === "/tasks" ? openTasksCount : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(active ? "nav-item-active" : "nav-item-inactive", "relative")}
                >
                  <span className="w-4 text-center text-[11px] opacity-70">{item.icon}</span>
                  {item.label}
                  {badge > 0 ? (
                    <span className="absolute right-1 top-1/2 flex h-4 min-w-4 -translate-y-1/2 items-center justify-center rounded-full bg-status-danger-solid px-1 text-[11px] font-semibold text-white">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-2 border-t border-chrome-border pt-3">
            <Link
              href="/login"
              className="interactive block rounded-md border border-chrome-border px-2 py-1.5 text-xs text-chrome-muted hover:border-brand-600 hover:bg-chrome-hover hover:text-chrome-text"
            >
              {WORKSPACE_LABELS.retail}
            </Link>
            {user && (
              <div className="rounded-md border border-chrome-border bg-chrome-elevated px-2 py-2">
                <p className="text-xs font-medium">{user.full_name}</p>
                <p className="text-[11px] text-chrome-muted">{statusLabel(user.role)}</p>
                <button
                  onClick={logout}
                  className="interactive mt-1.5 text-[11px] text-chrome-muted hover:text-chrome-text"
                >
                  Выйти
                </button>
              </div>
            )}
            <div className="text-[11px] leading-relaxed text-chrome-muted opacity-70">
              <p>{APP_CREATOR.role}</p>
              <p>{APP_CREATOR.name}</p>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="app-header sticky top-0 z-20 px-page-x py-2 shadow-card backdrop-blur lg:px-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <LogoMark className="lg:hidden" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-chrome-text lg:text-xs lg:font-medium lg:text-chrome-muted">
                    {pageTitle(pathname)}
                  </p>
                  <p className="truncate text-[11px] text-chrome-muted lg:hidden">{companyName}</p>
                </div>
              </div>
              {user && (
                <div className="shrink-0 text-right">
                  <p className="max-w-[120px] truncate text-xs font-medium text-chrome-text sm:max-w-none">
                    {user.full_name}
                  </p>
                  <button
                    onClick={logout}
                    className="interactive text-[11px] text-chrome-muted hover:text-chrome-text lg:hidden"
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
            primaryHrefs={mobilePrimary}
            pathname={pathname}
            badges={{ "/tasks": openTasksCount }}
            extraLinks={[{ href: "/login", label: WORKSPACE_LABELS.retail }]}
          />
        </div>
      </div>
    </div>
  );
}
