"use client";

import { CopyButton, PageHeader, SectionNav } from "@/components/ui";
import { GuideBullets, GuideFaq, GuideSection } from "@/modules/agents/GuideBlocks";
import { GLOSSARY, LESSONS, QUIZ } from "@/modules/agents/learn-content";

const NAV = [
  ...LESSONS.map(({ id, label }) => ({ id, label })),
  { id: "glossary", label: "Словарь" },
  { id: "quiz", label: "Проверь себя" },
];

export default function AgentLearnPage() {
  return (
    <div className="page-stack">
      <PageHeader
        title="Обучение"
        subtitle="Всё, что нужно знать о банкротстве, чтобы уверенно говорить с клиентом. Коротко и без юридических сложностей."
      />
      <p className="alert-warning text-sm">
        Здесь общие правила простыми словами. В каждом деле есть нюансы, поэтому конкретному клиенту
        окончательный ответ всегда даёт юрист на консультации. Ваша задача — понимать суть и не обещать
        лишнего.
      </p>
      <SectionNav items={NAV} />

      {LESSONS.map((lesson, index) => (
        <GuideSection key={lesson.id} id={lesson.id} title={`${index + 1}. ${lesson.title}`}>
          <div className="rounded-xl bg-brand-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">Простыми словами</p>
            <p className="mt-1 text-sm leading-relaxed text-foreground">{lesson.simply}</p>
          </div>
          <GuideBullets items={lesson.points} />
          {lesson.say ? (
            <div className="rounded-xl border border-border bg-surface-muted p-3.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">Как сказать клиенту</p>
                <CopyButton text={lesson.say} />
              </div>
              <p className="text-sm italic leading-relaxed text-foreground">«{lesson.say}»</p>
            </div>
          ) : null}
        </GuideSection>
      ))}

      <GuideSection id="glossary" title="Словарь" description="Слова, которые вы услышите от юристов и клиентов.">
        <dl className="grid gap-3 md:grid-cols-2">
          {GLOSSARY.map((item) => (
            <div key={item.term} className="rounded-xl border border-border p-3.5">
              <dt className="text-sm font-semibold text-foreground">{item.term}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted">{item.meaning}</dd>
            </div>
          ))}
        </dl>
      </GuideSection>

      <GuideSection
        id="quiz"
        title="Проверь себя"
        description="Сначала ответьте мысленно, потом нажмите на вопрос и сверьтесь."
      >
        <GuideFaq items={QUIZ} />
      </GuideSection>
    </div>
  );
}
