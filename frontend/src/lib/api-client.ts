import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "./auth-storage";
import { getApiUrl } from "./api";
import type {
  ApiError,
  Client,
  ClientBrief,
  ClientDetail,
  DashboardSummary,
  AnalyticsOverview,
  FunnelOverview,
  ManagerCommissionsOverview,
  ManagerTask,
  InstallmentPlan,
  MandatoryPayment,
  OperatingExpense,
  ExpensePayment,
  Payment,
  PaymentScheduleItem,
  PricingTier,
  TokenResponse,
  AuditLogEntry,
  RetailContractDetail,
  RetailContractBrief,
  RetailClient,
  RetailDashboardSummary,
  RetailTermRate,
  Workspace,
  User,
} from "./types";

export class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as ApiError | { detail: unknown };
    const detail = data.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (typeof item === "object" && item && "msg" in item) {
            return String((item as { msg: string }).msg);
          }
          return String(item);
        })
        .join("; ");
    }
    return "Ошибка запроса";
  } catch {
    if (response.status === 404) return "Сервис не найден. Перезапустите backend.";
    return "Ошибка запроса";
  }
}

async function refreshTokens(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const response = await fetch(getApiUrl("/auth/refresh"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    clearTokens();
    return false;
  }

  const data = (await response.json()) as TokenResponse;
  setTokens(data.access_token, data.refresh_token);
  return true;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const accessToken = getAccessToken();
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let response = await fetch(getApiUrl(path), { ...init, headers });

  if (response.status === 401 && getRefreshToken()) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      headers.set("Authorization", `Bearer ${getAccessToken()}`);
      response = await fetch(getApiUrl(path), { ...init, headers });
    }
  }

  if (!response.ok) {
    if (response.status === 401) clearTokens();
    throw new ApiRequestError(await parseError(response), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match = header.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? fallback;
}

export async function downloadFile(path: string, fallbackFilename: string): Promise<void> {
  const headers = new Headers();
  const accessToken = getAccessToken();
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let response = await fetch(getApiUrl(path), { headers });

  if (response.status === 401 && getRefreshToken()) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      headers.set("Authorization", `Bearer ${getAccessToken()}`);
      response = await fetch(getApiUrl(path), { headers });
    }
  }

  if (!response.ok) {
    if (response.status === 401) clearTokens();
    throw new ApiRequestError(await parseError(response), response.status);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filenameFromDisposition(
    response.headers.get("Content-Disposition"),
    fallbackFilename,
  );
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const authApi = {
  login: (login: string, password: string, workspace: Workspace = "legal") =>
    apiFetch<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ login, password, workspace }),
    }),
  me: () => apiFetch<User>("/auth/me"),
};

