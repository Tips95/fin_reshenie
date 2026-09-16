"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Modal } from "@/components/ui";

type PendingNav =
  | { kind: "href"; href: string }
  | { kind: "back" }
  | null;

function isInternalAppLink(anchor: HTMLAnchorElement): string | null {
  if (anchor.target === "_blank" || anchor.hasAttribute("download")) return null;
  const raw = anchor.getAttribute("href");
  if (!raw || raw.startsWith("#") || raw.startsWith("tel:") || raw.startsWith("mailto:")) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return null;
  return next;
}

/**
 * Перед уходом с несохранённой анкеты/лида предлагает сохранить.
 * Перехватывает клики по ссылкам в шапке и «назад», плюс закрытие вкладки.
 * Родитель может запросить уход через `requestHref` (кнопки с router.push).
 */
export function UnsavedChangesGuard({
  dirty,
  saving = false,
  onSave,
  requestHref = null,
  onRequestHandled,
  title = "Сохранить перед выходом?",
  description = "Есть несохранённые изменения. Если уйдёте сейчас — они пропадут.",
}: {
  dirty: boolean;
  saving?: boolean;
  onSave: () => Promise<void>;
  /** Внешний запрос ухода (например кнопка «Карточка клиента»). */
  requestHref?: string | null;
  onRequestHandled?: () => void;
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingNav>(null);
  const bypassRef = useRef(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!requestHref) return;
    if (!dirtyRef.current) {
      bypassRef.current = true;
      router.push(requestHref);
      onRequestHandled?.();
      bypassRef.current = false;
      return;
    }
    setPending({ kind: "href", href: requestHref });
    onRequestHandled?.();
  }, [requestHref, router, onRequestHandled]);

  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!dirtyRef.current || bypassRef.current || pending) return;
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const href = isInternalAppLink(anchor);
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      setPending({ kind: "href", href });
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pending]);

  useEffect(() => {
    if (!dirty) return;
    window.history.pushState({ unsavedGuard: true }, "");
    function onPopState() {
      if (!dirtyRef.current || bypassRef.current) return;
      window.history.pushState({ unsavedGuard: true }, "");
      setPending({ kind: "back" });
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [dirty]);

  async function leave(next: PendingNav) {
    bypassRef.current = true;
    setPending(null);
    if (!next) {
      bypassRef.current = false;
      return;
    }
    if (next.kind === "href") {
      router.push(next.href);
      return;
    }
    router.back();
  }

  async function handleSave() {
    if (!pending) return;
    try {
      await onSave();
      await leave(pending);
    } catch {
      // Ошибку показывает страница (toast); остаёмся на форме.
    } finally {
      bypassRef.current = false;
    }
  }

  return (
    <Modal open={pending !== null} onClose={() => setPending(null)} title={title} description={description}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" disabled={saving} onClick={() => setPending(null)}>
          Остаться
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={saving}
          onClick={() => void leave(pending)}
        >
          Не сохранять
        </Button>
        <Button type="button" disabled={saving} onClick={() => void handleSave()}>
          {saving ? "Сохранение..." : "Сохранить"}
        </Button>
      </div>
    </Modal>
  );
}

/** Стабильный снимок формы для сравнения «грязности». */
export function questionnaireFormSnapshot(payload: Record<string, unknown>): string {
  return JSON.stringify(payload);
}
