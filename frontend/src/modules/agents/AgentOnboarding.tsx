"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui";
import { useAuth } from "@/modules/auth/AuthProvider";

const TOUR_VERSION = "v1";

type Step = {
  title: string;
  body: string;
  /** Селектор подсветки; если элемента нет — только карточка. */
  target?: string;
  /** Куда перейти перед показом шага. */
  href?: string;
};

const STEPS: Step[] = [
  {
    title: "Добро пожаловать",
    body: "Коротко покажем, куда нажимать. Это займёт меньше минуты — потом подсказки можно снова открыть из «Ещё».",
  },
  {
    title: "Уведомления",
    body: "Колокольчик сверху справа. Сюда приходят ответы куратора, новости по вашим клиентам и рейтинг.",
    target: '[data-tour="notifications"]',
  },
  {
    title: "Мои клиенты",
    body: "Здесь все, кого вы завели. На телефоне — кнопка «Клиенты» внизу экрана.",
    href: "/questionnaires",
    target: '[data-tour="nav-/questionnaires"]',
  },
  {
    title: "Новый клиент",
    body: "Главная кнопка работы: заведите лида с согласия человека и заполните анкету. Куратор увидит его сразу.",
    href: "/questionnaires",
    target: '[data-tour="new-lead"]',
  },
  {
    title: "Чат с куратором",
    body: "Личные вопросы — куратору. Общие — в общий чат. Ссылку на его группу WhatsApp тоже найдёте здесь.",
    href: "/agent/chat",
    target: '[data-tour="nav-/agent/chat"]',
  },
  {
    title: "Прайс",
    body: "Посчитайте стоимость для клиента по сумме долга и скопируйте готовый текст сообщения.",
    href: "/agent/price",
    target: '[data-tour="nav-/agent/price"]',
  },
  {
    title: "Регламент и обучение",
    body: "Как искать клиентов, тексты для WhatsApp и Авито — в регламенте. Как устроено банкротство простыми словами — в обучении. На телефоне они в меню «Ещё».",
    href: "/agent/guide",
    target: '[data-tour="nav-/agent/guide"], [data-tour="nav-more"]',
  },
];

function storageKey(userId: string) {
  return `rassrochka_agent_tour_${TOUR_VERSION}:${userId}`;
}

function readDone(userId: string) {
  try {
    return localStorage.getItem(storageKey(userId)) === "1";
  } catch {
    return true;
  }
}

function writeDone(userId: string) {
  try {
    localStorage.setItem(storageKey(userId), "1");
  } catch {
    /* private mode */
  }
}

function highlight(selector: string | undefined) {
  document.querySelectorAll("[data-tour-active]").forEach((node) => {
    node.removeAttribute("data-tour-active");
  });
  if (!selector) return;
  const el = document.querySelector(selector);
  if (!el) return;
  el.setAttribute("data-tour-active", "1");
  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
}

/** Первый заход удалённого менеджера: пошаговые подсказки, куда нажимать. */
export function AgentOnboarding() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!user || user.role !== "agent") return;
    const onStart = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener("agent-tour:start", onStart);
    if (!readDone(user.id)) {
      const timer = window.setTimeout(() => setOpen(true), 600);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener("agent-tour:start", onStart);
      };
    }
    return () => window.removeEventListener("agent-tour:start", onStart);
  }, [user]);

  useEffect(() => {
    if (!open) {
      highlight(undefined);
      return;
    }
    const current = STEPS[step];
    if (!current) return;
    if (current.href && pathname !== current.href && !pathname.startsWith(`${current.href}/`)) {
      router.push(current.href);
      return;
    }
    const timer = window.setTimeout(() => highlight(current.target), 350);
    return () => window.clearTimeout(timer);
  }, [open, step, pathname, router]);

  if (!user || user.role !== "agent" || !open) return null;

  const current = STEPS[step];
  const last = step >= STEPS.length - 1;

  function finish() {
    writeDone(user!.id);
    highlight(undefined);
    setOpen(false);
  }

  function next() {
    if (last) {
      finish();
      router.push("/questionnaires/new");
      return;
    }
    setStep((value) => value + 1);
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      <div className="pointer-events-auto absolute inset-0 bg-black/35" onClick={finish} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-tour-title"
        className="pointer-events-auto absolute inset-x-3 bottom-[calc(var(--mobile-nav-height)+var(--safe-area-bottom)+0.75rem)] z-[61] rounded-2xl border border-border bg-surface p-4 shadow-hover lg:inset-x-auto lg:bottom-6 lg:left-1/2 lg:w-[420px] lg:-translate-x-1/2"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Подсказка {step + 1} из {STEPS.length}
        </p>
        <h2 id="agent-tour-title" className="mt-1 text-lg font-semibold tracking-tight text-foreground">
          {current.title}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{current.body}</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="text-sm font-medium text-muted hover:text-foreground" onClick={finish}>
            Пропустить
          </button>
          <div className="flex gap-2">
            {step > 0 ? (
              <Button type="button" variant="secondary" onClick={() => setStep((value) => value - 1)}>
                Назад
              </Button>
            ) : null}
            <Button type="button" onClick={next}>
              {last ? "Начать: новый клиент" : "Далее"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Кнопка «Показать подсказки» для меню «Ещё». */
export function startAgentTour() {
  window.dispatchEvent(new Event("agent-tour:start"));
}
