"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MobileBottomNav } from "@/components/MobileBottomNav";
import { LogoMark } from "@/components/ui";
import { APP_CREATOR } from "@/lib/brand";
import { statusLabel } from "@/lib/format";
import { cn } from "@/lib/cn";
import { canUseCivilCases, canUseQuestionnaires, getOrganizationFeatures, isCollectionStaff, isCivilExecutor } from "@/lib/organization-features";
import { WORKSPACE_LABELS } from "@/lib/workspace";
import { useOpenTasksCount } from "@/modules/tasks/useOpenTasksCount";
import { useAuth } from "@/modules/auth/AuthProvider";

const navItems = [
  { href: "/", label: "Дашборд", icon: "◈", shortLabel: "Дашборд", hideFor: ["call_center"] },
  {
    href: "/questionnaires",
    label: "Лиды и анкеты",
    icon: "▤",
    shortLabel: "Лиды",
  },
  {
    href: "/questionnaires/stats",
    label: "Статистика лидов",
    icon: "◍",
    shortLabel: "Статист.",
    roles: ["owner", "manager", "head_manager"],
  },
  {
    href: "/civil-cases",
    label: "Гражданские дела",
    icon: "⚖",
    shortLabel: "Гражд.",
    roles: ["owner", "manager", "executor"],
  },
  {
    href: "/clients/collection",
    label: "Сбор документов",
    icon: "◫",
    shortLabel: "Сбор",
    feature: "document_collection" as const,
  },
  {
    href: "/clients/contracts",
    label: "Договоры",
    icon: "◎",
    shortLabel: "Договоры",
  },
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
    roles: ["owner", "manager", "head_manager"],
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
  hideFor?: string[];
  feature?: keyof ReturnType<typeof getOrganizationFeatures>;
}>;

function pageTitle(pathname: string): string {
  if (pathname === "/") return "Дашборд";
  if (pathname.startsWith("/questionnaires/stats")) return "Статистика лидов";
  if (pathname.startsWith("/questionnaires")) return "Лиды и анкеты";
  if (pathname.startsWith("/civil-cases")) return "Гражданские дела";
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
  if (href === "/questionnaires") {
    return pathname.startsWith("/questionnaires") && !pathname.startsWith("/questionnaires/stats");
  }
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
    if (isCivilExecutor(user)) return item.href === "/civil-cases";
    if (item.hideFor?.includes(user?.role ?? "")) return false;
    if (item.href === "/questionnaires") return canUseQuestionnaires(user);
    if (item.href === "/civil-cases") return canUseCivilCases(user);
    if (item.ownerOnly && user?.role !== "owner") return false;
    if (item.roles && !item.roles.includes(user?.role ?? "")) return false;
    if (item.feature && !features[item.feature]) return false;
    return true;
  });

  const mobilePrimary = (
    isCivilExecutor(user)
      ? ["/civil-cases"]
      : isCollectionStaff(user)
        ? ["/questionnaires", "/clients/collection", "/clients/contracts"]
        : ["/", "/questionnaires", "/questionnaires/stats", "/clients/contracts"]
  ).filter((href) => visibleNav.some((item) => item.href === href));

  return (
    <div className="min-h-screen mesh-bg">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px]">
        <aside className="app-sidebar sticky top-0 hidden h-screen w-56 shrink-0 flex-col px-2.5 py-3 shadow-card lg:flex">
          <div className="flex items-center gap-2.5 border-b border-chrome-border px-1 pb-3">
            <LogoMark />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight tracking-tight">{companyName}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-chrome-muted">{WORKSPACE_LABELS.legal}</p>
            </div>
          </div>

          <nav className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
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
                  <span className="min-w-0 truncate">{item.label}</span>
                  {badge > 0 ? (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1 text-[10px] font-bold text-white">
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
              className="interactive block rounded-lg border border-chrome-border px-2.5 py-2 text-xs text-chrome-muted hover:border-brand-600 hover:bg-chrome-hover hover:text-chrome-text"
            >
              {WORKSPACE_LABELS.retail}
            </Link>
            {user && (
              <div className="rounded-lg border border-chrome-border bg-chrome-elevated px-2.5 py-2.5">
                <p className="text-xs font-semibold tracking-tight">{user.full_name}</p>
                <p className="mt-0.5 text-[11px] text-chrome-muted">{statusLabel(user.role)}</p>
                <button
                  onClick={logout}
                  className="interactive mt-2 text-[11px] font-medium text-chrome-muted hover:text-chrome-text"
                >
                  Выйти
                </button>
              </div>
            )}
            <div className="px-0.5 text-[11px] leading-relaxed text-chrome-muted opacity-70">
              <p>{APP_CREATOR.role}</p>
              <p>{APP_CREATOR.name}</p>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="app-header sticky top-0 z-20 px-page-x py-2.5 shadow-soft lg:px-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <LogoMark className="lg:hidden" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold tracking-tight text-chrome-text lg:text-[13px] lg:font-medium lg:text-chrome-muted">
                    {pageTitle(pathname)}
                  </p>
                  <p className="truncate text-[11px] text-chrome-muted lg:hidden">{companyName}</p>
                </div>
              </div>
              {user && (
                <div className="shrink-0 text-right">
                  <p className="max-w-[140px] truncate text-xs font-semibold tracking-tight text-chrome-text sm:max-w-none">
                    {user.full_name}
                  </p>
                  <button
                    onClick={logout}
                    className="interactive text-[11px] font-medium text-chrome-muted hover:text-chrome-text lg:hidden"
                  >
                    Выйти
                  </button>
                </div>
              )}
            </div>
          </header>

          <main className="mobile-shell-main min-w-0 flex-1 px-page-x py-page-y lg:px-4 lg:py-3">
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
