"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { LEAD_SECTIONS, type LeadSectionId } from "@/modules/questionnaires/form-ui";

export function LeadSectionNav({
  active,
  onSelect,
  className,
}: {
  active: LeadSectionId;
  onSelect: (id: LeadSectionId) => void;
  className?: string;
}) {
  return (
    <>
      <nav
        aria-label="Разделы карточки"
        className={cn(
          "hidden w-44 shrink-0 lg:block xl:w-48",
          className,
        )}
      >
        <ul className="sticky top-20 space-y-0.5 rounded-xl border border-border bg-surface p-1.5 shadow-soft">
          {LEAD_SECTIONS.map((section) => (
            <li key={section.id}>
              <button
                type="button"
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                  active === section.id
                    ? "bg-brand-50 text-brand-700"
                    : "text-muted hover:bg-surface-muted hover:text-foreground",
                )}
                onClick={() => onSelect(section.id)}
              >
                {section.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="lg:hidden">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {LEAD_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                active === section.id
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-border bg-surface text-muted hover:text-foreground",
              )}
              onClick={() => onSelect(section.id)}
            >
              {section.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export function useActiveLeadSection(defaultId: LeadSectionId = "overview") {
  const [active, setActive] = useState<LeadSectionId>(defaultId);

  useEffect(() => {
    const ids = LEAD_SECTIONS.map((section) => section.id);
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0]?.target.id as LeadSectionId | undefined;
        if (top) setActive(top);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0.15, 0.35, 0.55] },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function scrollTo(id: LeadSectionId) {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return { active, scrollTo };
}
