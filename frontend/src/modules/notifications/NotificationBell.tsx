"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { notificationsApi } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import type { AppNotification } from "@/lib/types";

const POLL_MS = 60_000;

export function NotificationBell() {
  const router = useRouter();
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    try {
      setCount((await notificationsApi.unreadCount()).count);
    } catch {
      /* колокольчик не должен ломать страницу */
    }
  }, []);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount, pathname]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshCount();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshCount();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    try {
      const data = await notificationsApi.list();
      setItems(data.items);
      setCount(data.unread_count);
    } catch {
      setItems([]);
    }
  }

  async function openItem(item: AppNotification) {
    setOpen(false);
    if (!item.read_at) {
      setItems((prev) =>
        prev?.map((row) => (row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row)) ?? null,
      );
      try {
        setCount((await notificationsApi.markRead([item.id])).count);
      } catch {
        /* отметка догонит при следующем открытии */
      }
    }
    if (item.link) router.push(item.link);
  }

  async function readAll() {
    try {
      setCount((await notificationsApi.markRead()).count);
      const now = new Date().toISOString();
      setItems((prev) => prev?.map((row) => ({ ...row, read_at: row.read_at ?? now })) ?? null);
    } catch {
      /* повторит пользователь */
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={count ? `Уведомления: ${count} новых` : "Уведомления"}
        aria-expanded={open}
        onClick={() => void toggle()}
        className="interactive relative flex h-9 w-9 items-center justify-center rounded-lg text-chrome-muted hover:bg-chrome-elevated hover:text-chrome-text"
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {count > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold leading-none text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-40 mt-2 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-surface shadow-card">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <p className="text-sm font-semibold text-foreground">Уведомления</p>
            {count > 0 ? (
              <button type="button" onClick={() => void readAll()} className="text-xs font-medium text-brand-700 hover:underline">
                Прочитать все
              </button>
            ) : null}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {items === null ? (
              <p className="px-3 py-6 text-center text-xs text-muted">Загрузка...</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted">Пока ничего нового</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void openItem(item)}
                  className={cn(
                    "block w-full border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-surface-muted",
                    !item.read_at && "bg-brand-50/60",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                        item.read_at ? "bg-transparent" : "bg-brand-600",
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium leading-snug text-foreground">{item.title}</p>
                      {item.body ? (
                        <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted">{item.body}</p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-muted">{formatDateTime(item.created_at)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