export const retailApi = {
  dashboard: () => apiFetch<RetailDashboardSummary>("/retail/dashboard/summary"),
  termRates: () => apiFetch<RetailTermRate[]>("/retail/term-rates"),
  listClients: () => apiFetch<RetailClient[]>("/retail/clients"),
  getClient: (id: string) => apiFetch<RetailClient>(`/retail/clients/${id}`),
  createClient: (data: Record<string, unknown>) =>
    apiFetch<RetailClient>("/retail/clients", { method: "POST", body: JSON.stringify(data) }),
  updateClient: (id: string, data: Record<string, unknown>) =>
    apiFetch<RetailClient>(`/retail/clients/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteClient: (id: string) => apiFetch<void>(`/retail/clients/${id}`, { method: "DELETE" }),
  listContracts: (status?: string) => {
    const query = status ? `?status_filter=${status}` : "";
    return apiFetch<RetailContractBrief[]>(`/retail/contracts${query}`);
  },
  getContract: (id: string) => apiFetch<RetailContractDetail>(`/retail/contracts/${id}`),
  createContract: (data: Record<string, unknown>) =>
    apiFetch<RetailContractDetail>("/retail/contracts", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteContract: (id: string) => apiFetch<void>(`/retail/contracts/${id}`, { method: "DELETE" }),
  recordPayment: (contractId: string, data: Record<string, unknown>) =>
    apiFetch(`/retail/contracts/${contractId}/payments`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  createOverdueLog: (contractId: string, data: Record<string, unknown>) =>
    apiFetch(`/retail/contracts/${contractId}/overdue-logs`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deletePayment: (paymentId: string) =>
    apiFetch<void>(`/retail/payments/${paymentId}`, { method: "DELETE" }),
  listInvestors: () => apiFetch<User[]>("/retail/investors"),
  createInvestor: (data: Record<string, unknown>) =>
    apiFetch<User>("/retail/investors", { method: "POST", body: JSON.stringify(data) }),
  updateInvestor: (id: string, data: Record<string, unknown>) =>
    apiFetch<User>(`/retail/investors/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteInvestor: (id: string) => apiFetch<void>(`/retail/investors/${id}`, { method: "DELETE" }),
  getMyInvestment: () => apiFetch<User>("/retail/investors/me"),
  updateMyInvestment: (investment_amount: string) =>
    apiFetch<User>("/retail/investors/me", {
      method: "PATCH",
      body: JSON.stringify({ investment_amount }),
    }),
};

export const dashboardApi = {
  summary: () => apiFetch<DashboardSummary>("/dashboard/summary"),
};

export const analyticsApi = {
  overview: (months = 6) => apiFetch<AnalyticsOverview>(`/analytics/overview?months=${months}`),
  managerCommissions: (months = 6) =>
    apiFetch<ManagerCommissionsOverview>(`/analytics/manager-commissions?months=${months}`),
};

export const funnelApi = {
  overview: () => apiFetch<FunnelOverview>("/funnel/overview"),
};

export const tasksApi = {
  list: (status = "open") => apiFetch<ManagerTask[]>(`/tasks?status=${status}`),
  create: (data: Record<string, unknown>) =>
    apiFetch<ManagerTask>("/tasks", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, unknown>) =>
    apiFetch<ManagerTask>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
};

export const usersApi = {
  list: () => apiFetch<User[]>("/users"),
  create: (data: Record<string, unknown>) =>
    apiFetch<User>("/users", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, unknown>) =>
    apiFetch<User>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deactivate: (id: string) => apiFetch<void>(`/users/${id}`, { method: "DELETE" }),
};

export const clientsApi = {
  list: (params?: {
    status?: string;
    procedure_stage?: string;
    engagement_stage?: string;
    overdue?: boolean;
    manager_id?: string;
    phone?: string;
    name?: string;
    contract_month?: string;
    due_month?: string;
    collection_view?: "active" | "paid" | "converted" | "all";
    sort_by?: string;
    sort_dir?: "asc" | "desc";
  }) => {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    if (params?.procedure_stage) search.set("procedure_stage", params.procedure_stage);
    if (params?.engagement_stage) search.set("engagement_stage", params.engagement_stage);
    if (params?.overdue !== undefined) search.set("overdue", String(params.overdue));
    if (params?.manager_id) search.set("manager_id", params.manager_id);
    if (params?.phone) search.set("phone", params.phone);
    if (params?.name) search.set("name", params.name);
    if (params?.contract_month) search.set("contract_month", params.contract_month);
    if (params?.due_month) search.set("due_month", params.due_month);
    if (params?.collection_view) search.set("collection_view", params.collection_view);
    if (params?.sort_by) search.set("sort_by", params.sort_by);
    if (params?.sort_dir) search.set("sort_dir", params.sort_dir);
    const query = search.toString();
    return apiFetch<Array<Client | ClientBrief>>(`/clients${query ? `?${query}` : ""}`);
  },
  get: (id: string) => apiFetch<Client | ClientBrief>(`/clients/${id}`),
  getDetail: (id: string) => apiFetch<ClientDetail>(`/clients/${id}/detail`),
  create: (data: Record<string, unknown>) =>
    apiFetch<Client>("/clients", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, unknown>) =>
    apiFetch<Client>(`/clients/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<void>(`/clients/${id}`, { method: "DELETE" }),
};

export const documentCollectionApi = {
  recordPayment: (clientId: string, paymentDate: string) =>
    apiFetch<import("./types").DocumentCollection>(
      `/clients/${clientId}/document-collection/record`,
      { method: "POST", body: JSON.stringify({ payment_date: paymentDate }) },
    ),
  convertToBankruptcy: (
    clientId: string,
    data: { debt_amount: string; contract_date?: string },
  ) =>
    apiFetch<ClientDetail>(`/clients/${clientId}/convert-to-bankruptcy`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export const auditApi = {
  list: (params?: {
    entity_type?: string;
    entity_id?: string;
    changed_by?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
  }) => {
    const search = new URLSearchParams();
    if (params?.entity_type) search.set("entity_type", params.entity_type);
    if (params?.entity_id) search.set("entity_id", params.entity_id);
    if (params?.changed_by) search.set("changed_by", params.changed_by);
    if (params?.date_from) search.set("date_from", params.date_from);
    if (params?.date_to) search.set("date_to", params.date_to);
    if (params?.limit) search.set("limit", String(params.limit));
    const query = search.toString();
    return apiFetch<AuditLogEntry[]>(`/audit-logs${query ? `?${query}` : ""}`);
  },
  recent: (limit = 50) => apiFetch<AuditLogEntry[]>(`/audit-logs/recent?limit=${limit}`),
};

export const pricingApi = {
  list: () => apiFetch<PricingTier[]>("/pricing-tiers"),
  create: (data: Record<string, unknown>) =>
    apiFetch<PricingTier>("/pricing-tiers", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, unknown>) =>
    apiFetch<PricingTier>(`/pricing-tiers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

export const expensesApi = {
  list: () => apiFetch<OperatingExpense[]>("/operating-expenses"),
  create: (data: Record<string, unknown>) =>
    apiFetch<OperatingExpense>("/operating-expenses", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Record<string, unknown>) =>
    apiFetch<OperatingExpense>(`/operating-expenses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) => apiFetch<void>(`/operating-expenses/${id}`, { method: "DELETE" }),
  listPayments: (params?: { period_month?: string; expense_group?: string }) => {
    const search = new URLSearchParams();
    if (params?.period_month) search.set("period_month", params.period_month);
    if (params?.expense_group) search.set("expense_group", params.expense_group);
    const query = search.toString();
    return apiFetch<ExpensePayment[]>(`/operating-expenses/payments${query ? `?${query}` : ""}`);
  },
  recordPayment: (expenseId: string, data: Record<string, unknown>) =>
    apiFetch<ExpensePayment>(`/operating-expenses/${expenseId}/payments`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export const scheduleApi = {
  defer: (scheduleId: string, data: { deferred_until: string; comment: string }) =>
    apiFetch<PaymentScheduleItem>(`/payment-schedule/${scheduleId}/defer`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  waiveOverdue: (scheduleId: string, data?: { comment?: string }) =>
    apiFetch<PaymentScheduleItem>(`/payment-schedule/${scheduleId}/waive-overdue`, {
      method: "POST",
      body: JSON.stringify(data ?? {}),
    }),
  update: (scheduleId: string, data: { planned_amount?: string; due_date?: string }) =>
    apiFetch<PaymentScheduleItem>(`/payment-schedule/${scheduleId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (scheduleId: string) =>
    apiFetch<void>(`/payment-schedule/${scheduleId}`, { method: "DELETE" }),
  addMonth: (
    clientId: string,
    planId: string,
    data: { planned_amount: string; due_date?: string },
  ) =>
    apiFetch<PaymentScheduleItem>(
      `/payment-schedule/${clientId}/installment-plans/${planId}/payment-schedule`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    ),
};

export const mandatoryPaymentsApi = {
  update: (clientId: string, paymentId: string, data: Record<string, unknown>) =>
    apiFetch<MandatoryPayment>(`/clients/${clientId}/mandatory-payments/${paymentId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  record: (clientId: string, paymentId: string, data: Record<string, unknown>) =>
    apiFetch<MandatoryPayment>(`/clients/${clientId}/mandatory-payments/${paymentId}/record`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export const installmentApi = {
  list: (clientId: string) =>
    apiFetch<InstallmentPlan[]>(`/clients/${clientId}/installment-plans`),
  update: (clientId: string, planId: string, data: { total_amount: string }) =>
    apiFetch<InstallmentPlan>(`/clients/${clientId}/installment-plans/${planId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  schedule: (clientId: string, planId: string) =>
    apiFetch<PaymentScheduleItem[]>(
      `/payment-schedule/${clientId}/installment-plans/${planId}/payment-schedule`,
    ),
};

export const paymentsApi = {
  list: (clientId?: string) => {
    const query = clientId ? `?client_id=${clientId}` : "";
    return apiFetch<Payment[]>(`/payments${query}`);
  },
  create: (data: Record<string, unknown>) =>
    apiFetch<Payment>("/payments", { method: "POST", body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<void>(`/payments/${id}`, { method: "DELETE" }),
};

function buildExportQuery(params?: Record<string, string | boolean | undefined>): string {
  const search = new URLSearchParams();
  if (!params) return "";
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export const exportsApi = {
  clients: (params?: {
    status?: string;
    procedure_stage?: string;
    engagement_stage?: string;
    overdue?: boolean;
    manager_id?: string;
    phone?: string;
    name?: string;
    contract_month?: string;
    due_month?: string;
    sort_by?: string;
    sort_dir?: "asc" | "desc";
  }) =>
    downloadFile(`/exports/clients.xlsx${buildExportQuery(params)}`, "clients.xlsx"),
  clientDetail: (clientId: string) =>
    downloadFile(`/exports/clients/${clientId}.xlsx`, "client.xlsx"),
  overdueClients: () => downloadFile("/exports/overdue-clients.xlsx", "overdue_clients.xlsx"),
};
