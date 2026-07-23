"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Badge, Button, Card, Input, LoadingState, PageHeader, PhoneInput, SectionTitle, Select } from "@/components/ui";
import { ApiRequestError, clientsApi, exportsApi, usersApi } from "@/lib/api-client";
import { formatDate, formatMoney, formatShortName, engagementStageLabel, isFullClient, procedureStageLabel, statusLabel } from "@/lib/format";
import { PHONE_PREFIX } from "@/lib/phone";
import type { Client, ClientBrief, ClientStatus, ProcedureStage, User } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

type SortField = "full_name" | "contract_date" | "debt_amount" | "status" | "overdue" | "created_at";
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
          active ? "text-brand-700" : "text-slate-700 hover:text-brand-600"
        }`}
      >
        {label}
        <span className="text-xs text-slate-400">{active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
}

type ClientWorkspace = "collection" | "contracts";
type CollectionViewFilter = "active" | "paid" | "converted" | "all";

const COLLECTION_VIEW_OPTIONS: Array<{ value: CollectionViewFilter; label: string }> = [
  { value: "active", label: "В работе" },
  { value: "paid", label: "Оплатили сбор" },
  { value: "converted", label: "На банкротстве" },
  { value: "all", label: "Все" },
];

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
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<Array<Client | ClientBrief>>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [overdueFilter, setOverdueFilter] = useState(
    searchParams.get("overdue") === "true",
  );
  const [procedureFilter, setProcedureFilter] = useState(
    searchParams.get("procedure_stage") ?? "",
  );
  const [managerFilter, setManagerFilter] = useState("");
  const [phoneSearch, setPhoneSearch] = useState("");
  const [nameSearch, setNameSearch] = useState("");
  const [contractMonth, setContractMonth] = useState("");
  const [dueMonth, setDueMonth] = useState("");
  const [managers, setManagers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [collectionView, setCollectionView] = useState<CollectionViewFilter>("active");
  const [savingField, setSavingField] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    phone: PHONE_PREFIX,
    contract_date: "",
    assigned_manager_id: "",
  });

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const data = await clientsApi.list({
        status: statusFilter || undefined,
        overdue: overdueFilter || undefined,
        procedure_stage: procedureFilter || undefined,
        engagement_stage: isCollectionView ? undefined : workspaceConfig.engagementStage,
        collection_view: isCollectionView ? collectionView : undefined,
        manager_id: managerFilter || undefined,
        phone: phoneSearch.trim() || undefined,
        name: nameSearch.trim() || undefined,
        contract_month: contractMonth || undefined,
        due_month: dueMonth || undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      setClients(data);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, procedureFilter, workspaceConfig.engagementStage, isCollectionView, collectionView, overdueFilter, managerFilter, phoneSearch, nameSearch, contractMonth, dueMonth, sortBy, sortDir]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

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
    try {
      const created = await clientsApi.create({
        ...form,
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
      setCreateError(
        error instanceof ApiRequestError ? error.message : "Не удалось создать клиента",
      );
    }
  }

  const canCreate = user?.role === "owner" || user?.role === "manager";
  const canEdit = canCreate;
  const isManager = user?.role === "manager";
  const canAssignManager = user?.role === "owner";
  const canManageProcedure = user?.role === "owner";
  const canSeeClientAmounts = user?.role === "owner" || user?.role === "manager";

  function handleSort(field: SortField) {
    if (sortBy === field) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(field);
    setSortDir("asc");
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
        status: statusFilter || undefined,
        overdue: overdueFilter || undefined,
        procedure_stage: procedureFilter || undefined,
        engagement_stage: isCollectionView ? undefined : workspaceConfig.engagementStage,
        collection_view: isCollectionView ? collectionView : undefined,
        manager_id: managerFilter || undefined,
        phone: phoneSearch.trim() || undefined,
        name: nameSearch.trim() || undefined,
        contract_month: contractMonth || undefined,
        due_month: dueMonth || undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
      });
    } catch (error) {
      setExportError(
        error instanceof ApiRequestError ? error.message : "Не удалось выгрузить Excel",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Link
          href="/clients/collection"
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            isCollectionView
              ? "bg-amber-100 text-amber-900 ring-1 ring-amber-200"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Сбор документов
        </Link>
        <Link
          href="/clients/contracts"
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            !isCollectionView
              ? "bg-brand-100 text-brand-900 ring-1 ring-brand-200"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
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
              onClick={() => setCollectionView(option.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                collectionView === option.value
                  ? "bg-amber-600 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
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
            ? workspaceConfig.subtitle
            : `${workspaceConfig.subtitle} · ${clients.length} в списке`
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

      {exportError && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {exportError}
        </p>
      )}

      {updateError && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {updateError}
        </p>
      )}

      <Card>
        <div className="flex flex-wrap gap-4">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-sm text-slate-600">Поиск по ФИО</label>
            <Input
              placeholder="Иванов Иван"
              value={nameSearch}
              onChange={(e) => setNameSearch(e.target.value)}
            />
          </div>
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-sm text-slate-600">Поиск по телефону</label>
            <Input
              placeholder="+7 928 000-00-00"
              value={phoneSearch}
              onChange={(e) => setPhoneSearch(e.target.value)}
            />
          </div>
          <div className="min-w-[180px]">
            <label className="mb-1 block text-sm text-slate-600">Статус</label>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Все</option>
              <option value="active">Активен</option>
              <option value="completed">Завершён</option>
              <option value="defaulted">Просрочен</option>
              <option value="cancelled">Отменён</option>
            </Select>
          </div>
          {!isCollectionView && (
            <div className="min-w-[180px]">
              <label className="mb-1 block text-sm text-slate-600">Этап процедуры</label>
              <Select
                value={procedureFilter}
                onChange={(e) => setProcedureFilter(e.target.value)}
              >
                <option value="">Все</option>
                {PROCEDURE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="min-w-[180px]">
            <label className="mb-1 block text-sm text-slate-600">Месяц договора</label>
            <Input
              type="month"
              value={contractMonth}
              onChange={(e) => setContractMonth(e.target.value)}
            />
          </div>
          {!isCollectionView && (
            <div className="min-w-[180px]">
              <label className="mb-1 block text-sm text-slate-600">Платёж в месяце</label>
              <Input
                type="month"
                value={dueMonth}
                onChange={(e) => setDueMonth(e.target.value)}
              />
            </div>
          )}
          {!isCollectionView && (
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={overdueFilter}
                  onChange={(e) => setOverdueFilter(e.target.checked)}
                />
                Только с просрочкой
              </label>
            </div>
          )}
          {user?.role === "owner" && managers.length > 0 && (
            <div className="min-w-[180px]">
              <label className="mb-1 block text-sm text-slate-600">Менеджер</label>
              <Select
                value={managerFilter}
                onChange={(e) => setManagerFilter(e.target.value)}
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
      </Card>

      {showForm && isCollectionView && (
        <Card variant="accent">
          <SectionTitle
            title="Новый клиент"
            description="Сначала оформляется сбор документов (13 000 ₽). Банкротство — после завершения сбора."
          />
          <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
            <Input
              placeholder="ФИО"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              required
            />
            <PhoneInput
              value={form.phone}
              onValueChange={(phone) => setForm({ ...form, phone })}
              required
            />
            <Input
              type="date"
              value={form.contract_date}
              onChange={(e) => setForm({ ...form, contract_date: e.target.value })}
              required
            />
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
              <p className="text-sm text-red-600 md:col-span-2">{createError}</p>
            )}
          </form>
        </Card>
      )}

      <Card>
        {loading ? (
          <LoadingState text="Загрузка клиентов..." />
        ) : clients.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            {workspaceConfig.emptyText}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableTh
                    label="Фамилия и имя"
                    field="full_name"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  <th>Телефон</th>
                  <SortableTh
                    label="Дата договора"
                    field="contract_date"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  {canSeeClientAmounts && !isCollectionView && (
                    <th className="font-semibold text-slate-700">Сумма договора</th>
                  )}
                  {canAssignManager && <th>Менеджер</th>}
                  {isManager && isCollectionView && <th>Закрепление</th>}
                  <th>Этап</th>
                  <SortableTh
                    label="Статус"
                    field="status"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  {canSeeClientAmounts && !isCollectionView && (
                    <SortableTh
                      label="Просрочка"
                      field="overdue"
                      sortBy={sortBy}
                      sortDir={sortDir}
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
                  const stageSaving = savingField === `${client.id}:procedure_stage`;
                  return (
                  <tr
                    key={client.id}
                    className={isOverdue ? "bg-rose-50/80 hover:bg-rose-100/70" : undefined}
                  >
                    <td>
                      <Link
                        href={`/clients/${client.id}`}
                        className={`font-semibold hover:text-brand-600 ${
                          isOverdue ? "text-rose-700" : "text-brand-700"
                        }`}
                      >
                        {formatShortName(client.full_name)}
                      </Link>
                    </td>
                    <td className="text-slate-600">{client.phone}</td>
                    <td className="text-slate-600">
                      {canEdit ? (
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
                    {canSeeClientAmounts && !isCollectionView && isFullClient(client) && (
                      <td className="font-medium text-slate-800">
                        {client.contract_total
                          ? formatMoney(client.contract_total)
                          : "—"}
                      </td>
                    )}
                    {canAssignManager && (
                      <td>
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
                          <span className="text-xs text-slate-500">Назначен</span>
                        )}
                      </td>
                    )}
                    <td>
                      {isCollectionView ? (
                        isFullClient(client) ? (
                          <div className="flex flex-col gap-1">
                            {client.engagement_stage === "bankruptcy" ? (
                              <Badge tone="success">На банкротстве</Badge>
                            ) : client.document_collection_status === "paid" ? (
                              <Badge tone="success">Оплачен сбор</Badge>
                            ) : (
                              <Badge tone="warning">Ожидает оплату</Badge>
                            )}
                            {client.document_collection_paid_date && (
                              <span className="text-xs text-slate-500">
                                {formatDate(client.document_collection_paid_date)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <Badge tone="warning">Сбор документов</Badge>
                        )
                      ) : isFullClient(client) && client.engagement_stage === "document_collection" ? (
                        <Badge tone="warning">{engagementStageLabel(client.engagement_stage)}</Badge>
                      ) : canManageProcedure ? (
                        <Select
                          className="min-w-[150px]"
                          value={client.procedure_stage}
                          disabled={stageSaving}
                          onChange={(e) =>
                            handleClientUpdate(
                              client.id,
                              { procedure_stage: e.target.value },
                              "procedure_stage",
                            )
                          }
                        >
                          {PROCEDURE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Badge tone="default">{procedureStageLabel(client.procedure_stage)}</Badge>
                      )}
                    </td>
                    <td>
                      {canEdit && isFullClient(client) ? (
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
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
