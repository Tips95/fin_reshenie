export function formatMoney(value: string | number): string {
  const amount = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatShortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return fullName.trim();
  return `${parts[0]} ${parts[1]}`;
}

export function effectiveDueDate(item: {
  due_date: string;
  deferred_until: string | null;
}): string {
  return item.deferred_until || item.due_date;
}

export function formatMonthLabel(value: string): string {
  const date = new Date(value.length === 7 ? `${value}-01` : value);
  return new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(date);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: "Активен",
    completed: "Завершён",
    defaulted: "Просрочен",
    cancelled: "Отменён",
    open: "Открыта",
    done: "Выполнена",
    dismissed: "Отклонена",
    overdue_payment: "Просрочка",
    manual: "Ручная",
    pending: "Ожидает",
    paid: "Оплачен",
    partial: "Частично",
    overdue: "Просрочен",
    owner: "Руководитель",
    manager: "Менеджер",
    call_center: "Колл-центр",
    investor: "Инвестор",
    salary: "Зарплата",
    rent: "Аренда",
    utilities: "Коммунальные",
    marketing: "Маркетинг",
    other: "Прочее",
    salary_project: "Зарплатный проект",
    production: "Производственные расходы",
    deferred: "Отсрочен",
    deposit: "Депозит",
    financial_management: "Финансовое управление",
    court_fee: "Судебная пошлина",
    not_applicable: "Не требуется",
    create: "Создание",
    update: "Изменение",
    delete: "Удаление",
  };
  return labels[status] ?? status;
}

export function engagementStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    document_collection: "Сбор документов",
    bankruptcy: "Банкротство",
  };
  return labels[stage] ?? stage;
}

export function documentCollectionStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Ожидает оплаты",
    paid: "Оплачено",
  };
  return labels[status] ?? status;
}

export function procedureStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    contract_signed: "Договор",
    deposit: "Депозит",
    financial_management: "Фин. управление",
    court: "Суд",
    completed: "Завершение",
  };
  return labels[stage] ?? stage;
}

export function overdueBucketLabel(days: number | null): string {
  if (!days || days <= 0) return "—";
  if (days >= 15) return "15+ дней";
  if (days >= 8) return "8–14 дней";
  if (days >= 4) return "4–7 дней";
  return "1–3 дня";
}

export function isFullClient(client: unknown): client is import("./types").Client {
  return Boolean(client && typeof client === "object" && "debt_amount" in client);
}
