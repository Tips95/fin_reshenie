"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Badge, Button, Card, EmptyState, FormField, Input, LoadingState, PageHeader, Pagination, PhoneInput, SectionTitle, Select, StatCard, Toast } from "@/components/ui";
import { ApiRequestError, clientsApi, exportsApi, getDuplicateClientId, usersApi } from "@/lib/api-client";
import {
  buildClientListQuery,
  clientDetailHref,
  parseClientListFilters,
  type ClientListSortField,
  type CollectionViewFilter,
} from "@/lib/client-list-filters";
import { formatDate, formatMoney, formatMonthLabel, formatShortName, isFullClient, statusLabel } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PHONE_PREFIX } from "@/lib/phone";
import { collectErrors, hasErrors, validateFullName, validatePhone, validateRequiredDate } from "@/lib/validation";
import type { Client, ClientBrief, ClientDueMonthSummary, ClientStatus, ProcedureStage, User } from "@/lib/types";
import { useAuth, getAuthErrorMessage } from "@/modules/auth/AuthProvider";

type SortField = ClientListSortField;
type SortDir = "asc" | "desc";

const PROCEDURE_OPTIONS: Array<{ value: ProcedureStage; label: string }> = [
  { value: "contract_signed", label: "Договор" },
  { value: "deposit", label: "Депозит" },
  { value: "financial_management", label: "Фин. управление" },
  { value: "court", label: "Суд" },
  { value: "completed", label: "Завершение" },
];

const STATUS_OPTIONS: Array<{ value: ClientStatus; label: string }> = [
  { value: "active", label: "Активен" },
  { value: "completed", label: "Завершён" },
  { value: "defaulted", label: "Просрочен" },
  { value: "cancelled", label: "Отменён" },
];

