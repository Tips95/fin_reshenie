import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "./auth-storage";
import { getApiUrl } from "./api";
import type {
  ApiError,
  Client,
  ClientBrief,
  ClientDetail,
  ClientListResponse,
  DashboardSummary,
  AnalyticsOverview,
  FunnelOverview,
  ManagerCommissionsOverview,
  ManagerTask,
  InstallmentPlan,
  MandatoryPayment,
  OperatingExpense,
  ExpensePayment,
  OneTimeExpense,
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
  Organization,
  User,
} from "./types";

export class ApiRequestError extends Error {
  status: number;
  detail: unknown;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export type DuplicateClientConflict = {
  code: "duplicate_client";
  message: string;
  client_id: string;
  full_name?: string;
  phone?: string;
  engagement_stage?: string;
};

export function getDuplicateClientId(error: unknown): string | null {
  if (!(error instanceof ApiRequestError)) return null;
  const detail = error.detail;
  if (
    typeof detail === "object" &&
    detail !== null &&
    "client_id" in detail &&
    typeof (detail as { client_id: unknown }).client_id === "string"
  ) {
    return (detail as { client_id: string }).client_id;
  }
  return null;
}

function messageFromDetail(detail: unknown): string {
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
  if (typeof detail === "object" && detail !== null && "message" in detail) {
    return String((detail as { message: unknown }).message);
  }
  return "Ошибка запроса";
}

async function parseError(response: Response): Promise<{ message: string; detail: unknown }> {
  try {
    const data = (await response.json()) as ApiError | { detail: unknown };
    const detail = data.detail;
    return { message: messageFromDetail(detail), detail };
  } catch {
    if (response.status === 404) {
      return { message: "Сервис не найден. Перезапустите backend.", detail: undefined };
    }
    if (response.status >= 500) {
      return { message: "Ошибка сервера. Попробуйте позже.", detail: undefined };
    }
    return { message: "Ошибка запроса", detail: undefined };
  }
}

async function throwApiError(response: Response): Promise<never> {
  const parsed = await parseError(response);
  throw new ApiRequestError(parsed.message, response.status, parsed.detail);
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
    await throwApiError(response);
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
    await throwApiError(response);
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

export async function uploadFile<T = unknown>(path: string, file: File, fieldName = "file"): Promise<T> {
  const send = async (): Promise<Response> => {
    const formData = new FormData();
    formData.append(fieldName, file);
    const headers = new Headers();
    const accessToken = getAccessToken();
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
    return fetch(getApiUrl(path), {
      method: "POST",
      headers,
      body: formData,
    });
  };

  let response = await send();

  if (response.status === 401 && getRefreshToken()) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      response = await send();
    }
  }

  if (!response.ok) {
    if (response.status === 401) clearTokens();
    await throwApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const authApi = {
  login: (login: string, password: string, workspace: Workspace = "legal") =>
    apiFetch<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ login, password, workspace }),
    }),
  register: (data: {
    organization_name: string;
    login: string;
    password: string;
    full_name?: string;
    workspace: Workspace;
  }) => apiFetch<TokenResponse>("/auth/register", { method: "POST", body: JSON.stringify(data) }),
  me: () => apiFetch<User>("/auth/me"),
};

