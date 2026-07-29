"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  BackLink,
  Badge,
  Button,
  Card,
  CollapsibleCard,
  EmptyState,
  FormField,
  Input,
  LoadingState,
  PageHeader,
  PhoneInput,
  SectionTitle,
  Select,
  StatCard,
  Toast,
} from "@/components/ui";
import { ApiRequestError, auditApi, clientsApi, documentCollectionApi, exportsApi, installmentApi, mandatoryPaymentsApi, paymentsApi, scheduleApi, usersApi } from "@/lib/api-client";
import { effectiveDueDate, documentCollectionStatusLabel, engagementStageLabel, formatAmountInput, formatDate, formatMoney, formatShortName, statusLabel } from "@/lib/format";
import { addOneMonth, ensurePhonePrefix, phoneToWhatsAppWebUrl } from "@/lib/phone";
import {
  filterDecimalInput,
  filterPersonName,
  validateFullName,
  validatePhone,
  validatePositiveAmount,
  validateRequiredDate,
} from "@/lib/validation";
import type { AuditLogEntry, ClientBrief, ClientDetail, ClientStatus, MandatoryPayment, PaymentScheduleItem, ProcedureStage, User } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";
import { cn } from "@/lib/cn";

type ClientNavSection = {
  id: string;
  label: string;
};

const CLIENT_SECTION_CLASS = "client-section-anchor";

type PendingScheduleAdd = {
  tempId: string;
  planned_amount: string;
  due_date: string;
};

type ScheduleDraft = {
  edits: Record<string, { planned_amount: string; due_date: string }>;
  pendingAdds: PendingScheduleAdd[];
  pendingDeletes: string[];
  pendingWaives: string[];
};

const EMPTY_SCHEDULE_DRAFT: ScheduleDraft = {
  edits: {},
  pendingAdds: [],
  pendingDeletes: [],
  pendingWaives: [],
};

const MANAGER_FIRST_COMMISSION = 10000;

type ToastState = {
  message: string;
  tone: "success" | "error" | "info";
};

function getScheduleEditValues(
  item: PaymentScheduleItem,
  edits: ScheduleDraft["edits"],
): { planned_amount: string; due_date: string } {
  return (
    edits[item.id] ?? {
      planned_amount: item.planned_amount,
      due_date: item.due_date,
    }
  );
}

function isScheduleDraftDirty(draft: ScheduleDraft, schedule: PaymentScheduleItem[]): boolean {
  const hasEdits = schedule.some((item) => {
    if (draft.pendingDeletes.includes(item.id)) {
      return false;
    }
    const values = getScheduleEditValues(item, draft.edits);
    return (
      values.planned_amount !== item.planned_amount || values.due_date !== item.due_date
    );
  });

  return (
    hasEdits ||
    draft.pendingAdds.length > 0 ||
    draft.pendingDeletes.length > 0 ||
    draft.pendingWaives.length > 0
  );
}

function computeScheduleDraftPlannedTotal(
  schedule: PaymentScheduleItem[],
  draft: ScheduleDraft,
): number {
  let total = 0;
  for (const item of schedule) {
    if (draft.pendingDeletes.includes(item.id)) {
      continue;
    }
    const values = getScheduleEditValues(item, draft.edits);
    total += Number(values.planned_amount) || 0;
  }
  for (const add of draft.pendingAdds) {
    total += Number(add.planned_amount) || 0;
  }
  return total;
}

function formatScheduleMismatchMessage(
  contractTotal: number,
  plannedTotal: number,
): string {
  const diff = Math.round(plannedTotal - contractTotal);
  const formattedContract = Math.round(contractTotal).toLocaleString("ru-RU");
  const formattedPlanned = Math.round(plannedTotal).toLocaleString("ru-RU");
  if (diff > 0) {
    return `Сумма по графику (${formattedPlanned} ₽) превышает сумму договора (${formattedContract} ₽) на ${diff.toLocaleString("ru-RU")} ₽`;
  }
  if (diff < 0) {
    return `Не хватает ${Math.abs(diff).toLocaleString("ru-RU")} ₽: по графику ${formattedPlanned} ₽, договор ${formattedContract} ₽`;
  }
  return "";
}

function scheduleTone(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "paid") return "success";
  if (status === "partial") return "warning";
  if (status === "overdue") return "danger";
  return "default";
}

function remainingAmount(item: PaymentScheduleItem): number {
  const diff = Number(item.planned_amount) - Number(item.paid_amount);
  return diff > 0 ? diff : 0;
}

function mandatoryRemaining(item: MandatoryPayment): number {
  const diff = Number(item.planned_amount) - Number(item.paid_amount);
  return diff > 0 ? diff : 0;
}