function SortableTh({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  field: SortField;
  sortBy: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const active = sortBy === field;
  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 font-semibold transition-colors ${
          active ? "text-brand-700" : "text-muted hover:text-brand-600"
        }`}
      >
        {label}
        <span className="text-xs text-muted">{active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
}

type ClientWorkspace = "collection" | "contracts";

const COLLECTION_VIEW_OPTIONS: Array<{ value: CollectionViewFilter; label: string }> = [
  { value: "active", label: "В работе" },
  { value: "paid", label: "Оплатили сбор" },
  { value: "converted", label: "На банкротстве" },
  { value: "all", label: "Все" },
];

const CLIENTS_PAGE_SIZE = 25;

const WORKSPACE_CONFIG: Record<
  ClientWorkspace,
  {
    title: string;
    subtitle: string;
    engagementStage: "document_collection" | "bankruptcy";
    emptyText: string;
  }
> = {
  collection: {
    title: "Сбор документов",
    subtitle: "Клиенты на этапе сбора: оплата 10 000 / 13 000 ₽ до перевода на банкротство",
    engagementStage: "document_collection",
    emptyText: "Клиенты на этапе сбора не найдены",
  },
  contracts: {
    title: "Договоры",
    subtitle: "Клиенты с договором банкротства: график рассрочки и обязательные платежи",
    engagementStage: "bankruptcy",
    emptyText: "Договоры не найдены",
  },
};

export default function ClientsPageContent({ workspace }: { workspace: ClientWorkspace }) {
  const workspaceConfig = WORKSPACE_CONFIG[workspace];
  const isCollectionView = workspace === "collection";
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(() => parseClientListFilters(searchParams), [searchParams]);
  const listReturnUrl = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);
  const [nameDraft, setNameDraft] = useState(filters.name);
  const [phoneDraft, setPhoneDraft] = useState(filters.phone);
  const [clients, setClients] = useState<Array<Client | ClientBrief>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [totalClients, setTotalClients] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [dueMonthSummary, setDueMonthSummary] = useState<ClientDueMonthSummary | null>(null);
  const [managers, setManagers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [createError, setCreateError] = useState<{ message: string; clientId?: string } | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{
    message: ReactNode;
    tone: "success" | "error" | "info";
  } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    phone: PHONE_PREFIX,
    contract_date: "",
    assigned_manager_id: "",
  });

  const updateFilters = useCallback(
    (patch: Partial<typeof filters>, options?: { resetPage?: boolean }) => {
      const next = { ...filters, ...patch };
      const onlyPage = Object.keys(patch).length === 1 && "page" in patch;
      if (options?.resetPage !== false && !onlyPage) {
        next.page = 1;
      }
      const query = buildClientListQuery(next);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [filters, pathname, router],
  );

  useEffect(() => {
    setNameDraft(filters.name);
    setPhoneDraft(filters.phone);
  }, [filters.name, filters.phone]);

  const searchDraftKey = useRef<string | null>(null);
  useEffect(() => {
    const draftKey = `${nameDraft}\0${phoneDraft}`;
    if (searchDraftKey.current === null) {
      searchDraftKey.current = draftKey;
      return;
    }
    if (searchDraftKey.current === draftKey) return;

    const timer = window.setTimeout(() => {
      searchDraftKey.current = draftKey;
      const patch: Partial<typeof filters> = {
        name: nameDraft,
        phone: phoneDraft,
      };
      if ((nameDraft.trim() || phoneDraft.trim()) && filters.due_month) {
        patch.due_month = "";
      }
      updateFilters(patch);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [nameDraft, phoneDraft, filters.due_month, updateFilters]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function run() {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await clientsApi.list({
          status: isCollectionView ? filters.status || undefined : undefined,
          overdue: filters.overdue || undefined,
          procedure_stage: isCollectionView ? undefined : filters.procedure_stage || undefined,
          engagement_stage: isCollectionView ? undefined : workspaceConfig.engagementStage,
          collection_view: isCollectionView ? filters.collection_view : undefined,
          manager_id: filters.manager_id || undefined,
          phone: filters.phone.trim() || undefined,
          name: filters.name.trim() || undefined,
          contract_month: filters.contract_month || undefined,
          due_month: filters.due_month || undefined,
          sort_by: filters.sort_by,
          sort_dir: filters.sort_dir,
          page: filters.page,
          page_size: CLIENTS_PAGE_SIZE,
        });
        if (cancelled) return;
        setClients(data.items);
        setTotalClients(data.total);
        setTotalPages(data.total_pages);
        setDueMonthSummary(data.due_month_summary ?? null);
      } catch (error) {
        if (cancelled) return;
        setLoadError(getAuthErrorMessage(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    user,
    reloadKey,
    isCollectionView,
    workspaceConfig.engagementStage,
    searchParams,
    filters.status,
    filters.overdue,
    filters.procedure_stage,
    filters.collection_view,
    filters.manager_id,
    filters.phone,
    filters.name,
    filters.contract_month,
    filters.due_month,
    filters.sort_by,
    filters.sort_dir,
    filters.page,
  ]);

  const reloadClients = useCallback(() => {
    setReloadKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (user?.role === "owner") {
      usersApi
        .list()
        .then((users) =>
          setManagers(users.filter((item) => item.role === "manager" && item.is_active)),
        )
        .catch(() => setManagers([]));
    }
  }, [user?.role]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setCreateError(null);
    const errors = collectErrors({
      full_name: validateFullName(form.full_name),
      phone: validatePhone(form.phone),
      contract_date: validateRequiredDate(form.contract_date),
    });
    if (hasErrors(errors)) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    try {
      const created = await clientsApi.create({
        ...form,
        full_name: form.full_name.trim().replace(/\s+/g, " "),
        phone: form.phone.trim(),
        debt_amount: "0",
        assigned_manager_id: form.assigned_manager_id || undefined,
        create_installment_plan: false,
        engagement_stage: "document_collection",
      });
      setShowForm(false);
      setForm({
        full_name: "",
        phone: PHONE_PREFIX,
        contract_date: "",
        assigned_manager_id: "",
      });
      router.push(`/clients/${created.id}`);
    } catch (error) {
      const message =
        error instanceof ApiRequestError ? error.message : "Не удалось создать клиента";
      const clientId = getDuplicateClientId(error) ?? undefined;
      setCreateError({ message, clientId });
      if (error instanceof ApiRequestError && error.status === 409) {
        setToast({
          message: clientId ? (
            <span>
              {message}{" "}
              <Link href={clientDetailHref(clientId, listReturnUrl)} className="font-medium underline underline-offset-2">
                Открыть карточку
              </Link>
            </span>
          ) : (
            message
          ),
          tone: "error",
        });
      }
    }
  }

  const canCreate = user?.role === "owner" || user?.role === "manager";
  const canEdit = canCreate;
  const isManager = user?.role === "manager";
  const canAssignManager = user?.role === "owner";
  const canSeeClientAmounts = user?.role === "owner" || user?.role === "manager";
  const isCollectionStaff = user?.role === "call_center";

  function clientLatestNote(client: Client | ClientBrief) {
    if (!isFullClient(client)) {
      return { text: "", extraCount: 0 };
    }
    const text = client.latest_manager_note?.trim() ?? "";
    const count = client.manager_notes_count ?? 0;
    return { text, extraCount: text && count > 1 ? count - 1 : 0 };
  }

  function renderClientNote(client: Client | ClientBrief) {
    const { text, extraCount } = clientLatestNote(client);
    if (!text) {
      return <span className="text-sm text-muted">—</span>;
    }
    return (
      <div className="max-w-[240px]">
        <p className="line-clamp-2 whitespace-pre-wrap leading-snug text-foreground" title={text}>
          {text}
        </p>
        {extraCount > 0 ? <p className="mt-0.5 text-[11px] text-muted">ещё {extraCount}</p> : null}
      </div>
    );
  }

  function collectionStageBadge(client: Client | ClientBrief) {
    if (client.engagement_stage === "bankruptcy") {
      return <Badge tone="success">На банкротстве</Badge>;
    }
    if (isFullClient(client)) {
      return (
        <div className="flex flex-col gap-1">
          {client.document_collection_status === "paid" ? (
            <Badge tone="success">Оплачен сбор</Badge>
          ) : (
            <Badge tone="warning">Ожидает оплату</Badge>
          )}
          {client.document_collection_paid_date ? (
            <span className="text-xs text-muted">{formatDate(client.document_collection_paid_date)}</span>
          ) : null}
        </div>
      );
    }
    return <Badge tone="warning">Сбор документов</Badge>;
  }

  function handleSort(field: SortField) {
    if (filters.sort_by === field) {
      updateFilters({ sort_dir: filters.sort_dir === "asc" ? "desc" : "asc" });
      return;
    }
    updateFilters({ sort_by: field, sort_dir: "asc" });
  }

  async function handleClaimClient(clientId: string) {
    if (!user) return;
    setSavingField(`${clientId}:claim`);
    setUpdateError(null);
    try {
      const updated = await clientsApi.update(clientId, { assigned_manager_id: user.id });
      setClients((items) =>
        items.map((item) => (item.id === clientId ? { ...item, ...updated } : item)),
      );
    } catch (error) {
      setUpdateError(
        error instanceof ApiRequestError ? error.message : "Не удалось закрепить клиента",
      );
    } finally {
      setSavingField(null);
    }
  }

  async function handleClientUpdate(
    clientId: string,
    data: Record<string, unknown>,
    fieldKey: string,
  ) {
    setSavingField(`${clientId}:${fieldKey}`);
    setUpdateError(null);
    try {
      const updated = await clientsApi.update(clientId, data);
      setClients((items) =>
        items.map((item) => (item.id === clientId ? { ...item, ...updated } : item)),
      );
    } catch (error) {
      setUpdateError(
        error instanceof ApiRequestError ? error.message : "Не удалось сохранить изменения",
      );
    } finally {
      setSavingField(null);
    }
  }

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      await exportsApi.clients({
        status: isCollectionView ? filters.status || undefined : undefined,
        overdue: filters.overdue || undefined,
        engagement_stage: isCollectionView ? undefined : workspaceConfig.engagementStage,
        collection_view: isCollectionView ? filters.collection_view : undefined,
        manager_id: filters.manager_id || undefined,
        phone: filters.phone.trim() || undefined,
        name: filters.name.trim() || undefined,
        contract_month: filters.contract_month || undefined,
        due_month: filters.due_month || undefined,
        sort_by: filters.sort_by,
        sort_dir: filters.sort_dir,
      });
    } catch (error) {
      setExportError(
        error instanceof ApiRequestError ? error.message : "Не удалось выгрузить Excel",
      );
    } finally {
      setExporting(false);
    }
  }

  const listSubtitle = isCollectionStaff
    ? isCollectionView
      ? "Клиенты всех менеджеров на этапе сбора документов"
      : "Договоры банкротства всех менеджеров"
    : workspaceConfig.subtitle;

  return (
    <div className="page-stack">
      {toast && (
        <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />
      )}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/clients/collection"
          className={
            isCollectionView ? "tab-pill-active bg-status-warning-bg text-status-warning-text ring-status-warning-border" : "tab-pill-inactive"
          }
        >
          Сбор документов
        </Link>
        <Link
          href="/clients/contracts"
          className={!isCollectionView ? "tab-pill-active" : "tab-pill-inactive"}
        >
          Договоры
        </Link>
      </div>

      {isCollectionView && (
        <div className="flex flex-wrap gap-2">
          {COLLECTION_VIEW_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => updateFilters({ collection_view: option.value })}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
                filters.collection_view === option.value
                  ? "bg-status-warning-solid text-white shadow-soft"
                  : "bg-surface text-muted ring-1 ring-border hover:bg-surface-muted"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      <PageHeader
        title={workspaceConfig.title}
        subtitle={
          loading
            ? listSubtitle
            : `${listSubtitle} · ${totalClients} всего${totalPages > 1 ? ` · стр. ${filters.page}/${totalPages}` : ""}`
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={handleExport} disabled={exporting}>
              {exporting ? "Выгрузка..." : "Excel"}
            </Button>
            {canCreate && isCollectionView ? (
              <Button onClick={() => setShowForm((v) => !v)}>
                {showForm ? "Скрыть форму" : "Добавить клиента"}
              </Button>
            ) : null}
          </div>
        }
      />

      {exportError && <p className="alert-danger">{exportError}</p>}

      {updateError && <p className="alert-danger">{updateError}</p>}

      <Card>
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="min-w-0">
              <label className="mb-0.5 block text-xs text-muted">Поиск по ФИО</label>
              <Input
                placeholder="Иванов Иван"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
              />
            </div>
            <div className="min-w-0">
              <label className="mb-0.5 block text-xs text-muted">Поиск по телефону</label>
              <Input
                placeholder="+7 928 000-00-00"
                value={phoneDraft}
                onChange={(e) => setPhoneDraft(e.target.value)}
              />
            </div>
          </div>

          {(nameDraft.trim() || phoneDraft.trim()) && (
            <p className="text-[11px] text-muted">
              Поиск по всей компании: фильтры месяца и раздела временно не мешают находить клиента.
            </p>
          )}

          <div className="flex flex-wrap items-end gap-2">
            {isCollectionView && (
              <div className="min-w-[140px] flex-1 sm:w-[160px] sm:flex-none">
                <label className="mb-0.5 block text-xs text-muted">Статус</label>
                <Select
                  value={filters.status}
                  onChange={(e) => updateFilters({ status: e.target.value })}
                >
                  <option value="">Все</option>
                  <option value="active">Активен</option>
                  <option value="completed">Завершён</option>
                  <option value="defaulted">Просрочен</option>
                  <option value="cancelled">Отменён</option>
                </Select>
              </div>
            )}
            <div className="min-w-[140px] flex-1 sm:w-[160px] sm:flex-none">
              <label className="mb-0.5 block text-xs text-muted">Месяц договора</label>
              <Input
                type="month"
                value={filters.contract_month}
                onChange={(e) => updateFilters({ contract_month: e.target.value })}
              />
            </div>
            {!isCollectionView && !isCollectionStaff && (
              <div className="min-w-[140px] flex-1 sm:w-[160px] sm:flex-none">
                <label className="mb-0.5 block text-xs text-muted">Платёж в месяце</label>
                <Input
                  type="month"
                  value={filters.due_month}
                  onChange={(e) => updateFilters({ due_month: e.target.value })}
                />
              </div>
            )}
            {!isCollectionView && (
              <div className="min-w-[140px] flex-1 sm:w-[170px] sm:flex-none">
                <label className="mb-0.5 block text-xs text-muted">Этап процедуры</label>
                <Select
                  value={filters.procedure_stage}
                  onChange={(e) => updateFilters({ procedure_stage: e.target.value })}
                >
                  <option value="">Все этапы</option>
                  {PROCEDURE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {!isCollectionView && (
              <label className="flex h-[30px] items-center gap-2 px-1 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={filters.overdue}
                  onChange={(e) => updateFilters({ overdue: e.target.checked })}
                />
                Только с просрочкой
              </label>
            )}
            {user?.role === "owner" && managers.length > 0 && (
              <div className="min-w-[140px] flex-1 sm:w-[180px] sm:flex-none">
                <label className="mb-0.5 block text-xs text-muted">Менеджер</label>
                <Select
                  value={filters.manager_id}
                  onChange={(e) => updateFilters({ manager_id: e.target.value })}
                >
                  <option value="">Все</option>
                  {managers.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.full_name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        </div>
      </Card>

      {!isCollectionView && !isCollectionStaff && filters.due_month && dueMonthSummary ? (
        <Card variant="accent">
          <SectionTitle
            title={`Рассрочка за ${formatMonthLabel(dueMonthSummary.month)}`}
            description="Сводка по выбранному месяцу платежа и текущим фильтрам"
          />
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Клиентов с платежом"
              value={dueMonthSummary.clients_count}
              tone="brand"
            />
            <StatCard
              label="План на месяц"
              value={formatMoney(dueMonthSummary.planned_total)}
              tone="default"
            />
            <StatCard
              label="Осталось получить"
              value={formatMoney(dueMonthSummary.remainder_total)}
              tone={Number(dueMonthSummary.remainder_total) > 0 ? "warning" : "success"}
            />
            <StatCard
              label="Получено в месяце"
              value={formatMoney(dueMonthSummary.collected_total)}
              tone="success"
            />
            <StatCard
              label="Оплачено / не оплачено"
              value={`${dueMonthSummary.paid_due_count} / ${dueMonthSummary.unpaid_due_count}`}
              tone="default"
              hint="платежей в этом месяце"
            />
            <StatCard
              label="Платежей осталось"
              value={dueMonthSummary.payments_remaining_total}
              tone="warning"
              hint="по всем клиентам в списке"
            />
          </div>
        </Card>
      ) : null}

      {showForm && isCollectionView && (
        <Card variant="accent">
          <SectionTitle
            title="Новый клиент"
            description="Сначала оформляется сбор документов (13 000 ₽). Банкротство — после завершения сбора."
          />
          <form onSubmit={handleCreate} className="grid gap-2 md:grid-cols-2">
            <FormField label="ФИО" error={formErrors.full_name}>
              <Input
                placeholder="Иванов Иван"
                value={form.full_name}
                onChange={(e) =>
                  setForm({ ...form, full_name: e.target.value.replace(/\s+/g, " ").replace(/[^\u0401\u0451\u0410-\u044fa-zA-Z\s\-']/g, "") })
                }
                required
              />
            </FormField>
            <FormField label="Телефон" error={formErrors.phone}>
              <PhoneInput
                value={form.phone}
                onValueChange={(phone) => setForm({ ...form, phone })}
                required
              />
            </FormField>
            <FormField label="Дата договора" error={formErrors.contract_date}>
              <Input
                type="date"
                value={form.contract_date}
                onChange={(e) => setForm({ ...form, contract_date: e.target.value })}
                required
              />
            </FormField>
            {canAssignManager && managers.length > 0 && (
              <Select
                value={form.assigned_manager_id}
                onChange={(e) => setForm({ ...form, assigned_manager_id: e.target.value })}
              >
                <option value="">Менеджер не выбран</option>
                {managers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.full_name}
                  </option>
                ))}
              </Select>
            )}
            <Button type="submit" className="md:col-span-2">
              Создать (сбор документов)
            </Button>
            {createError && (
              <p className="text-sm text-status-danger-text md:col-span-2">
                {createError.message}
                {createError.clientId ? (
                  <>
                    {" "}
                    <Link
                      href={clientDetailHref(createError.clientId, listReturnUrl)}
                      className="font-medium underline underline-offset-2"
                    >
                      Открыть карточку
                    </Link>
                  </>
                ) : null}
              </p>
            )}
          </form>
        </Card>
      )}

      <Card>
        {loading ? (
          <LoadingState text="Загрузка клиентов..." />
        ) : loadError ? (
          <div className="space-y-3 rounded-lg border border-status-danger-border bg-status-danger-bg px-3 py-4 text-center">
            <p className="text-sm text-status-danger-text">{loadError}</p>
            <Button type="button" variant="secondary" onClick={reloadClients}>
              Повторить
            </Button>
          </div>
        ) : clients.length === 0 ? (
          <EmptyState
            action={
              canCreate && isCollectionView ? (
                <Button type="button" onClick={() => setShowForm(true)}>
                  Добавить клиента
                </Button>
              ) : undefined
            }
          >
            {workspaceConfig.emptyText}
          </EmptyState>
        ) : (
          <>
            {canEdit ? (
              <div className="desktop-only mb-2 flex items-center justify-end gap-2">
                {editMode ? (
                  <span className="type-hint">Правки сохраняются сразу</span>
                ) : null}
                <Button
                  type="button"
                  variant={editMode ? "primary" : "secondary"}
                  aria-pressed={editMode}
                  onClick={() => setEditMode((value) => !value)}
                >
                  {editMode ? "Готово" : "Редактировать"}
                </Button>
              </div>
            ) : null}
            <div className="mobile-only space-y-2">
              {clients.map((client) => {
                const isOverdue = isFullClient(client) && client.has_overdue;
                return (
                  <article
                    key={client.id}
                    className={cn(
                      "mobile-client-card",
                      isOverdue && "mobile-client-card-overdue",
                    )}
                  >
                    <Link href={clientDetailHref(client.id, listReturnUrl)} className="block">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p
                            className={cn(
                              "truncate font-semibold text-foreground",
                              isOverdue && "text-status-danger-text",
                            )}
                          >
                            {formatShortName(client.full_name)}
                          </p>
                          <p className="text-xs text-muted">{client.phone}</p>
                        </div>
                        <Badge
                          tone={
                            client.status === "active"
                              ? "success"
                              : client.status === "defaulted"
                                ? "danger"
                                : "default"
                          }
                        >
                          {statusLabel(client.status)}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <span>Договор: {formatDate(client.contract_date)}</span>
                        {canSeeClientAmounts && !isCollectionView && isFullClient(client) && filters.due_month ? (
                          <>
                            <span className="font-medium text-foreground">
                              План: {client.month_planned ? formatMoney(client.month_planned) : "—"}
                            </span>
                            <span>
                              Остаток:{" "}
                              <span
                                className={
                                  client.month_remainder && Number(client.month_remainder) > 0
                                    ? "font-medium text-status-warning-text"
                                    : "text-status-success-text"
                                }
                              >
                                {client.month_remainder != null
                                  ? formatMoney(client.month_remainder)
                                  : "—"}
                              </span>
                            </span>
                            <span>Платежей ост.: {client.payments_remaining ?? "—"}</span>
                          </>
                        ) : null}
                        {canSeeClientAmounts && !isCollectionView && isFullClient(client) && !filters.due_month && client.contract_total ? (
                          <span className="font-medium text-foreground">
                            {formatMoney(client.contract_total)}
                          </span>
                        ) : null}
                        {canSeeClientAmounts && !isCollectionView && isOverdue ? (
                          <Badge tone="danger">Просрочка</Badge>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {isCollectionView ? (
                          collectionStageBadge(client)
                        ) : (
                          renderClientNote(client)
                        )}
                        {isManager && isCollectionView && isFullClient(client) && client.assigned_manager_id === user?.id ? (
                          <Badge tone="success">За вами</Badge>
                        ) : null}
                      </div>
                    </Link>
                    {isManager && isCollectionView && isFullClient(client) && !client.assigned_manager_id ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="mt-2 w-full"
                        disabled={savingField === `${client.id}:claim`}
                        onClick={() => handleClaimClient(client.id)}
                      >
                        {savingField === `${client.id}:claim` ? "Закрепление..." : "Принять в работу"}
                      </Button>
                    ) : null}
                  </article>
                );
              })}
            </div>
            <div className="desktop-only overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableTh
                    label="Фамилия и имя"
                    field="full_name"
                    sortBy={filters.sort_by}
                    sortDir={filters.sort_dir}
                    onSort={handleSort}
                  />
                  <th>Телефон</th>
                  <SortableTh
                    label="Дата договора"
                    field="contract_date"
                    sortBy={filters.sort_by}
                    sortDir={filters.sort_dir}
                    onSort={handleSort}
                  />
                  {canSeeClientAmounts && !isCollectionView && filters.due_month && (
                    <>
                      <th className="font-semibold text-foreground">План месяца</th>
                      <th className="font-semibold text-foreground">Оплачено</th>
                      <th className="font-semibold text-foreground">Остаток</th>
                      <th className="font-semibold text-foreground">Платежей ост.</th>
                    </>
                  )}
                  {canSeeClientAmounts && !isCollectionView && !filters.due_month && (
                    <th className="font-semibold text-foreground">Сумма договора</th>
                  )}
                  {canAssignManager && <th>Менеджер</th>}
                  {isManager && isCollectionView && <th>Закрепление</th>}
                  <th>{isCollectionView ? "Этап" : "Примечание"}</th>
                  <SortableTh
                    label="Статус"
                    field="status"
                    sortBy={filters.sort_by}
                    sortDir={filters.sort_dir}
                    onSort={handleSort}
                  />
                  {canSeeClientAmounts && !isCollectionView && (
                    <SortableTh
                      label="Просрочка"
                      field="overdue"
                      sortBy={filters.sort_by}
                      sortDir={filters.sort_dir}
                      onSort={handleSort}
                    />
                  )}
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => {
                  const isOverdue = isFullClient(client) && client.has_overdue;
                  const statusSaving = savingField === `${client.id}:status`;
                  const managerSaving = savingField === `${client.id}:manager`;
                  return (
                  <tr
                    key={client.id}
                    className={isOverdue ? "is-overdue" : undefined}
                  >
                    <td>
                      <Link
                        href={clientDetailHref(client.id, listReturnUrl)}
                        className={`link-brand ${
                          isOverdue ? "text-status-danger-text hover:text-status-danger-solid" : ""
                        }`}
                      >
                        {formatShortName(client.full_name)}
                      </Link>
                    </td>
                    <td className="text-muted">{client.phone}</td>
                    <td className="text-muted">
                      {canEdit && editMode ? (
                        <Input
                          type="date"
                          className="min-w-[140px]"
                          value={client.contract_date}
                          disabled={savingField === `${client.id}:contract_date`}
                          onChange={(e) =>
                            handleClientUpdate(
                              client.id,
                              { contract_date: e.target.value },
                              "contract_date",
                            )
                          }
                        />
                      ) : (
                        formatDate(client.contract_date)
                      )}
                    </td>
                    {canSeeClientAmounts && !isCollectionView && isFullClient(client) && filters.due_month && (
                      <>
                        <td className="font-medium text-foreground">
                          {client.month_planned ? formatMoney(client.month_planned) : "—"}
                        </td>
                        <td className="text-muted">
                          {client.month_paid ? formatMoney(client.month_paid) : "—"}
                        </td>
                        <td
                          className={
                            client.month_remainder && Number(client.month_remainder) > 0
                              ? "font-medium text-status-warning-text"
                              : "text-status-success-text"
                          }
                        >
                          {client.month_remainder != null ? formatMoney(client.month_remainder) : "—"}
                        </td>
                        <td className="text-muted">
                          {client.payments_remaining ?? "—"}
                        </td>
                      </>
                    )}
                    {canSeeClientAmounts && !isCollectionView && isFullClient(client) && !filters.due_month && (
                      <td className="font-medium text-foreground">
                        {client.contract_total
                          ? formatMoney(client.contract_total)
                          : "—"}
                      </td>
                    )}
                    {canAssignManager && (
                      <td>
                        {editMode ? (
                          <Select
                            className="min-w-[160px]"
                            value={client.assigned_manager_id ?? ""}
                            disabled={managerSaving}
                            onChange={(e) =>
                              handleClientUpdate(
                                client.id,
                                { assigned_manager_id: e.target.value || null },
                                "manager",
                              )
                            }
                          >
                            <option value="">Не назначен</option>
                            {managers.map((manager) => (
                              <option key={manager.id} value={manager.id}>
                                {manager.full_name}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <span className="text-muted">
                            {managers.find((manager) => manager.id === client.assigned_manager_id)
                              ?.full_name ?? "Не назначен"}
                          </span>
                        )}
                      </td>
                    )}
                    {isManager && isCollectionView && (
                      <td>
                        {isFullClient(client) && !client.assigned_manager_id ? (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={savingField === `${client.id}:claim`}
                            onClick={() => handleClaimClient(client.id)}
                          >
                            {savingField === `${client.id}:claim`
                              ? "Закрепление..."
                              : "Принять в работу"}
                          </Button>
                        ) : isFullClient(client) && client.assigned_manager_id === user?.id ? (
                          <Badge tone="success">За вами</Badge>
                        ) : (
                          <span className="text-xs text-muted">Назначен</span>
                        )}
                      </td>
                    )}
                    <td>
                      {isCollectionView ? collectionStageBadge(client) : renderClientNote(client)}
                    </td>
                    <td>
                      {canEdit && editMode && isFullClient(client) ? (
                        <Select
                          className="min-w-[140px]"
                          value={client.status}
                          disabled={statusSaving}
                          onChange={(e) =>
                            handleClientUpdate(
                              client.id,
                              { status: e.target.value },
                              "status",
                            )
                          }
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Badge
                          tone={
                            client.status === "active"
                              ? "success"
                              : client.status === "defaulted"
                                ? "danger"
                                : "default"
                          }
                        >
                          {statusLabel(client.status)}
                        </Badge>
                      )}
                    </td>
                    {canSeeClientAmounts && !isCollectionView && (
                      <td>
                        {isFullClient(client) && client.has_overdue ? (
                          <Badge tone="danger">Есть</Badge>
                        ) : (
                          <span className="text-sm text-muted">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
        {!loading && clients.length > 0 && (
          <Pagination
            page={filters.page}
            pageSize={CLIENTS_PAGE_SIZE}
            total={totalClients}
            totalPages={totalPages}
            onPageChange={(nextPage) => updateFilters({ page: nextPage }, { resetPage: false })}
          />
        )}
      </Card>
    </div>
  );
}