export const organizationsApi = {
  current: () => apiFetch<Organization>("/organizations/current"),
  update: (data: Record<string, unknown>) =>
    apiFetch<Organization>("/organizations/current", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
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
  listContracts: (status?: string, retailClientId?: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status_filter", status);
    if (retailClientId) params.set("retail_client_id", retailClientId);
    const query = params.toString();
    return apiFetch<RetailContractBrief[]>(`/retail/contracts${query ? `?${query}` : ""}`);
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
  uploadClientPassportPdf: (clientId: string, file: File) =>
    uploadFile<RetailClient>(`/retail/clients/${clientId}/passport-pdf`, file),
  downloadClientPassportPdf: (clientId: string, fallbackFilename: string) =>
    downloadFile(`/retail/clients/${clientId}/passport-pdf`, fallbackFilename),
  deleteClientPassportPdf: (clientId: string) =>
    apiFetch<RetailClient>(`/retail/clients/${clientId}/passport-pdf`, { method: "DELETE" }),
  uploadGuarantorPassportPdf: (clientId: string, file: File) =>
    uploadFile<RetailClient>(`/retail/clients/${clientId}/guarantor-passport-pdf`, file),
  downloadGuarantorPassportPdf: (clientId: string, fallbackFilename: string) =>
    downloadFile(`/retail/clients/${clientId}/guarantor-passport-pdf`, fallbackFilename),
  deleteGuarantorPassportPdf: (clientId: string) =>
    apiFetch<RetailClient>(`/retail/clients/${clientId}/guarantor-passport-pdf`, { method: "DELETE" }),
  uploadSignedContractPdf: (contractId: string, file: File) =>
    uploadFile<RetailContractDetail>(`/retail/contracts/${contractId}/signed-contract-pdf`, file),
  downloadSignedContractPdf: (contractId: string, fallbackFilename: string) =>
    downloadFile(`/retail/contracts/${contractId}/signed-contract-pdf`, fallbackFilename),
  deleteSignedContractPdf: (contractId: string) =>
    apiFetch<RetailContractDetail>(`/retail/contracts/${contractId}/signed-contract-pdf`, {
      method: "DELETE",
    }),
};

export const dashboardApi = {
  summary: (month?: string) =>
    apiFetch<DashboardSummary>(`/dashboard/summary${month ? `?month=${month}` : ""}`),
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
  count: () => apiFetch<{ count: number }>("/tasks/count"),
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
    page?: number;
    page_size?: number;
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
    if (params?.page) search.set("page", String(params.page));
    if (params?.page_size) search.set("page_size", String(params.page_size));
    const query = search.toString();
    return apiFetch<ClientListResponse>(`/clients${query ? `?${query}` : ""}`);
  },
  get: (id: string) => apiFetch<Client | ClientBrief>(`/clients/${id}`),
  getDetail: (id: string) => apiFetch<ClientDetail>(`/clients/${id}/detail`),
  create: (data: Record<string, unknown>) =>
    apiFetch<Client>("/clients", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, unknown>) =>
    apiFetch<Client>(`/clients/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<void>(`/clients/${id}`, { method: "DELETE" }),
  alignPaymentDates: (id: string) =>
    apiFetch<{
      schedule_dates_updated: number;
      schedule_payments_updated: number;
      mandatory_records_updated: number;
    }>(`/clients/${id}/payments/align-schedule-dates`, { method: "POST" }),
  setManagerFirstCommission: (id: string, collected: boolean) =>
    apiFetch<Client>(`/clients/${id}/manager-first-commission`, {
      method: "PATCH",
      body: JSON.stringify({ collected }),
    }),
};

export const documentCollectionApi = {
  update: (
    clientId: string,
    data: { collection_fee: string; notary_fee: string; manager_commission: string },
  ) =>
    apiFetch<import("./types").DocumentCollection>(
      `/clients/${clientId}/document-collection`,
      { method: "PATCH", body: JSON.stringify(data) },
    ),
  recordPayment: (clientId: string, paymentDate: string) =>
    apiFetch<import("./types").DocumentCollection>(
      `/clients/${clientId}/document-collection/record`,
      { method: "POST", body: JSON.stringify({ payment_date: paymentDate }) },
    ),
  convertToBankruptcy: (
    clientId: string,
    data: {
      auto_installment?: boolean;
      debt_amount?: string;
      contract_total?: string;
      contract_date?: string;
    },
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
  updatePayment: (paymentId: string, data: Record<string, unknown>) =>
    apiFetch<ExpensePayment>(`/operating-expenses/payments/${paymentId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  listOneTime: (params?: { period_month?: string }) => {
    const search = new URLSearchParams();
    if (params?.period_month) search.set("period_month", params.period_month);
    const query = search.toString();
    return apiFetch<OneTimeExpense[]>(`/operating-expenses/one-time${query ? `?${query}` : ""}`);
  },
  createOneTime: (data: Record<string, unknown>) =>
    apiFetch<OneTimeExpense>("/operating-expenses/one-time", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateOneTime: (id: string, data: Record<string, unknown>) =>
    apiFetch<OneTimeExpense>(`/operating-expenses/one-time/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteOneTime: (id: string) =>
    apiFetch<void>(`/operating-expenses/one-time/${id}`, { method: "DELETE" }),
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
  updateNote: (scheduleId: string, managerNote: string | null) =>
    apiFetch<PaymentScheduleItem>(`/payment-schedule/${scheduleId}/note`, {
      method: "PATCH",
      body: JSON.stringify({ manager_note: managerNote }),
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
  update: (id: string, data: { payment_date: string }) =>
    apiFetch<Payment>(`/payments/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
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
    collection_view?: "active" | "paid" | "converted" | "all";
    sort_by?: string;
    sort_dir?: "asc" | "desc";
  }) =>
    downloadFile(`/exports/clients.xlsx${buildExportQuery(params)}`, "clients.xlsx"),
  clientDetail: (clientId: string) =>
    downloadFile(`/exports/clients/${clientId}.xlsx`, "client.xlsx"),
  overdueClients: () => downloadFile("/exports/overdue-clients.xlsx", "overdue_clients.xlsx"),
};
