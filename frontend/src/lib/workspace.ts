import type { Workspace } from "@/lib/types";

export const WORKSPACE_LABELS: Record<Workspace, string> = {
  legal: "Компания",
  retail: "Товарная рассрочка",
};

const WORKSPACE_KEY = "rassrochka_workspace";

export function isWorkspace(value: string | null | undefined): value is Workspace {
  return value === "legal" || value === "retail";
}

/** Выбранный контур запоминаем: иначе после ошибки или перезагрузки страница
 *  молча возвращалась бы к «Компании», и человек вводил бы данные не туда. */
export function getStoredWorkspace(): Workspace | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(WORKSPACE_KEY);
  return isWorkspace(stored) ? stored : null;
}

export function setStoredWorkspace(workspace: Workspace): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(WORKSPACE_KEY, workspace);
}

/** URL важнее памяти браузера: ссылка с ?workspace=retail всегда открывает рассрочку. */
export function resolveWorkspace(preferred?: string | null): Workspace {
  if (isWorkspace(preferred)) return preferred;
  return getStoredWorkspace() ?? "legal";
}