function mandatoryTypeHint(type: string): string {
  if (type === "deposit") return "Фиксировано: 25 000 ₽";
  if (type === "court_fee") return "Указывается при необходимости";
  return "Укажите сумму перед внесением";
}

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [client, setClient] = useState<ClientDetail | ClientBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    payment_schedule_id: "",
    amount: "",
    payment_date: new Date().toISOString().slice(0, 10),
    comment: "",
  });
  const [refundForm, setRefundForm] = useState({
    payment_schedule_id: "",
    amount: "",
    payment_date: new Date().toISOString().slice(0, 10),
    comment: "",
  });
  const [mandatoryPayingId, setMandatoryPayingId] = useState<string | null>(null);
  const [plannedEdits, setPlannedEdits] = useState<Record<string, string>>({});
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneValue, setPhoneValue] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [editingContractAmount, setEditingContractAmount] = useState(false);
  const [contractAmountValue, setContractAmountValue] = useState("");
  const [contractAmountSaving, setContractAmountSaving] = useState(false);
  const [deferringId, setDeferringId] = useState<string | null>(null);
  const [deferForm, setDeferForm] = useState({ deferred_until: "", comment: "" });
  const [notePanelId, setNotePanelId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSavingId, setNoteSavingId] = useState<string | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft>(EMPTY_SCHEDULE_DRAFT);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
  const [exporting, setExporting] = useState(false);
  const [managers, setManagers] = useState<User[]>([]);
  const [cardSaving, setCardSaving] = useState<string | null>(null);
  const [docCollectionSaving, setDocCollectionSaving] = useState(false);
  const [editingDocCollectionAmounts, setEditingDocCollectionAmounts] = useState(false);
  const [docCollectionAmountForm, setDocCollectionAmountForm] = useState({
    collection_fee: "",
    notary_fee: "",
    manager_commission: "",
  });
  const [docCollectionAmountsSaving, setDocCollectionAmountsSaving] = useState(false);
  const [convertSaving, setConvertSaving] = useState(false);
  const [commissionSaving, setCommissionSaving] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertForm, setConvertForm] = useState({
    auto_installment: false,
    debt_amount: "",
    contract_total: "",
    contract_date: "",
  });
  const [docCollectionPaymentDate, setDocCollectionPaymentDate] = useState("");
  const [aligningDates, setAligningDates] = useState(false);
  const [paymentDateEdits, setPaymentDateEdits] = useState<Record<string, string>>({});
  const [savingPaymentDateId, setSavingPaymentDateId] = useState<string | null>(null);
  const [deletingClient, setDeletingClient] = useState(false);

  const showToast = useCallback((message: string, tone: ToastState["tone"] = "success") => {
    setToast({ message, tone });
  }, []);

  const fetchClient = useCallback(async () => {
    if (user?.role === "call_center") {
      return clientsApi.get(params.id);
    }
    return clientsApi.getDetail(params.id);
  }, [params.id, user?.role]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setClient(await fetchClient());
    } catch (error) {
      setClient(null);
      showToast(
        error instanceof ApiRequestError ? error.message : "Не удалось загрузить карточку клиента",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [fetchClient, showToast]);

  const refreshClient = useCallback(async () => {
    setRefreshing(true);
    try {
      setClient(await fetchClient());
    } finally {
      setRefreshing(false);
    }
  }, [fetchClient]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!client || user?.role === "call_center") {
      setAuditEntries([]);
      return;
    }
    auditApi
      .list({ entity_type: "client", entity_id: client.id, limit: 30 })
      .then(setAuditEntries)
      .catch(() => setAuditEntries([]));
  }, [client, user?.role]);

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

  useEffect(() => {
    if (!client) return;
    setPaymentForm((prev) => ({ ...prev, payment_date: client.contract_date }));
    setRefundForm((prev) => ({ ...prev, payment_date: client.contract_date }));
    setDocCollectionPaymentDate(client.contract_date);
    setConvertForm((prev) => ({
      ...prev,
      contract_date: client.contract_date,
    }));
  }, [client?.id, client?.contract_date]);

  useEffect(() => {
    if (!client || !isDetail(client)) return;
    setPaymentDateEdits(
      Object.fromEntries(client.payments.map((payment) => [payment.id, payment.payment_date])),
    );
  }, [client]);

  useEffect(() => {
    if (!client || !isDetail(client)) {
      setScheduleOpen(false);
      return;
    }
    const items = client.payment_schedule ?? [];
    const canEdit = user?.role === "owner" || user?.role === "manager";
    // Only when switching clients: auto-open empty schedule for editing.
    // Do not collapse on refresh after payments or notes.
    setScheduleOpen(items.length === 0 && canEdit);
  }, [client?.id, user?.role]);

  useEffect(() => {
    if (!client || !isDetail(client)) return;
    if (isScheduleDraftDirty(scheduleDraft, client.payment_schedule ?? [])) {
      setScheduleOpen(true);
    }
  }, [scheduleDraft, client]);

  function isDetail(data: ClientDetail | ClientBrief | null): data is ClientDetail {
    return data !== null && "debt_amount" in data;
  }

  function handleMonthSelect(scheduleId: string) {
    if (!isDetail(client)) return;

    const item = client.payment_schedule.find((row) => row.id === scheduleId);
    setPaymentForm({
      ...paymentForm,
      payment_schedule_id: scheduleId,
      amount: item ? String(remainingAmount(item)) : "",
      payment_date: item ? effectiveDueDate(item) : paymentForm.payment_date,
    });
  }

  function handleRefundMonthSelect(scheduleId: string) {
    if (!isDetail(client)) return;

    const item = client.payment_schedule.find((row) => row.id === scheduleId);
    setRefundForm({
      ...refundForm,
      payment_schedule_id: scheduleId,
      amount: item ? String(Number(item.paid_amount)) : "",
      payment_date: item?.paid_date || (item ? effectiveDueDate(item) : refundForm.payment_date),
    });
  }

  async function handleRefund(event: React.FormEvent) {
    event.preventDefault();
    if (!client) return;

    const amountError = validatePositiveAmount(refundForm.amount, { label: "Сумма возврата" });
    const dateError = validateRequiredDate(refundForm.payment_date);
    if (amountError || dateError) {
      showToast(amountError || dateError || "Проверьте данные формы", "error");
      return;
    }

    await paymentsApi.create({
      client_id: client.id,
      payment_schedule_id: refundForm.payment_schedule_id,
      amount: refundForm.amount,
      payment_date: refundForm.payment_date,
      comment: refundForm.comment || "Возврат",
      is_refund: true,
    });

    setRefundForm({
      payment_schedule_id: "",
      amount: "",
      payment_date: client.contract_date,
      comment: "",
    });
    refreshClient();
  }

  async function handleDeletePayment(paymentId: string) {
    if (
      !window.confirm(
        "Отменить этот платёж? Запись будет удалена, график платежей пересчитается.",
      )
    ) {
      return;
    }

    setDeletingId(paymentId);
    try {
      await paymentsApi.delete(paymentId);
      await refreshClient();
    } catch (error) {
      showToast(
        error instanceof ApiRequestError
          ? error.message
          : "Не удалось отменить платёж",
        "error",
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function handleUpdatePaymentDate(paymentId: string) {
    const paymentDate = paymentDateEdits[paymentId];
    if (!paymentDate) return;

    setSavingPaymentDateId(paymentId);
    try {
      await paymentsApi.update(paymentId, { payment_date: paymentDate });
      await refreshClient();
      showToast("Дата платежа обновлена");
    } catch (error) {
      showToast(
        error instanceof ApiRequestError ? error.message : "Не удалось обновить дату",
        "error",
      );
    } finally {
      setSavingPaymentDateId(null);
    }
  }

  async function handleAlignPaymentDates() {
    if (!client) return;
    if (
      !window.confirm(
        "Перестроить график от даты договора и перераспределить платежи по месяцам? Используйте для старых клиентов с нестандартными суммами.",
      )
    ) {
      return;
    }

    setAligningDates(true);
    try {
      const result = await clientsApi.alignPaymentDates(client.id);
      await refreshClient();
      showToast(
        `График: ${result.schedule_dates_updated} мес., платежи: ${result.schedule_payments_updated}, обязательные: ${result.mandatory_records_updated}`,
      );
    } catch (error) {
      showToast(
        error instanceof ApiRequestError ? error.message : "Не удалось исправить даты",
        "error",
      );
    } finally {
      setAligningDates(false);
    }
  }

  async function handleDeleteClient() {
    if (!client) return;
    if (
      !window.confirm(
        `Удалить клиента «${client.full_name}» и все связанные данные без возможности восстановления?`,
      )
    ) {
      return;
    }
    if (!window.confirm("Подтвердите окончательное удаление.")) {
      return;
    }

    setDeletingClient(true);
    try {
      await clientsApi.delete(client.id);
      router.push("/clients");
    } catch (error) {
      showToast(
        error instanceof ApiRequestError
          ? error.message
          : "Не удалось удалить клиента",
        "error",
      );
    } finally {
      setDeletingClient(false);
    }
  }

  async function handleToggleManagerCommission(collected: boolean) {
    if (!client) return;
    setCommissionSaving(true);
    try {
      await clientsApi.setManagerFirstCommission(client.id, collected);
      await refreshClient();
      showToast(
        collected ? "Менеджерские 10 000 ₽ отмечены как выданные" : "Отметка о выдаче снята",
        "success",
      );
    } catch (error) {
      showToast(
        error instanceof ApiRequestError ? error.message : "Не удалось сохранить отметку",
        "error",
      );
    } finally {
      setCommissionSaving(false);
    }
  }

  async function handlePayment(event: React.FormEvent) {
    event.preventDefault();
    if (!client) return;

    const amountError = validatePositiveAmount(paymentForm.amount, { label: "Сумма платежа" });
    const dateError = validateRequiredDate(paymentForm.payment_date);
    if (amountError || dateError) {
      showToast(amountError || dateError || "Проверьте данные формы", "error");
      return;
    }

    await paymentsApi.create({
      client_id: client.id,
      payment_schedule_id: paymentForm.payment_schedule_id || null,
      amount: paymentForm.amount,
      payment_date: paymentForm.payment_date,
      comment: paymentForm.comment || null,
    });

    const paidFirstMonth =
      isDetail(client) &&
      paymentForm.payment_schedule_id &&
      client.payment_schedule.find((item) => item.id === paymentForm.payment_schedule_id)
        ?.month_number === 1;

    setPaymentForm({
      payment_schedule_id: "",
      amount: "",
      payment_date: client.contract_date,
      comment: "",
    });
    await refreshClient();
    if (
      paidFirstMonth &&
      isDetail(client) &&
      !client.manager_first_commission_collected
    ) {
      showToast("Отметьте менеджерские 10 000 ₽, если менеджер уже забрал", "info");
    }
  }

  async function handleQuickPay(item: PaymentScheduleItem) {
    if (!client) return;

    const amount = remainingAmount(item);
    if (amount <= 0) return;

    setPayingId(item.id);
    try {
      await paymentsApi.create({
        client_id: client.id,
        payment_schedule_id: item.id,
        amount: amount.toFixed(2),
        payment_date: effectiveDueDate(item),
        comment: `Оплата за ${item.month_number} месяц`,
      });
      await refreshClient();
      if (
        item.month_number === 1 &&
        isDetail(client) &&
        !client.manager_first_commission_collected
      ) {
        showToast("Отметьте менеджерские 10 000 ₽, если менеджер уже забрал", "info");
      }
    } finally {
      setPayingId(null);
    }
  }

  async function handleMandatoryPay(item: MandatoryPayment) {
    if (!client) return;
    const amount = mandatoryRemaining(item);
    if (amount <= 0) return;

    setMandatoryPayingId(item.id);
    try {
      await mandatoryPaymentsApi.record(client.id, item.id, {
        amount: amount.toFixed(2),
        payment_date: client.contract_date,
        comment: statusLabel(item.payment_type),
      });
      await refreshClient();
    } finally {
      setMandatoryPayingId(null);
    }
  }

  async function handleSavePlannedAmount(item: MandatoryPayment) {
    if (!client) return;
    const value = plannedEdits[item.id] ?? item.planned_amount;
    await mandatoryPaymentsApi.update(client.id, item.id, {
      planned_amount: Number(value).toFixed(2),
      is_applicable: true,
    });
    await refreshClient();
  }

  async function handleToggleCourtFee(item: MandatoryPayment, enabled: boolean) {
    if (!client) return;
    await mandatoryPaymentsApi.update(client.id, item.id, {
      is_applicable: enabled,
      planned_amount: enabled ? item.planned_amount : "0.00",
    });
    await refreshClient();
  }

  async function handleSavePhone() {
    if (!client) return;
    const phoneError = validatePhone(phoneValue);
    if (phoneError) {
      showToast(phoneError, "error");
      return;
    }
    setPhoneSaving(true);
    try {
      await clientsApi.update(client.id, { phone: phoneValue.trim() });
      setEditingPhone(false);
      await refreshClient();
      showToast("Телефон сохранён");
    } catch (error) {
      showToast(
        error instanceof ApiRequestError ? error.message : "Не удалось сохранить телефон",
        "error",
      );
    } finally {
      setPhoneSaving(false);
    }
  }

  async function handleSaveName() {
    if (!client) return;
    const nameError = validateFullName(nameValue);
    if (nameError) {
      showToast(nameError, "error");
      return;
    }
    setNameSaving(true);
    try {
      await clientsApi.update(client.id, { full_name: nameValue.trim().replace(/\s+/g, " ") });
      setEditingName(false);
      await refreshClient();
      showToast("ФИО сохранено");
    } catch (error) {
      showToast(
        error instanceof ApiRequestError ? error.message : "Не удалось сохранить ФИО",
        "error",
      );
    } finally {
      setNameSaving(false);
    }
  }

  async function handleSaveContractAmount() {
    if (!client || !isDetail(client) || !client.installment_plan) return;
    const amountError = validatePositiveAmount(contractAmountValue, { label: "Сумма договора" });
    if (amountError) {
      showToast(amountError, "error");
      return;
    }
    const newTotal = Number(contractAmountValue);
    const schedulePlanned = client.payment_schedule.reduce(
      (sum, item) => sum + Number(item.planned_amount),
      0,
    );
    if (schedulePlanned > 0) {
      const mismatch = formatScheduleMismatchMessage(newTotal, schedulePlanned);
      if (mismatch) {
        showToast(mismatch, "error");
        return;
      }
    }
    setContractAmountSaving(true);
    try {
      await installmentApi.update(client.id, client.installment_plan.id, {
        total_amount: Number(contractAmountValue).toFixed(2),
      });
      setEditingContractAmount(false);
      await refreshClient();
      showToast("Сумма договора сохранена");
    } catch (error) {
      showToast(
        error instanceof ApiRequestError ? error.message : "Не удалось сохранить сумму договора",
        "error",
      );
    } finally {
      setContractAmountSaving(false);
    }
  }

  function startDefer(item: PaymentScheduleItem) {
    setDeferringId(item.id);
    setDeferForm({
      deferred_until: item.deferred_until || item.due_date,
      comment: item.deferral_comment || "",
    });
  }

  async function handleDefer(item: PaymentScheduleItem) {
    if (!deferForm.comment.trim()) {
      showToast("Укажите причину отсрочки", "error");
      return;
    }
    setDeferringId(item.id);
    try {
      await scheduleApi.defer(item.id, {
        deferred_until: deferForm.deferred_until,
        comment: deferForm.comment.trim(),
      });
      setDeferringId(null);
      setDeferForm({ deferred_until: "", comment: "" });
      await refreshClient();
      showToast("Отсрочка сохранена");
    } catch (error) {
      showToast(
        error instanceof ApiRequestError ? error.message : "Не удалось оформить отсрочку",
        "error",
      );
    } finally {
      setDeferringId(null);
    }
  }

  function toggleNotePanel(item: PaymentScheduleItem) {
    if (notePanelId === item.id) {
      setNotePanelId(null);
      setNoteDraft("");
      return;
    }
    setNotePanelId(item.id);
    setNoteDraft(item.manager_note ?? "");
  }

  async function handleSaveNote(item: PaymentScheduleItem) {
    setNoteSavingId(item.id);
    const savedNote = noteDraft.trim() || null;
    try {
      await scheduleApi.updateNote(item.id, savedNote);
      setNoteDraft(savedNote ?? "");
      await refreshClient();
      showToast("Примечание сохранено");
    } catch (error) {
      showToast(
        error instanceof ApiRequestError ? error.message : "Не удалось сохранить примечание",
        "error",
      );
    } finally {
      setNoteSavingId(null);
    }
  }

  async function handleClearNote(item: PaymentScheduleItem) {
    setNoteSavingId(item.id);
    try {
      await scheduleApi.updateNote(item.id, null);
      setNotePanelId(null);
      setNoteDraft("");
      await refreshClient();
      showToast("Примечание удалено");
    } catch (error) {
      showToast(
        error instanceof ApiRequestError ? error.message : "Не удалось удалить примечание",
        "error",
      );
    } finally {
      setNoteSavingId(null);
    }
  }

  function scheduleEditValues(item: PaymentScheduleItem) {
    return getScheduleEditValues(item, scheduleDraft.edits);
  }

  function resetScheduleDraft() {
    setScheduleDraft(EMPTY_SCHEDULE_DRAFT);
    setScheduleError(null);
  }

  function handleAddPendingMonth() {
    const detailData = isDetail(client) ? client : null;
    const scheduleItems = detailData?.payment_schedule ?? [];
    const visible = scheduleItems.filter((item) => !scheduleDraft.pendingDeletes.includes(item.id));
    const lastExisting = visible[visible.length - 1];
    const lastAdd = scheduleDraft.pendingAdds[scheduleDraft.pendingAdds.length - 1];

    let due_date: string;
    let planned_amount: string;

    if (lastAdd) {
      due_date = addOneMonth(lastAdd.due_date);
      planned_amount = lastAdd.planned_amount;
    } else if (lastExisting) {
      const edited = getScheduleEditValues(lastExisting, scheduleDraft.edits);
      due_date = addOneMonth(edited.due_date);
      planned_amount = edited.planned_amount;
    } else if (detailData?.installment_plan) {
      due_date = detailData.installment_plan.start_date;
      planned_amount = "15000.00";
    } else if (client?.contract_date) {
      due_date = client.contract_date;
      planned_amount = "15000.00";
    } else {
      due_date = new Date().toISOString().slice(0, 10);
      planned_amount = "15000.00";
    }

    setScheduleDraft((current) => ({
      ...current,
      pendingAdds: [
        ...current.pendingAdds,
        {
          tempId: crypto.randomUUID(),
          planned_amount,
          due_date,
        },
      ],
    }));
  }

  function handleToggleScheduleDelete(id: string) {
    setScheduleDraft((current) => {
      const pendingDeletes = current.pendingDeletes.includes(id)
        ? current.pendingDeletes.filter((itemId) => itemId !== id)
        : [...current.pendingDeletes, id];
      const edits = { ...current.edits };
      delete edits[id];

      return {
        ...current,
        pendingDeletes,
        pendingWaives: current.pendingWaives.filter((itemId) => itemId !== id),
        edits,
      };
    });
  }

  function handleToggleScheduleWaive(id: string) {
    setScheduleDraft((current) => ({
      ...current,
      pendingWaives: current.pendingWaives.includes(id)
        ? current.pendingWaives.filter((itemId) => itemId !== id)
        : [...current.pendingWaives, id],
    }));
  }

  function handleRemovePendingAdd(tempId: string) {
    setScheduleDraft((current) => ({
      ...current,
      pendingAdds: current.pendingAdds.filter((item) => item.tempId !== tempId),
    }));
  }

  function updatePendingAdd(
    tempId: string,
    field: "planned_amount" | "due_date",
    value: string,
  ) {
    setScheduleDraft((current) => ({
      ...current,
      pendingAdds: current.pendingAdds.map((item) =>
        item.tempId === tempId ? { ...item, [field]: value } : item,
      ),
    }));
  }

  async function handleSaveScheduleDraft() {
    if (!client || !isDetail(client) || !client.installment_plan) return;

    const targetContractTotal = Number(client.installment_plan.total_amount);
    const draftPlannedTotal = computeScheduleDraftPlannedTotal(
      client.payment_schedule,
      scheduleDraft,
    );
    const visibleMonths =
      client.payment_schedule.filter((item) => !scheduleDraft.pendingDeletes.includes(item.id))
        .length + scheduleDraft.pendingAdds.length;

    if (targetContractTotal <= 0 && visibleMonths > 0) {
      const message = "Сначала укажите сумму договора, затем распишите её по месяцам";
      setScheduleError(message);
      showToast(message, "error");
      return;
    }

    if (targetContractTotal > 0 && visibleMonths > 0) {
      const mismatch = formatScheduleMismatchMessage(targetContractTotal, draftPlannedTotal);
      if (mismatch) {
        setScheduleError(mismatch);
        showToast(mismatch, "error");
        return;
      }
    }

    setScheduleSaving(true);
    setScheduleError(null);

    try {
      for (const id of scheduleDraft.pendingDeletes) {
        await scheduleApi.delete(id);
      }

      for (const item of client.payment_schedule) {
        if (scheduleDraft.pendingDeletes.includes(item.id)) {
          continue;
        }

        const values = getScheduleEditValues(item, scheduleDraft.edits);
        const payload: { planned_amount?: string; due_date?: string } = {};

        if (values.planned_amount !== item.planned_amount) {
          payload.planned_amount = Number(values.planned_amount).toFixed(2);
        }
        if (values.due_date !== item.due_date) {
          payload.due_date = values.due_date;
        }

        if (Object.keys(payload).length > 0) {
          await scheduleApi.update(item.id, payload);
        }
      }

      for (const add of scheduleDraft.pendingAdds) {
        if (!add.planned_amount || Number(add.planned_amount) <= 0) {
          throw new Error("Укажите сумму для каждого нового месяца");
        }

        await scheduleApi.addMonth(client.id, client.installment_plan.id, {
          planned_amount: Number(add.planned_amount).toFixed(2),
          due_date: add.due_date || undefined,
        });
      }

      for (const id of scheduleDraft.pendingWaives) {
        await scheduleApi.waiveOverdue(id);
      }

      resetScheduleDraft();
      await refreshClient();
      showToast("График платежей сохранён");
    } catch (error) {
      const message =
        error instanceof ApiRequestError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Не удалось сохранить график";
      setScheduleError(message);
      showToast(message, "error");
    } finally {
      setScheduleSaving(false);
    }
  }

  const isOwner = user?.role === "owner";
  const isManager = user?.role === "manager";
  const canEditClient = isOwner || isManager;
  const canEditSchedule = canEditClient;
  const canManageMandatory = isOwner;
  const canAssignManager = user?.role === "owner";
  const canRecordSchedulePayment = isOwner;
  const canRecordDocCollectionPayment = canEditClient;
  const canClaimClient =
    isManager &&
    !client?.assigned_manager_id &&
    client?.engagement_stage === "document_collection";

  const STATUS_OPTIONS: Array<{ value: ClientStatus; label: string }> = [
    { value: "active", label: "Активен" },
    { value: "completed", label: "Завершён" },
    { value: "defaulted", label: "Просрочен" },
    { value: "cancelled", label: "Отменён" },
  ];

  const PROCEDURE_OPTIONS: Array<{ value: ProcedureStage; label: string }> = [
    { value: "contract_signed", label: "Договор" },
    { value: "deposit", label: "Депозит" },
    { value: "financial_management", label: "Фин. управление" },
    { value: "court", label: "Суд" },
    { value: "completed", label: "Завершение" },
  ];

  const jumpToSection = useCallback((sectionId: string) => {
    if (sectionId === "section-schedule") {
      setScheduleOpen(true);
    }
    window.requestAnimationFrame(() => {
      const target = document.getElementById(sectionId);
      if (!target) {
        return;
      }
      const summary = target.querySelector<HTMLButtonElement>("button.collapsible-summary");
      if (summary?.getAttribute("aria-expanded") === "false") {
        summary.click();
      }
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const clientNavSections = useMemo(() => {
    if (!client || !isDetail(client)) {
      return [] as ClientNavSection[];
    }

    const detail = client;
    const isBankruptcy = client.engagement_stage === "bankruptcy";
    const docCollection = detail.document_collection ?? null;
    const sections: ClientNavSection[] = [];

    if (canRecordSchedulePayment && isBankruptcy) {
      sections.push({ id: "section-payment", label: "Платёж" });
    }
    if (canEditClient) {
      sections.push({ id: "section-client", label: "Данные" });
    }
    if (canEditClient && docCollection) {
      sections.push({ id: "section-doc", label: "Сбор документов" });
    }
    if (isBankruptcy && canEditClient && detail.installment_plan) {
      sections.push({ id: "section-contract", label: "Сумма договора" });
    }
    if (isBankruptcy) {
      if (isOwner) {
        sections.push({ id: "section-mandatory", label: "Обязательные" });
      }
      sections.push({ id: "section-schedule", label: "График" });
      sections.push({ id: "section-payments", label: "История" });
    }

    return sections;
  }, [client, canEditClient, canRecordSchedulePayment, isOwner]);

  async function handleClaimClient() {
    if (!client || !user) return;
    setCardSaving("claim");
    try {
      const updated = await clientsApi.update(client.id, { assigned_manager_id: user.id });
      setClient((current) => (current ? { ...current, ...updated } : current));
      showToast("Клиент закреплён за вами");
    } catch (error) {
      showToast(
        error instanceof ApiRequestError ? error.message : "Не удалось закрепить клиента",
        "error",
      );
    } finally {
      setCardSaving(null);
    }
  }

  async function handleCardUpdate(data: Record<string, unknown>, field: string) {
    if (!client) return;
    setCardSaving(field);
    try {
      const updated = await clientsApi.update(client.id, data);
      setClient((current) => (current ? { ...current, ...updated } : current));
    } catch (error) {
      showToast(
        error instanceof ApiRequestError ? error.message : "Не удалось сохранить изменения",
        "error",
      );
    } finally {
      setCardSaving(null);
    }
  }

  async function handleSaveDocCollectionAmounts() {
    if (!client || !isDetail(client) || !client.document_collection) return;
    setDocCollectionAmountsSaving(true);
    try {
      await documentCollectionApi.update(client.id, {
        collection_fee: Number(docCollectionAmountForm.collection_fee).toFixed(2),
        notary_fee: Number(docCollectionAmountForm.notary_fee).toFixed(2),
        manager_commission: Number(docCollectionAmountForm.manager_commission).toFixed(2),
      });
      setEditingDocCollectionAmounts(false);
      await refreshClient();
      showToast("Суммы сбора сохранены");
    } catch (error) {
      showToast(
        error instanceof ApiRequestError ? error.message : "Не удалось сохранить суммы сбора",
        "error",
      );
    } finally {
      setDocCollectionAmountsSaving(false);
    }
  }

  async function handleRecordDocumentCollection() {
    if (!client) return;
    setDocCollectionSaving(true);
    try {
      await documentCollectionApi.recordPayment(
        client.id,
        docCollectionPaymentDate || client.contract_date,
      );
      await refreshClient();
      showToast("Оплата сбора документов зафиксирована");
    } catch (error) {
      showToast(
        error instanceof ApiRequestError ? error.message : "Не удалось зафиксировать оплату",
        "error",
      );
    } finally {
      setDocCollectionSaving(false);
    }
  }

  async function handleConvertToBankruptcy(event: React.FormEvent) {
    event.preventDefault();
    if (!client) return;

    if (convertForm.auto_installment) {
      const debtError = validatePositiveAmount(convertForm.debt_amount, { label: "Сумма долга" });
      if (debtError) {
        setConvertError(debtError);
        return;
      }
    } else if (convertForm.contract_total.trim()) {
      const contractError = validatePositiveAmount(convertForm.contract_total, {
        label: "Сумма договора",
      });
      if (contractError) {
        setConvertError(contractError);
        return;
      }
    }

    setConvertSaving(true);
    setConvertError(null);
    const wasAutoInstallment = convertForm.auto_installment;
    try {
      const updated = await documentCollectionApi.convertToBankruptcy(client.id, {
        auto_installment: wasAutoInstallment,
        debt_amount: wasAutoInstallment ? convertForm.debt_amount : undefined,
        contract_total:
          !wasAutoInstallment && convertForm.contract_total.trim()
            ? convertForm.contract_total
            : undefined,
        contract_date: convertForm.contract_date || undefined,
      });
      setClient(updated);
      setConvertForm({
        auto_installment: false,
        debt_amount: "",
        contract_total: "",
        contract_date: "",
      });
      if (!wasAutoInstallment) {
        setScheduleOpen(true);
        showToast("Клиент переведён на банкротство. Составьте график вручную.", "info");
        window.requestAnimationFrame(() => jumpToSection("section-schedule"));
      } else {
        showToast("Клиент переведён на банкротство, график создан по тарифу");
      }
    } catch (error) {
      setConvertError(
        error instanceof ApiRequestError ? error.message : "Не удалось перевести на банкротство",
      );
    } finally {
      setConvertSaving(false);
    }
  }

  if (loading && !client) return <LoadingState text="Загрузка карточки..." />;
  if (!client) return <EmptyState>Клиент не найден</EmptyState>;

  const detail = isDetail(client) ? client : null;
  const isBankruptcy = client.engagement_stage === "bankruptcy";
  const docCollection = detail?.document_collection ?? null;
  const schedule = detail?.payment_schedule ?? [];
  const mandatory = detail?.mandatory_payments ?? [];
  const schedulePlannedTotal = schedule.reduce(
    (sum, item) => sum + Number(item.planned_amount),
    0,
  );
  const planTotal = detail?.installment_plan ? Number(detail.installment_plan.total_amount) : 0;
  const contractTotal = schedule.length > 0 ? schedulePlannedTotal : planTotal;
  const paidTotal = (detail?.payments ?? []).reduce((sum, payment) => {
    return sum + (payment.is_refund ? -Number(payment.amount) : Number(payment.amount));
  }, 0);
  const remainder = contractTotal - paidTotal;
  const collectedTotal = (detail?.payments ?? []).reduce((sum, payment) => {
    const signed = payment.is_refund ? -Number(payment.amount) : Number(payment.amount);
    return sum + signed;
  }, 0);
  const mandatoryPaidTotal = mandatory
    .filter((item) => item.is_applicable)
    .reduce((sum, item) => sum + Number(item.paid_amount), 0);
  const clientProfit = collectedTotal - mandatoryPaidTotal;
  const scheduleDraftDirty = canEditSchedule && isScheduleDraftDirty(scheduleDraft, schedule);
  const whatsappUrl = phoneToWhatsAppWebUrl(client.phone);
  const applicableMandatory = mandatory.filter((item) => item.is_applicable);
  const allMandatoryPaid =
    applicableMandatory.length > 0 &&
    applicableMandatory.every((item) => item.status === "paid");
  const overdueScheduleItems = schedule.filter((item) => item.status === "overdue");
  const nextDueItem = schedule
    .filter((item) => remainingAmount(item) > 0)
    .sort((a, b) => effectiveDueDate(a).localeCompare(effectiveDueDate(b)))[0];
  const scheduleNotesCount = schedule.filter((item) => item.manager_note?.trim()).length;
  const firstScheduleMonth = schedule.find((item) => item.month_number === 1);
  const firstMonthPaid = Boolean(firstScheduleMonth && Number(firstScheduleMonth.paid_amount) > 0);
  const managerCommissionCollected = Boolean(
    isDetail(client) && client.manager_first_commission_collected,
  );
  const showManagerCommission = isBankruptcy && firstMonthPaid && canRecordSchedulePayment;
  const scheduleHasActions = canRecordSchedulePayment || canEditSchedule;
  const scheduleTableColSpan = 6 + (scheduleHasActions ? 1 : 0);
  const planContractTotal = detail?.installment_plan ? Number(detail.installment_plan.total_amount) : 0;
  const isManualInstallment = detail?.installment_plan?.pricing_tier_id == null;
  const draftPlannedTotal = computeScheduleDraftPlannedTotal(schedule, scheduleDraft);
  const hasScheduleDraftRows =
    schedule.some((item) => !scheduleDraft.pendingDeletes.includes(item.id)) ||
    scheduleDraft.pendingAdds.length > 0;
  const scheduleMismatchMessage =
    planContractTotal > 0 && hasScheduleDraftRows
      ? formatScheduleMismatchMessage(planContractTotal, draftPlannedTotal)
      : planContractTotal <= 0 && hasScheduleDraftRows
        ? "Укажите сумму договора — иначе нельзя сохранить график"
        : "";

  function renderManagerCommissionCard() {
    if (!showManagerCommission) return null;

    return (
      <div
        className={cn(
          "mt-3 rounded-md border px-3 py-2",
          managerCommissionCollected
            ? "border-status-success-border bg-status-success-bg"
            : "border-status-warning-border bg-status-warning-bg",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Менеджерские {formatMoney(MANAGER_FIRST_COMMISSION)}
            </p>
            <p className="text-xs text-muted">
              С первого платежа клиента ({formatMoney(firstScheduleMonth?.planned_amount ?? 0)}).
              {managerCommissionCollected
                ? isDetail(client) && client.manager_first_commission_collected_by_name
                  ? ` Отметил ${client.manager_first_commission_collected_by_name}.`
                  : " Выдано."
                : " Отметьте, если менеджер уже забрал."}
            </p>
          </div>
          <Button
            type="button"
            variant={managerCommissionCollected ? "secondary" : "primary"}
            disabled={commissionSaving}
            onClick={() => handleToggleManagerCommission(!managerCommissionCollected)}
          >
            {commissionSaving
              ? "Сохранение…"
              : managerCommissionCollected
                ? "Снять отметку"
                : "Менеджер забрал 10 000 ₽"}
          </Button>
        </div>
      </div>
    );
  }

  function renderManualPaymentForm() {
    if (!canRecordSchedulePayment || !detail || !isBankruptcy) {
      return null;
    }

    return (
      <Card
        id="section-payment"
        variant="accent"
        className={cn(CLIENT_SECTION_CLASS, "border-t-4 border-t-emerald-500")}
      >
        <SectionTitle
          title="Зафиксировать платёж"
          description="Дата по умолчанию — дата договора или выбранного месяца графика. Указывайте месяц, когда клиент реально платил."
        />
        <form onSubmit={handlePayment} className="grid gap-2 md:grid-cols-2">
          <FormField label="Месяц графика">
            <Select
              value={paymentForm.payment_schedule_id}
              onChange={(e) => handleMonthSelect(e.target.value)}
            >
              <option value="">Автораспределение по графику</option>
              {schedule.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.month_number} — {formatDate(item.due_date)} (
                  {formatMoney(item.planned_amount)}, остаток{" "}
                  {formatMoney(remainingAmount(item))})
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Дата платежа">
            <Input
              type="date"
              value={paymentForm.payment_date}
              onChange={(e) =>
                setPaymentForm({ ...paymentForm, payment_date: e.target.value })
              }
              required
            />
          </FormField>
          <FormField label="Сумма">
            <Input
              inputMode="decimal"
              placeholder="Сумма"
              value={paymentForm.amount}
              onChange={(e) =>
                setPaymentForm({ ...paymentForm, amount: filterDecimalInput(e.target.value) })
              }
              required
            />
          </FormField>
          <Input
            placeholder="Комментарий"
            value={paymentForm.comment}
            onChange={(e) => setPaymentForm({ ...paymentForm, comment: e.target.value })}
          />
          <Button type="submit" className="md:col-span-2">
            Сохранить платёж
          </Button>
        </form>
        {renderManagerCommissionCard()}
      </Card>
    );
  }

  return (
    <div className="page-stack">
      {toast && (
        <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />
      )}
      <PageHeader
        title={formatShortName(client.full_name)}
        subtitle={`${statusLabel(client.status)} · ${engagementStageLabel(client.engagement_stage)}`}
        back={<BackLink href="/clients">К списку клиентов</BackLink>}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {whatsappUrl ? (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="interactive inline-flex items-center justify-center rounded-md bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white shadow-soft hover:bg-[#20bd5a]"
              >
                WhatsApp
              </a>
            ) : null}
            {isOwner && (
              <Button
                variant="danger"
                disabled={deletingClient}
                onClick={handleDeleteClient}
              >
                {deletingClient ? "Удаление..." : "Удалить клиента"}
              </Button>
            )}
            {user?.role !== "call_center" && (
              <Button
                variant="secondary"
                disabled={exporting}
                onClick={async () => {
                  setExporting(true);
                  try {
                    await exportsApi.clientDetail(params.id);
                  } catch (error) {
                    showToast(
                      error instanceof ApiRequestError
                        ? error.message
                        : "Не удалось выгрузить Excel",
                      "error",
                    );
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                {exporting ? "Выгрузка..." : "Excel"}
              </Button>
            )}
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
        }
      />

      {(detail && isBankruptcy) || clientNavSections.length > 0 ? (
        <div className="sticky top-0 z-10 -mx-page-x border-b border-border bg-surface/95 px-page-x py-2 shadow-soft backdrop-blur lg:-mx-3">
          {detail && isBankruptcy ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground">
              <span>
                <span className="text-muted">Договор:</span>{" "}
                <strong>{formatMoney(contractTotal)}</strong>
              </span>
              <span>
                <span className="text-muted">Остаток:</span>{" "}
                <strong
                  className={
                    remainder > 0 ? "text-status-warning-text" : "text-status-success-text"
                  }
                >
                  {formatMoney(remainder)}
                </strong>
              </span>
              {nextDueItem ? (
                <span>
                  <span className="text-muted">След. платёж:</span>{" "}
                  <strong>
                    {formatDate(effectiveDueDate(nextDueItem))} ·{" "}
                    {formatMoney(remainingAmount(nextDueItem))}
                  </strong>
                </span>
              ) : null}
              {showManagerCommission ? (
                <span>
                  <span className="text-muted">Менеджерские:</span>{" "}
                  <strong
                    className={
                      managerCommissionCollected
                        ? "text-status-success-text"
                        : "text-status-warning-text"
                    }
                  >
                    {managerCommissionCollected ? "выдано" : "10 000 ₽ не отмечено"}
                  </strong>
                </span>
              ) : null}
              {overdueScheduleItems.length > 0 ? (
                <Badge tone="danger">Просрочка: {overdueScheduleItems.length} мес.</Badge>
              ) : null}
            </div>
          ) : null}
          {clientNavSections.length > 0 ? (
            <nav
              className={cn("client-section-nav", detail && isBankruptcy && "mt-2")}
              aria-label="Разделы карточки клиента"
            >
              {clientNavSections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className="client-section-nav-btn"
                  onClick={() => jumpToSection(section.id)}
                >
                  {section.label}
                </button>
              ))}
            </nav>
          ) : null}
        </div>
      ) : null}

      {renderManualPaymentForm()}

      {canClaimClient && (
        <Card variant="accent">
          <SectionTitle
            title="Клиент не закреплён"
            description="Нераспределённые клиенты с этапа сбора можно принять в работу"
          />
          <Button
            type="button"
            disabled={cardSaving === "claim"}
            onClick={handleClaimClient}
          >
            {cardSaving === "claim" ? "Закрепление..." : "Принять в работу"}
          </Button>
        </Card>
      )}

      {canEditClient && (
        <Card
          id="section-client"
          className={cn(CLIENT_SECTION_CLASS, "border-t-4 border-t-brand-600")}
        >
          <SectionTitle
            title="Данные клиента"
            description={client.phone}
          />
          <div className="space-y-4">
            {isOwner && (
              <div>
                <p className="mb-1 text-xs text-muted">ФИО</p>
                {editingName ? (
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[280px] flex-1">
                      <Input
                        value={nameValue}
                        onChange={(e) => setNameValue(filterPersonName(e.target.value))}
                        placeholder="Фамилия Имя Отчество"
                      />
                    </div>
                    <Button type="button" disabled={nameSaving} onClick={handleSaveName}>
                      {nameSaving ? "Сохранение..." : "Сохранить"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setEditingName(false);
                        setNameValue(client.full_name);
                      }}
                    >
                      Отмена
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="field-value">{client.full_name}</p>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setNameValue(client.full_name);
                        setEditingName(true);
                      }}
                    >
                      Изменить ФИО
                    </Button>
                  </div>
                )}
              </div>
            )}

            {!isOwner && <p className="field-value">{client.full_name}</p>}

            <div>
              <p className="mb-1 text-xs text-muted">Телефон</p>
              {editingPhone ? (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[220px] flex-1">
                    <PhoneInput value={phoneValue} onValueChange={setPhoneValue} />
                  </div>
                  <Button type="button" disabled={phoneSaving} onClick={handleSavePhone}>
                    {phoneSaving ? "Сохранение..." : "Сохранить"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setEditingPhone(false);
                      setPhoneValue(client.phone);
                    }}
                  >
                    Отмена
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="field-value">{client.phone}</p>
                    {whatsappUrl ? (
                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-[#128C7E] hover:underline"
                      >
                        Открыть WhatsApp
                      </a>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setPhoneValue(ensurePhonePrefix(client.phone));
                      setEditingPhone(true);
                    }}
                  >
                    Изменить номер
                  </Button>
                </div>
              )}
            </div>

            {isDetail(client) && (
              <>
                <div>
                  <Badge tone={isBankruptcy ? "success" : "warning"}>
                    {engagementStageLabel(client.engagement_stage)}
                  </Badge>
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  <FormField label="Дата договора (1-й месяц графика)">
                    <Input
                      type="date"
                      value={client.contract_date}
                      disabled={cardSaving === "contract_date"}
                      onChange={(e) =>
                        handleCardUpdate({ contract_date: e.target.value }, "contract_date")
                      }
                    />
                  </FormField>
                  <FormField label="Статус клиента">
                    <Select
                      value={client.status}
                      disabled={cardSaving === "status"}
                      onChange={(e) => handleCardUpdate({ status: e.target.value }, "status")}
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  {isBankruptcy && isOwner && (
                    <FormField label="Этап процедуры">
                      <Select
                        value={client.procedure_stage}
                        disabled={cardSaving === "procedure_stage"}
                        onChange={(e) =>
                          handleCardUpdate({ procedure_stage: e.target.value }, "procedure_stage")
                        }
                      >
                        {PROCEDURE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  )}
                  {canAssignManager && (
                    <FormField label="Ответственный менеджер">
                      <Select
                        value={client.assigned_manager_id ?? ""}
                        disabled={cardSaving === "manager"}
                        onChange={(e) =>
                          handleCardUpdate(
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
                    </FormField>
                  )}
                </div>
              </>
            )}
          </div>
        </Card>
      )}

      {canEditClient && isDetail(client) && docCollection && (
        <Card
          id="section-doc"
          variant="accent"
          className={cn(CLIENT_SECTION_CLASS, "border-t-4 border-t-amber-500")}
        >
          <SectionTitle
            title="Сбор документов"
            description={
              isBankruptcy
                ? `История сбора: ${formatMoney(docCollection.total_amount)} (${formatMoney(docCollection.collection_fee)} в кассу + ${formatMoney(docCollection.notary_fee)} нотариус + ${formatMoney(docCollection.manager_commission)} менеджеру). Выписки/госпошлина учитываются отдельно`
                : `Единоразовая оплата ${formatMoney(docCollection.total_amount)}: сбор ${formatMoney(docCollection.collection_fee)} + нотариус ${formatMoney(docCollection.notary_fee)} + менеджеру ${formatMoney(docCollection.manager_commission)}`
            }
          />
          {!isBankruptcy && docCollection.status === "pending" && editingDocCollectionAmounts ? (
            <div className="page-stack">
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                <FormField label="В кассу, ₽">
                  <Input
                    type="number"
                    min={0}
                    step={100}
                    value={docCollectionAmountForm.collection_fee}
                    onChange={(e) =>
                      setDocCollectionAmountForm({
                        ...docCollectionAmountForm,
                        collection_fee: e.target.value,
                      })
                    }
                  />
                </FormField>
                <FormField label="Нотариус, ₽">
                  <Input
                    type="number"
                    min={0}
                    step={100}
                    value={docCollectionAmountForm.notary_fee}
                    onChange={(e) =>
                      setDocCollectionAmountForm({
                        ...docCollectionAmountForm,
                        notary_fee: e.target.value,
                      })
                    }
                  />
                </FormField>
                <FormField label="Комиссия менеджера, ₽">
                  <Input
                    type="number"
                    min={0}
                    step={100}
                    value={docCollectionAmountForm.manager_commission}
                    onChange={(e) =>
                      setDocCollectionAmountForm({
                        ...docCollectionAmountForm,
                        manager_commission: e.target.value,
                      })
                    }
                  />
                </FormField>
                <FormField label="Итого к оплате">
                  <p className="rounded-md border border-slate-200 bg-white px-3 py-2 field-value">
                    {formatMoney(
                      Number(docCollectionAmountForm.collection_fee || 0) +
                        Number(docCollectionAmountForm.notary_fee || 0) +
                        Number(docCollectionAmountForm.manager_commission || 0),
                    )}
                  </p>
                </FormField>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  disabled={docCollectionAmountsSaving}
                  onClick={handleSaveDocCollectionAmounts}
                >
                  {docCollectionAmountsSaving ? "Сохранение..." : "Сохранить суммы"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setEditingDocCollectionAmounts(false);
                    setDocCollectionAmountForm({
                      collection_fee: docCollection.collection_fee,
                      notary_fee: docCollection.notary_fee,
                      manager_commission: docCollection.manager_commission,
                    });
                  }}
                >
                  Отмена
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                <StatCard label="К оплате" value={formatMoney(docCollection.total_amount)} tone="brand" />
                <StatCard label="В кассу" value={formatMoney(docCollection.collection_fee)} tone="default" />
                <StatCard label="Нотариус" value={formatMoney(docCollection.notary_fee)} tone="default" />
                <StatCard
                  label="Комиссия менеджера"
                  value={formatMoney(docCollection.manager_commission)}
                  tone="success"
                />
              </div>
              {!isBankruptcy && docCollection.status === "pending" && (
                <div className="mt-4">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setDocCollectionAmountForm({
                        collection_fee: docCollection.collection_fee,
                        notary_fee: docCollection.notary_fee,
                        manager_commission: docCollection.manager_commission,
                      });
                      setEditingDocCollectionAmounts(true);
                    }}
                  >
                    Изменить суммы сбора
                  </Button>
                </div>
              )}
            </>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Badge tone={docCollection.status === "paid" ? "success" : "warning"}>
              {documentCollectionStatusLabel(docCollection.status)}
            </Badge>
            {docCollection.paid_date && (
              <span className="text-sm text-slate-600">
                Оплачено {formatDate(docCollection.paid_date)}
              </span>
            )}
            {isBankruptcy && (
              <Badge tone="success">Переведён на банкротство</Badge>
            )}
          </div>
          {!isBankruptcy && canRecordDocCollectionPayment && docCollection.status !== "paid" && (
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <FormField label="Дата оплаты сбора">
                <Input
                  type="date"
                  value={docCollectionPaymentDate}
                  onChange={(e) => setDocCollectionPaymentDate(e.target.value)}
                  required
                />
              </FormField>
              <Button disabled={docCollectionSaving} onClick={handleRecordDocumentCollection}>
                {docCollectionSaving
                  ? "Сохранение..."
                  : `Зафиксировать оплату ${formatMoney(docCollection.total_amount)}`}
              </Button>
            </div>
          )}
          {!isBankruptcy && canRecordDocCollectionPayment && docCollection.status === "paid" && (
            <form onSubmit={handleConvertToBankruptcy} className="mt-3 space-y-3 border-t border-border pt-3">
              <SectionTitle
                title="Перевести на банкротство"
                description={
                  convertForm.auto_installment
                    ? "График создаётся автоматически по тарифу из суммы долга"
                    : "Составьте индивидуальный график вручную: сумма договора и помесячные платежи"
                }
              />
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={convertForm.auto_installment}
                  onChange={(e) =>
                    setConvertForm({
                      ...convertForm,
                      auto_installment: e.target.checked,
                    })
                  }
                />
                Автоматическая рассрочка
              </label>
              {convertForm.auto_installment ? (
                <div className="grid gap-2 md:grid-cols-2">
                  <FormField label="Сумма долга для подбора тарифа (от 300 000 ₽)">
                    <Input
                      inputMode="decimal"
                      placeholder="300000"
                      value={convertForm.debt_amount}
                      onChange={(e) =>
                        setConvertForm({
                          ...convertForm,
                          debt_amount: filterDecimalInput(e.target.value),
                        })
                      }
                      required
                    />
                  </FormField>
                  <FormField label="Дата первого платежа / договора">
                    <Input
                      type="date"
                      value={convertForm.contract_date}
                      onChange={(e) =>
                        setConvertForm({ ...convertForm, contract_date: e.target.value })
                      }
                    />
                  </FormField>
                </div>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  <FormField label="Сумма договора (можно задать позже)">
                    <Input
                      inputMode="decimal"
                      placeholder="350000"
                      value={convertForm.contract_total}
                      onChange={(e) =>
                        setConvertForm({
                          ...convertForm,
                          contract_total: filterDecimalInput(e.target.value),
                        })
                      }
                    />
                  </FormField>
                  <FormField label="Дата первого платежа / договора">
                    <Input
                      type="date"
                      value={convertForm.contract_date}
                      onChange={(e) =>
                        setConvertForm({ ...convertForm, contract_date: e.target.value })
                      }
                      required
                    />
                  </FormField>
                </div>
              )}
              {convertError && <p className="text-sm text-rose-600">{convertError}</p>}
              <Button type="submit" disabled={convertSaving}>
                {convertSaving ? "Перевод..." : "Перевести на банкротство"}
              </Button>
            </form>
          )}
        </Card>
      )}

      {detail && !isBankruptcy && (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Дата договора" value={formatDate(client.contract_date)} tone="brand" />
          <StatCard label="Статус" value={statusLabel(client.status)} tone="default" />
          <StatCard
            label="Услуга"
            value={engagementStageLabel(client.engagement_stage)}
            tone="warning"
          />
        </div>
      )}

      {detail && isBankruptcy && isOwner && (
        <Card className="border-t-4 border-t-slate-300 opacity-95">
          <SectionTitle
            title="Прибыль по клиенту"
            description="Получено по платежам минус обязательные расходы"
          />
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Получено" value={formatMoney(collectedTotal)} tone="success" />
            <StatCard
              label="Обязательные расходы"
              value={formatMoney(mandatoryPaidTotal)}
              tone="warning"
            />
            <StatCard
              label="Прибыль"
              value={formatMoney(clientProfit)}
              tone={clientProfit >= 0 ? "success" : "danger"}
            />
            <StatCard
              label="Остаток по договору"
              value={formatMoney(remainder)}
              tone={remainder > 0 ? "warning" : "success"}
            />
          </div>
        </Card>
      )}

      {detail && isBankruptcy && canEditClient && detail.installment_plan && (
        <Card
          id="section-contract"
          className={cn(CLIENT_SECTION_CLASS, "border-t-4 border-t-violet-600")}
        >
          <SectionTitle
            title="Сумма договора"
            description={
              isManualInstallment
                ? "Задайте общую сумму, затем распишите её по месяцам в графике — суммы должны совпасть"
                : "Можно задать вручную — сумма синхронизируется с графиком платежей"
            }
          />
          {isManualInstallment && planContractTotal > 0 && hasScheduleDraftRows ? (
            <p
              className={
                scheduleMismatchMessage
                  ? "mb-3 rounded-md border border-status-danger-border bg-status-danger-bg px-3 py-2 text-xs text-status-danger-text"
                  : "mb-3 rounded-md border border-status-success-border bg-status-success-bg px-3 py-2 text-xs text-status-success-text"
              }
            >
              {scheduleMismatchMessage ||
                `График совпадает с договором: ${formatMoney(planContractTotal)}`}
            </p>
          ) : null}
          {editingContractAmount ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px]">
                <FormField label="Сумма договора, ₽">
                  <Input
                    type="number"
                    min={0}
                    step={1000}
                    value={contractAmountValue}
                    onChange={(e) => setContractAmountValue(e.target.value)}
                  />
                </FormField>
              </div>
              <Button
                type="button"
                disabled={contractAmountSaving}
                onClick={handleSaveContractAmount}
              >
                {contractAmountSaving ? "Сохранение..." : "Сохранить"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEditingContractAmount(false);
                  setContractAmountValue(String(contractTotal));
                }}
              >
                Отмена
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-lg font-bold text-slate-900">{formatMoney(contractTotal)}</p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setContractAmountValue(String(contractTotal));
                  setEditingContractAmount(true);
                }}
              >
                Изменить сумму договора
              </Button>
            </div>
          )}
        </Card>
      )}

      {detail && isBankruptcy && (
        <>
          {detail.matched_tier && (
            <CollapsibleCard
              id="section-tariff"
              className={cn(CLIENT_SECTION_CLASS, "border-t-4 border-t-slate-300")}
              title="Подобранный тариф"
              description="Справочные данные тарифа — раскройте при необходимости"
              defaultOpen={false}
            >
              <div className="grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="text-slate-500">Диапазон долга</p>
                  <p className="mt-1 font-medium text-slate-900">
                    {formatMoney(detail.matched_tier.min_amount)} –{" "}
                    {formatMoney(detail.matched_tier.max_amount)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Стоимость по тарифу (справочно)</p>
                  <p className="mt-1 font-medium text-slate-900">
                    {formatMoney(detail.matched_tier.total_cost)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Фактическая сумма договора</p>
                  <p className="mt-1 font-medium text-slate-900">{formatMoney(contractTotal)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Срок</p>
                  <p className="mt-1 font-medium text-slate-900">
                    {detail.matched_tier.total_months} мес.
                  </p>
                </div>
              </div>
              {detail.installment_plan && (
                <p className="mt-3 text-xs text-slate-500">
                  График с {formatDate(detail.installment_plan.start_date)}. Для старых клиентов
                  суммы месяцев можно менять вручную — тариф только отправная точка.
                </p>
              )}
            </CollapsibleCard>
          )}

          <CollapsibleCard
            id="section-mandatory"
            className={cn(CLIENT_SECTION_CLASS, "border-t-4 border-t-orange-500")}
            title="Обязательные платежи по процедуре"
            description="Депозит, финансовое управление и судебная пошлина — только для руководителя"
            defaultOpen={!allMandatoryPaid}
            badge={
              allMandatoryPaid ? (
                <Badge tone="success">Все оплачены</Badge>
              ) : (
                <Badge tone="warning">{applicableMandatory.length} шт.</Badge>
              )
            }
          >
            {mandatory.length === 0 ? (
              <EmptyState>Данные не сформированы</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Платёж</th>
                      <th>План</th>
                      <th>Оплачено</th>
                      <th>Остаток</th>
                      <th>Статус</th>
                      {canManageMandatory && <th>Действие</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {mandatory.map((item) => {
                      const rest = mandatoryRemaining(item);
                      const needsAmount =
                        item.is_applicable &&
                        Number(item.planned_amount) <= 0 &&
                        item.payment_type !== "deposit";
                      const plannedValue = plannedEdits[item.id] ?? item.planned_amount;

                      return (
                        <tr key={item.id}>
                          <td>
                            <p className="font-medium text-slate-900">
                              {statusLabel(item.payment_type)}
                            </p>
                            <p className="text-xs text-slate-500">
                              {mandatoryTypeHint(item.payment_type)}
                            </p>
                          </td>
                          <td>
                            {item.payment_type === "court_fee" && !item.is_applicable ? (
                              <span className="text-slate-400">Не требуется</span>
                            ) : needsAmount && canManageMandatory ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min={1}
                                  step={1}
                                  className="max-w-[120px]"
                                  value={plannedValue}
                                  onChange={(e) =>
                                    setPlannedEdits({
                                      ...plannedEdits,
                                      [item.id]: e.target.value,
                                    })
                                  }
                                />
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() => handleSavePlannedAmount(item)}
                                >
                                  OK
                                </Button>
                              </div>
                            ) : (
                              formatMoney(item.planned_amount)
                            )}
                          </td>
                          <td>{formatMoney(item.paid_amount)}</td>
                          <td>
                            {item.is_applicable ? formatMoney(rest) : "—"}
                          </td>
                          <td>
                            <Badge tone={scheduleTone(item.status)}>
                              {statusLabel(item.status)}
                            </Badge>
                          </td>
                          {canManageMandatory && (
                            <td>
                              {item.payment_type === "court_fee" && (
                                <label className="mb-2 flex items-center gap-2 text-xs text-slate-600">
                                  <input
                                    type="checkbox"
                                    checked={item.is_applicable}
                                    onChange={(e) =>
                                      handleToggleCourtFee(item, e.target.checked)
                                    }
                                  />
                                  Пошлина нужна
                                </label>
                              )}
                              {item.is_applicable && rest > 0 && Number(item.planned_amount) > 0 ? (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  disabled={mandatoryPayingId === item.id}
                                  onClick={() => handleMandatoryPay(item)}
                                >
                                  {mandatoryPayingId === item.id
                                    ? "Сохранение..."
                                    : "Внести платёж"}
                                </Button>
                              ) : item.is_applicable && item.status === "paid" ? (
                                <span className="text-xs text-emerald-600">Оплачено</span>
                              ) : null}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CollapsibleCard>

          <CollapsibleCard
            id="section-schedule"
            className={cn(CLIENT_SECTION_CLASS, "border-t-4 border-t-brand-600")}
            title="График платежей"
            description={
              canEditSchedule
                ? isManualInstallment
                  ? "Индивидуальный график: добавьте месяцы и суммы, итог должен совпасть с суммой договора"
                  : "1-й месяц = дата договора, дальше по месяцам. Раскройте, чтобы изменить суммы или добавить месяцы"
                : "Раскройте, чтобы посмотреть помесячный график"
            }
            badge={
              <>
                {schedule.length > 0 ? (
                  <Badge tone="default">{schedule.length} мес.</Badge>
                ) : (
                  <Badge tone="warning">Не настроен</Badge>
                )}
                {scheduleNotesCount > 0 ? (
                  <Badge tone="warning">{scheduleNotesCount} прим.</Badge>
                ) : null}
              </>
            }
            open={scheduleOpen}
            onOpenChange={setScheduleOpen}
          >
            {canEditSchedule && detail?.installment_plan ? (
              <div className="mb-2 flex justify-end">
                <Button type="button" variant="secondary" onClick={handleAddPendingMonth}>
                  + Добавить месяц
                </Button>
              </div>
            ) : null}
            {refreshing && (
              <p className="mb-2 text-xs text-muted">Обновление данных...</p>
            )}
            {scheduleError && (
              <p className="mb-2 alert-danger">
                {scheduleError}
              </p>
            )}
            {canEditSchedule && hasScheduleDraftRows ? (
              <div
                className={
                  scheduleMismatchMessage
                    ? "mb-2 rounded-md border border-status-danger-border bg-status-danger-bg px-3 py-2 text-xs text-status-danger-text"
                    : "mb-2 rounded-md border border-status-success-border bg-status-success-bg px-3 py-2 text-xs text-status-success-text"
                }
              >
                <p>
                  <span className="text-muted">Сумма договора:</span>{" "}
                  <strong>{planContractTotal > 0 ? formatMoney(planContractTotal) : "не задана"}</strong>
                  {" · "}
                  <span className="text-muted">По графику:</span>{" "}
                  <strong>{formatMoney(draftPlannedTotal)}</strong>
                </p>
                {scheduleMismatchMessage ? (
                  <p className="mt-1 font-medium">{scheduleMismatchMessage}</p>
                ) : planContractTotal > 0 ? (
                  <p className="mt-1">Суммы совпадают — можно сохранить график</p>
                ) : null}
              </div>
            ) : null}
            {schedule.length === 0 && scheduleDraft.pendingAdds.length === 0 ? (
              <EmptyState>
                {canEditSchedule
                  ? "График не сформирован. Нажмите «+ Добавить месяц»."
                  : "График не сформирован"}
              </EmptyState>
            ) : (
              <>
                <div className="overflow-x-auto">
                <table className="data-table text-xs">
                  <thead>
                    <tr>
                      <th className="w-8">#</th>
                      <th>Дата</th>
                      <th className="w-[76px] text-right">План</th>
                      <th className="w-[76px] text-right">Опл./ост.</th>
                      <th className="w-24">Статус</th>
                      <th className="min-w-[140px]">Примечание</th>
                      {scheduleHasActions && <th className="w-32">Действия</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((item) => {
                      const rest = remainingAmount(item);
                      const editValues = scheduleEditValues(item);
                      const markedForDelete = scheduleDraft.pendingDeletes.includes(item.id);
                      const markedForWaive = scheduleDraft.pendingWaives.includes(item.id);
                      const rowChanged =
                        editValues.planned_amount !== item.planned_amount ||
                        editValues.due_date !== item.due_date;
                      const noteText = item.manager_note?.trim() ?? "";

                      return (
                        <Fragment key={item.id}>
                        <tr
                          className={cn(
                            markedForDelete && "bg-slate-50 opacity-60",
                            item.month_number === 1 &&
                              firstMonthPaid &&
                              (managerCommissionCollected
                                ? "bg-status-success-bg/60 hover:bg-status-success-bg"
                                : "bg-status-warning-bg/40 hover:bg-status-warning-bg/50"),
                          )}
                        >
                          <td className="tabular-nums text-muted">
                            {item.month_number}
                            {rowChanged && (
                              <span className="ml-0.5 text-brand-600" title="Изменён">*</span>
                            )}
                          </td>
                          <td>
                            {canEditSchedule && !markedForDelete ? (
                              <Input
                                type="date"
                                className="max-w-[118px] py-0.5"
                                value={editValues.due_date}
                                onChange={(e) =>
                                  setScheduleDraft((current) => ({
                                    ...current,
                                    edits: {
                                      ...current.edits,
                                      [item.id]: {
                                        ...editValues,
                                        due_date: e.target.value,
                                      },
                                    },
                                  }))
                                }
                              />
                            ) : (
                              <div className="leading-tight">
                                <p>{formatDate(effectiveDueDate(item))}</p>
                                {item.deferred_until && (
                                  <p className="text-[10px] text-amber-600">
                                    было {formatDate(item.due_date)}
                                  </p>
                                )}
                                {item.deferral_comment && (
                                  <p className="mt-0.5 line-clamp-2 text-[10px] text-amber-700" title={item.deferral_comment}>
                                    {item.deferral_comment}
                                  </p>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="text-right">
                            {canEditSchedule && !markedForDelete ? (
                              <Input
                                type="number"
                                min={Math.max(1, Math.round(Number(item.paid_amount) || 0))}
                                step={1}
                                className="w-[72px] py-0.5 text-right tabular-nums"
                                value={formatAmountInput(editValues.planned_amount)}
                                onChange={(e) =>
                                  setScheduleDraft((current) => ({
                                    ...current,
                                    edits: {
                                      ...current.edits,
                                      [item.id]: {
                                        ...editValues,
                                        planned_amount: e.target.value,
                                      },
                                    },
                                  }))
                                }
                              />
                            ) : (
                              <span className="whitespace-nowrap tabular-nums">
                                {formatMoney(item.planned_amount)}
                              </span>
                            )}
                          </td>
                          <td className="text-right tabular-nums leading-tight">
                            <p className="whitespace-nowrap">{formatMoney(item.paid_amount)}</p>
                            <p className={cn("whitespace-nowrap", rest > 0 ? "text-muted" : "text-status-success-text")}>
                              {formatMoney(rest)}
                            </p>
                          </td>
                          <td>
                            <Badge tone={scheduleTone(item.status)}>
                              {statusLabel(item.status)}
                            </Badge>
                            {(item.overdue_waived || markedForWaive) && (
                              <p className="mt-0.5 text-[10px] text-muted">
                                {markedForWaive ? "Снятие проср." : "Проср. снята"}
                              </p>
                            )}
                            {item.deferred_until && !item.deferral_comment && (
                              <p className="mt-0.5 text-[10px] text-amber-600">
                                до {formatDate(item.deferred_until)}
                              </p>
                            )}
                            {item.month_number === 1 && firstMonthPaid && canRecordSchedulePayment && (
                              <p
                                className={cn(
                                  "mt-0.5 text-[10px] font-medium",
                                  managerCommissionCollected
                                    ? "text-status-success-text"
                                    : "text-status-warning-text",
                                )}
                              >
                                {managerCommissionCollected
                                  ? "10 000 ₽ менеджеру выдано"
                                  : "10 000 ₽ менеджеру не отмечено"}
                              </p>
                            )}
                          </td>
                          <td>
                            {canEditClient ? (
                              <button
                                type="button"
                                className={cn(
                                  "interactive w-full rounded px-1 py-0.5 text-left leading-snug",
                                  noteText
                                    ? "text-slate-700 hover:bg-surface-muted"
                                    : "text-muted hover:bg-surface-muted hover:text-foreground",
                                  notePanelId === item.id && "bg-brand-50 ring-1 ring-brand-200",
                                )}
                                title={noteText || "Добавить примечание"}
                                onClick={() => toggleNotePanel(item)}
                              >
                                {noteText ? (
                                  <span className="line-clamp-2 whitespace-pre-wrap">{noteText}</span>
                                ) : (
                                  <span className="italic">+ примечание</span>
                                )}
                              </button>
                            ) : noteText ? (
                              <p className="line-clamp-2 whitespace-pre-wrap leading-snug text-slate-700" title={noteText}>
                                {noteText}
                              </p>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          {scheduleHasActions && (
                            <td>
                              <div className="flex flex-wrap items-center gap-1">
                                {canRecordSchedulePayment && rest > 0 && !markedForDelete ? (
                                  deferringId === item.id ? (
                                    <div className="w-full space-y-1 rounded border border-border bg-surface-muted p-1.5">
                                      <Input
                                        type="date"
                                        className="py-0.5"
                                        value={deferForm.deferred_until}
                                        onChange={(e) =>
                                          setDeferForm({
                                            ...deferForm,
                                            deferred_until: e.target.value,
                                          })
                                        }
                                      />
                                      <Input
                                        placeholder="Причина"
                                        className="py-0.5"
                                        value={deferForm.comment}
                                        onChange={(e) =>
                                          setDeferForm({ ...deferForm, comment: e.target.value })
                                        }
                                      />
                                      <div className="flex gap-1">
                                        <Button type="button" className="px-1.5 py-0.5" onClick={() => handleDefer(item)}>
                                          OK
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          className="px-1.5 py-0.5"
                                          onClick={() => setDeferringId(null)}
                                        >
                                          ×
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        className="px-1.5 py-0.5"
                                        disabled={payingId === item.id}
                                        onClick={() => handleQuickPay(item)}
                                      >
                                        {payingId === item.id ? "…" : "Оплатить"}
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        className="px-1 py-0.5"
                                        onClick={() => startDefer(item)}
                                      >
                                        Отср.
                                      </Button>
                                    </>
                                  )
                                ) : canRecordSchedulePayment ? (
                                  <span className="text-[10px] text-muted">
                                    {markedForDelete ? "К удалению" : "Оплачено"}
                                  </span>
                                ) : null}
                                {item.month_number === 1 &&
                                  firstMonthPaid &&
                                  canRecordSchedulePayment &&
                                  !deferringId && (
                                    <Button
                                      type="button"
                                      variant={managerCommissionCollected ? "secondary" : "primary"}
                                      className="px-1.5 py-0.5"
                                      disabled={commissionSaving}
                                      onClick={() =>
                                        handleToggleManagerCommission(!managerCommissionCollected)
                                      }
                                    >
                                      {commissionSaving
                                        ? "…"
                                        : managerCommissionCollected
                                          ? "10k ✓"
                                          : "10k менед."}
                                    </Button>
                                  )}
                                {canEditSchedule && isOwner &&
                                  item.status === "overdue" &&
                                  !item.overdue_waived &&
                                  !markedForDelete && (
                                    <Button
                                      type="button"
                                      variant={markedForWaive ? "secondary" : "ghost"}
                                      className="px-1 py-0.5 text-[10px]"
                                      onClick={() => handleToggleScheduleWaive(item.id)}
                                    >
                                      {markedForWaive ? "Отмена" : "Снять пр."}
                                    </Button>
                                  )}
                                {canEditSchedule && Number(item.paid_amount) <= 0 && (
                                  <Button
                                    type="button"
                                    variant={markedForDelete ? "secondary" : "danger"}
                                    className="px-1.5 py-0.5"
                                    onClick={() => handleToggleScheduleDelete(item.id)}
                                  >
                                    {markedForDelete ? "Вернуть" : "Удал."}
                                  </Button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                        {notePanelId === item.id && (
                          <tr className="bg-slate-50">
                            <td colSpan={scheduleTableColSpan}>
                              <div className="space-y-1.5 py-1">
                                <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
                                  Примечание · {item.month_number} мес.
                                </p>
                                {canEditClient ? (
                                  <>
                                    <textarea
                                      className="interactive w-full rounded-md border border-border bg-surface px-2 py-1 text-xs shadow-soft outline-none placeholder:text-muted focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
                                      rows={2}
                                      value={noteDraft}
                                      onChange={(e) => setNoteDraft(e.target.value)}
                                      placeholder="Обещал перезвонить, просит отсрочку, договорились на…"
                                    />
                                    <div className="flex flex-wrap gap-1">
                                      <Button
                                        type="button"
                                        className="px-2 py-0.5"
                                        onClick={() => handleSaveNote(item)}
                                        disabled={noteSavingId === item.id}
                                      >
                                        {noteSavingId === item.id ? "…" : "Сохранить"}
                                      </Button>
                                      {noteText && (
                                        <Button
                                          type="button"
                                          variant="secondary"
                                          className="px-2 py-0.5"
                                          onClick={() => handleClearNote(item)}
                                          disabled={noteSavingId === item.id}
                                        >
                                          Удалить
                                        </Button>
                                      )}
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        className="px-2 py-0.5"
                                        onClick={() => {
                                          setNotePanelId(null);
                                          setNoteDraft("");
                                        }}
                                      >
                                        Свернуть
                                      </Button>
                                    </div>
                                  </>
                                ) : (
                                  <p className="whitespace-pre-wrap text-xs text-slate-700">
                                    {noteText || "—"}
                                  </p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                    {scheduleDraft.pendingAdds.map((item, index) => (
                      <tr key={item.tempId} className="bg-brand-50/40">
                        <td className="text-muted">
                          {schedule.filter((row) => !scheduleDraft.pendingDeletes.includes(row.id)).length +
                            index +
                            1}
                          <Badge tone="warning">+</Badge>
                        </td>
                        <td>
                          <Input
                            type="date"
                            className="max-w-[118px] py-0.5"
                            value={item.due_date}
                            onChange={(e) =>
                              updatePendingAdd(item.tempId, "due_date", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            className="w-[72px] py-0.5 text-right tabular-nums"
                            value={formatAmountInput(item.planned_amount)}
                            onChange={(e) =>
                              updatePendingAdd(item.tempId, "planned_amount", e.target.value)
                            }
                          />
                        </td>
                        <td className="text-right tabular-nums leading-tight text-muted">
                          <p className="whitespace-nowrap">{formatMoney(0)}</p>
                          <p className="whitespace-nowrap">{formatMoney(item.planned_amount)}</p>
                        </td>
                        <td>
                          <Badge tone="warning">Новый</Badge>
                        </td>
                        <td>
                          <span className="text-muted">—</span>
                        </td>
                        {scheduleHasActions && (
                          <td>
                            {canEditSchedule ? (
                              <Button
                                type="button"
                                variant="ghost"
                                className="px-1.5 py-0.5"
                                onClick={() => handleRemovePendingAdd(item.tempId)}
                              >
                                Убрать
                              </Button>
                            ) : (
                              <span className="text-[10px] text-muted">После сохр.</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {canEditSchedule && scheduleDraftDirty && (
                <div className="sticky bottom-2 z-10 mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-slate-300 bg-white p-2">
                  <p className="text-xs font-medium text-slate-700">
                    Есть несохранённые изменения в графике
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={scheduleSaving}
                      onClick={resetScheduleDraft}
                    >
                      Отменить
                    </Button>
                    <Button
                      type="button"
                      disabled={scheduleSaving}
                      onClick={handleSaveScheduleDraft}
                    >
                      {scheduleSaving ? "Сохранение..." : "Сохранить график"}
                    </Button>
                  </div>
                </div>
              )}
              </>
              )}
          </CollapsibleCard>

          {canRecordSchedulePayment && (
            <>
              <CollapsibleCard
                title="Оформить возврат"
                description="Редкая операция — раскройте, если нужно уменьшить оплаченную сумму по месяцу графика"
                defaultOpen={false}
              >
                <form onSubmit={handleRefund} className="grid gap-2 md:grid-cols-2">
                  <FormField label="Месяц графика">
                    <Select
                      value={refundForm.payment_schedule_id}
                      onChange={(e) => handleRefundMonthSelect(e.target.value)}
                      required
                    >
                      <option value="">Выберите месяц</option>
                      {schedule
                        .filter((item) => Number(item.paid_amount) > 0)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.month_number} — {formatDate(item.due_date)} (оплачено{" "}
                            {formatMoney(item.paid_amount)})
                          </option>
                        ))}
                    </Select>
                  </FormField>
                  <FormField label="Дата возврата">
                    <Input
                      type="date"
                      value={refundForm.payment_date}
                      onChange={(e) =>
                        setRefundForm({ ...refundForm, payment_date: e.target.value })
                      }
                      required
                    />
                  </FormField>
                  <FormField label="Сумма возврата">
                    <Input
                      inputMode="decimal"
                      placeholder="Сумма возврата"
                      value={refundForm.amount}
                      onChange={(e) =>
                        setRefundForm({ ...refundForm, amount: filterDecimalInput(e.target.value) })
                      }
                      required
                    />
                  </FormField>
                  <Input
                    placeholder="Причина возврата"
                    value={refundForm.comment}
                    onChange={(e) => setRefundForm({ ...refundForm, comment: e.target.value })}
                  />
                  <Button type="submit" variant="danger" className="md:col-span-2">
                    Оформить возврат
                  </Button>
                </form>
              </CollapsibleCard>
            </>
          )}

          <Card
            id="section-payments"
            className={cn(CLIENT_SECTION_CLASS, "border-t-4 border-t-slate-400")}
          >
            <SectionTitle
              title="История платежей"
              description={
                isOwner
                  ? "Даты влияют на доход по месяцам. Платёж без месяца графика попадает в месяц по дате платежа."
                  : undefined
              }
              action={
                isOwner && detail.payments.length > 0 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={aligningDates}
                    onClick={handleAlignPaymentDates}
                  >
                    {aligningDates ? "Перестройка..." : "Перестроить от даты договора"}
                  </Button>
                ) : undefined
              }
            />
            {detail.payments.length === 0 ? (
              <EmptyState>Платежей пока нет</EmptyState>
            ) : (
              <div className="space-y-3">
                {detail.payments.map((payment) => (
                  <div key={payment.id} className="history-item">
                    <div>
                      <div className="flex items-center gap-2">
                        <p
                          className={`font-medium ${
                            payment.is_refund ? "text-red-600" : "text-slate-900"
                          }`}
                        >
                          {payment.is_refund ? "−" : ""}
                          {formatMoney(payment.amount)}
                        </p>
                        {payment.is_refund && <Badge tone="danger">Возврат</Badge>}
                      </div>
                      <p className="text-sm text-slate-500">
                        {payment.comment ? payment.comment : "Без комментария"}
                      </p>
                    </div>
                    {isOwner && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          type="date"
                          className="w-[150px]"
                          value={paymentDateEdits[payment.id] ?? payment.payment_date}
                          onChange={(e) =>
                            setPaymentDateEdits((current) => ({
                              ...current,
                              [payment.id]: e.target.value,
                            }))
                          }
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={
                            savingPaymentDateId === payment.id ||
                            (paymentDateEdits[payment.id] ?? payment.payment_date) ===
                              payment.payment_date
                          }
                          onClick={() => handleUpdatePaymentDate(payment.id)}
                        >
                          {savingPaymentDateId === payment.id ? "..." : "Дата"}
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          disabled={deletingId === payment.id}
                          onClick={() => handleDeletePayment(payment.id)}
                        >
                          {deletingId === payment.id ? "Удаление..." : "Удалить"}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {canEditClient && (
            <CollapsibleCard
              title="История изменений карточки"
              description="Служебный журнал правок — раскройте при необходимости"
              defaultOpen={false}
              badge={
                auditEntries.length > 0 ? (
                  <Badge tone="default">{auditEntries.length}</Badge>
                ) : undefined
              }
            >
              {auditEntries.length === 0 ? (
                <EmptyState>Изменений по карточке пока нет</EmptyState>
              ) : (
                <div className="space-y-3">
                  {auditEntries.map((entry) => (
                    <div key={entry.id} className="history-item">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            tone={
                              entry.action === "create"
                                ? "success"
                                : entry.action === "delete"
                                  ? "danger"
                                  : "warning"
                            }
                          >
                            {statusLabel(entry.action)}
                          </Badge>
                          {entry.field_name && (
                            <span className="text-sm font-medium text-slate-700">
                              {entry.field_name}
                            </span>
                          )}
                        </div>
                        {entry.field_name && (
                          <p className="mt-1 text-sm text-slate-600">
                            {entry.old_value ?? "—"} → {entry.new_value ?? "—"}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-slate-400">
                          {entry.changed_by_name ?? "Пользователь"} ·{" "}
                          {new Intl.DateTimeFormat("ru-RU", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Europe/Moscow",
                          }).format(new Date(entry.changed_at))}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleCard>
          )}
        </>
      )}
    </div>
  );
}
