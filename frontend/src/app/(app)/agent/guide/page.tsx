"use client";

import Link from "next/link";

import { PageHeader, SectionNav } from "@/components/ui";
import {
  AVITO_HOW,
  AVITO_TEMPLATES,
  CLIENT_FITS,
  CLIENT_UNSURE,
  CLIENT_UNSURE_NOTE,
  GUIDE_SECTIONS,
  OBJECTIONS,
  OTHER_CHANNELS,
  PROCESS_STEPS,
  QUICK_START,
  RULES_DO,
  RULES_DONT,
  TALK_SCRIPT,
  WEEK_PLAN,
  WHATSAPP_HOW,
  WHATSAPP_TEMPLATES,
} from "@/modules/agents/guide-content";
import { GuideBullets, GuideFaq, GuideSection, GuideTemplates } from "@/modules/agents/GuideBlocks";

export default function AgentGuidePage() {
  return (
    <div className="page-stack">
      <PageHeader
        title="Регламент работы"
        subtitle="Как находить клиентов, что говорить и чего делать нельзя. Прочитайте целиком до первого клиента и возвращайтесь, когда нужен готовый текст."
      />
      <SectionNav items={GUIDE_SECTIONS} />

      <GuideSection id="start" title="Коротко: как вы зарабатываете">
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-foreground">
          {QUICK_START.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
        <p className="text-sm text-muted">
          Как устроено банкротство и что отвечать на вопросы клиента — в разделе{" "}
          <Link href="/agent/learn" className="link-brand">
            «Обучение»
          </Link>
          .
        </p>
      </GuideSection>

      <GuideSection
        id="rules"
        title="Правила"
        description="Обязательны для всех. За нарушение — отключение от программы."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold text-status-success-text">Делаем</p>
            <GuideBullets items={RULES_DO} mark="✓" tone="ok" />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-status-danger-text">Никогда не делаем</p>
            <GuideBullets items={RULES_DONT} mark="✕" tone="no" />
          </div>
        </div>
      </GuideSection>

      <GuideSection id="client" title="Кто наш клиент">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">Подходит, если</p>
            <GuideBullets items={CLIENT_FITS} mark="✓" tone="ok" />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">Уточните у куратора, если</p>
            <GuideBullets items={CLIENT_UNSURE} mark="?" />
            <p className="mt-3 text-xs text-muted">{CLIENT_UNSURE_NOTE}</p>
          </div>
        </div>
      </GuideSection>

      <GuideSection id="process" title="Работа с клиентом по шагам">
        <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {PROCESS_STEPS.map((step, index) => (
            <li key={step.title} className="rounded-xl border border-border p-3.5">
              <p className="text-sm font-semibold text-foreground">
                <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs text-white">
                  {index + 1}
                </span>
                {step.title}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
        <p className="text-sm">
          Стоимость под любую сумму долга — в разделе{" "}
          <Link href="/agent/price" className="link-brand">
            «Прайс»
          </Link>
          .
        </p>
      </GuideSection>

      <GuideSection
        id="whatsapp"
        title="Статусы WhatsApp"
        description="Бесплатный канал, который видят все ваши знакомые. Для большинства менеджеров — источник первых клиентов."
      >
        <GuideBullets items={WHATSAPP_HOW} />
        <p className="text-sm font-semibold text-foreground">Готовые статусы</p>
        <GuideTemplates items={WHATSAPP_TEMPLATES} />
      </GuideSection>

      <GuideSection
        id="avito"
        title="Объявления на Авито"
        description="Сюда приходят люди, которые уже ищут решение, — самые «горячие» клиенты."
      >
        <GuideBullets items={AVITO_HOW} />
        <p className="text-sm font-semibold text-foreground">Готовое объявление</p>
        <GuideTemplates items={AVITO_TEMPLATES} />
      </GuideSection>

      <GuideSection id="channels" title="Другие каналы">
        <div className="grid gap-3 md:grid-cols-2">
          {OTHER_CHANNELS.map((item) => (
            <div key={item.title} className="rounded-xl border border-border p-3.5">
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.text}</p>
            </div>
          ))}
        </div>
      </GuideSection>

      <GuideSection
        id="talk"
        title="Первый разговор"
        description="Ваша задача — не продать, а понять ситуацию и записать на консультацию. Остальное сделает юрист."
      >
        <GuideTemplates items={TALK_SCRIPT} />
      </GuideSection>

      <GuideSection
        id="objections"
        title="Ответы на возражения"
        description="Если не знаете ответа — не придумывайте. Скажите, что уточните, и спросите куратора."
      >
        <GuideFaq items={OBJECTIONS} />
      </GuideSection>

      <GuideSection id="plan" title="План на неделю">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {WEEK_PLAN.map((item) => (
            <div key={item.title} className="rounded-xl border border-border p-3.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-foreground">{item.text}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted">
          Остались вопросы по работе — напишите своему куратору, его контакты в{" "}
          <Link href="/agent" className="link-brand">
            «Моём кабинете»
          </Link>
          .
        </p>
      </GuideSection>
    </div>
  );
}
