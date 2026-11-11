"use client";

import { Card, CopyButton, SectionTitle } from "@/components/ui";

export type GuideTemplate = { title: string; text: string };

export function GuideBullets({
  items,
  mark = "•",
  tone,
}: {
  items: readonly string[];
  mark?: string;
  tone?: "ok" | "no";
}) {
  return (
    <ul className="space-y-2 text-sm text-foreground">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5">
          <span
            aria-hidden
            className={
              tone === "ok"
                ? "font-bold text-status-success-text"
                : tone === "no"
                  ? "font-bold text-status-danger-text"
                  : "text-muted"
            }
          >
            {mark}
          </span>
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function GuideTemplates({ items }: { items: readonly GuideTemplate[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((item) => (
        <div key={item.title} className="flex flex-col rounded-xl border border-border bg-surface-muted p-3.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">{item.title}</p>
            <CopyButton text={item.text} />
          </div>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{item.text}</p>
        </div>
      ))}
    </div>
  );
}

export function GuideSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-24">
      <SectionTitle title={title} description={description} />
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

export function GuideFaq({ items }: { items: readonly { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      {items.map((item) => (
        <details key={item.q} className="group px-3.5 py-3">
          <summary className="cursor-pointer list-none text-sm font-semibold text-foreground">
            <span className="mr-2 inline-block text-muted transition-transform group-open:rotate-90">›</span>
            {item.q}
          </summary>
          <p className="mt-2 pl-5 text-sm leading-relaxed text-muted">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
