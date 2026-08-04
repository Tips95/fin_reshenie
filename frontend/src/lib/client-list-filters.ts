export type ClientListSortField =
  | "full_name"
  | "contract_date"
  | "debt_amount"
  | "status"
  | "overdue"
  | "created_at";

export type ClientListSortDir = "asc" | "desc";

export type CollectionViewFilter = "active" | "paid" | "converted" | "all";

export type ClientListFilters = {
  status: string;
  overdue: boolean;
  procedure_stage: string;
  manager_id: string;
  phone: string;
  name: string;
  contract_month: string;
  due_month: string;
  sort_by: ClientListSortField;
  sort_dir: ClientListSortDir;
  page: number;
  collection_view: CollectionViewFilter;
};

const SORT_FIELDS = new Set<ClientListSortField>([
  "full_name",
  "contract_date",
  "debt_amount",
  "status",
  "overdue",
  "created_at",
]);

const COLLECTION_VIEWS = new Set<CollectionViewFilter>([
  "active",
  "paid",
  "converted",
  "all",
]);

export const DEFAULT_CLIENT_LIST_FILTERS: ClientListFilters = {
  status: "",
  overdue: false,
  procedure_stage: "",
  manager_id: "",
  phone: "",
  name: "",
  contract_month: "",
  due_month: "",
  sort_by: "created_at",
  sort_dir: "desc",
  page: 1,
  collection_view: "active",
};

function parseSortField(value: string | null): ClientListSortField {
  if (value && SORT_FIELDS.has(value as ClientListSortField)) {
    return value as ClientListSortField;
  }
  return DEFAULT_CLIENT_LIST_FILTERS.sort_by;
}

function parseSortDir(value: string | null): ClientListSortDir {
  return value === "asc" ? "asc" : DEFAULT_CLIENT_LIST_FILTERS.sort_dir;
}

function parseCollectionView(value: string | null): CollectionViewFilter {
  if (value && COLLECTION_VIEWS.has(value as CollectionViewFilter)) {
    return value as CollectionViewFilter;
  }
  return DEFAULT_CLIENT_LIST_FILTERS.collection_view;
}

export function parseClientListFilters(searchParams: URLSearchParams): ClientListFilters {
  const pageRaw = Number(searchParams.get("page"));
  return {
    status: searchParams.get("status") ?? "",
    overdue: searchParams.get("overdue") === "true",
    procedure_stage: searchParams.get("procedure_stage") ?? "",
    manager_id: searchParams.get("manager_id") ?? "",
    phone: searchParams.get("phone") ?? "",
    name: searchParams.get("name") ?? "",
    contract_month: searchParams.get("contract_month") ?? "",
    due_month: searchParams.get("due_month") ?? "",
    sort_by: parseSortField(searchParams.get("sort_by")),
    sort_dir: parseSortDir(searchParams.get("sort_dir")),
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1,
    collection_view: parseCollectionView(searchParams.get("collection_view")),
  };
}

export function buildClientListQuery(filters: ClientListFilters): string {
  const params = new URLSearchParams();

  if (filters.status) params.set("status", filters.status);
  if (filters.overdue) params.set("overdue", "true");
  if (filters.procedure_stage) params.set("procedure_stage", filters.procedure_stage);
  if (filters.manager_id) params.set("manager_id", filters.manager_id);
  if (filters.phone.trim()) params.set("phone", filters.phone.trim());
  if (filters.name.trim()) params.set("name", filters.name.trim());
  if (filters.contract_month) params.set("contract_month", filters.contract_month);
  if (filters.due_month) params.set("due_month", filters.due_month);
  if (filters.sort_by !== DEFAULT_CLIENT_LIST_FILTERS.sort_by) {
    params.set("sort_by", filters.sort_by);
  }
  if (filters.sort_dir !== DEFAULT_CLIENT_LIST_FILTERS.sort_dir) {
    params.set("sort_dir", filters.sort_dir);
  }
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.collection_view !== DEFAULT_CLIENT_LIST_FILTERS.collection_view) {
    params.set("collection_view", filters.collection_view);
  }

  return params.toString();
}

export function clientListPath(
  workspace: "collection" | "contracts",
  filters?: Partial<ClientListFilters>,
): string {
  const base = workspace === "collection" ? "/clients/collection" : "/clients/contracts";
  if (!filters) return base;
  const query = buildClientListQuery({ ...DEFAULT_CLIENT_LIST_FILTERS, ...filters });
  return query ? `${base}?${query}` : base;
}

/** Безопасный return из карточки клиента — только внутренние пути списка. */
export function sanitizeClientListReturnHref(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/clients")) return null;
  if (value.startsWith("//")) return null;
  return value;
}

export function clientDetailHref(clientId: string, listReturnUrl: string): string {
  return `/clients/${clientId}?return=${encodeURIComponent(listReturnUrl)}`;
}
