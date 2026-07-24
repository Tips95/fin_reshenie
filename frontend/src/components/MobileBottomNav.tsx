"use client";

import Link from "next/link";
import { useState } from "react";

import { cn } from "@/lib/cn";

export type MobileNavItem = {
  href: string;
  label: string;
  icon: string;
  shortLabel?: string;
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/retail") return pathname === "/retail";
  if (href === "/clients/collection") return pathname.startsWith("/clients/collection");
  if (href === "/clients/contracts") {
    return (
      pathname.startsWith("/clients/contracts") ||
      (pathname.startsWith("/clients/") && !pathname.startsWith("/clients/collection"))
    );
  }
  return pathname.startsWith(href);
}

export function MobileBottomNav({
  items,
  primaryHrefs,
  pathname,
  extraLinks,
}: {
  items: MobileNavItem[];
  primaryHrefs: string[];
  pathname: string;
  extraLinks?: Array<{ href: string; label: string }>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const primaryItems = primaryHrefs
    .map((href) => items.find((item) => item.href === href))
    .filter((item): item is MobileNavItem => item !== undefined);
  const secondaryItems = items.filter((item) => !primaryHrefs.includes(item.href));
  const showMore = secondaryItems.length > 0 || (extraLinks?.length ?? 0) > 0;

  return (
    <>
      {menuOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          aria-label="Закрыть меню"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {menuOpen && (
        <div className="mobile-menu-sheet lg:hidden">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Разделы</p>
          <div className="space-y-1">
            {secondaryItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "interactive block rounded-md px-3 py-2 text-sm font-medium",
                  isActive(pathname, item.href)
                    ? "bg-brand-100 text-brand-800"
                    : "text-foreground hover:bg-surface-muted",
                )}
                onClick={() => setMenuOpen(false)}
              >
                <span className="mr-2 opacity-70">{item.icon}</span>
                {item.label}
              </Link>
            ))}
            {extraLinks?.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="interactive block rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-muted"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      <nav className="mobile-bottom-nav lg:hidden" aria-label="Основная навигация">
        {primaryItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn("mobile-bottom-nav-item", active && "mobile-bottom-nav-item-active")}
            >
              <span aria-hidden>{item.icon}</span>
              <span>{item.shortLabel ?? item.label}</span>
            </Link>
          );
        })}
        {showMore && (
          <button
            type="button"
            className={cn("mobile-bottom-nav-item", menuOpen && "mobile-bottom-nav-item-active")}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span aria-hidden>☰</span>
            <span>Ещё</span>
          </button>
        )}
      </nav>
    </>
  );
}
