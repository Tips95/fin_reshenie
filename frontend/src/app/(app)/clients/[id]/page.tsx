"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  ActionMenu,
  ActionMenuItem,
  BackLink,
  Badge,
  Button,
  Card,
  CollapsibleCard,
  EmptyState,
  FormField,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  PhoneInput,
  SectionTitle,
  Select,
  StatCard,
  Toast,
} from "@/components/ui";
import { ApiRequestError, auditApi, clientsApi, documentCollectionApi, exportsApi, installmentApi, mandatoryPaymentsApi, paymentsApi, scheduleApi, usersApi } from "@/lib/api-client";
import { sanitizeClientListReturnHref } from "@/lib/client-list-filters";
import { effectiveDueDate, documentCollectionStatusLabel, engagementStageLabel, formatAmountInput, formatDate, formatMoney, formatShortName, statusLabel, todayIsoDate } from "@/lib/format";
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
import { useAuth, getAuthErrorMessage } from "@/modules/auth/AuthProvider";
import { cn } from "@/lib/cn";

type ClientCardTab = "overview" | "payments" | "documents" | "journal";

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

type ToastState = {
  message: string;
  tone: "success" | "error" | "info";
};

function useClientListReturnHref(): string {
  const [href, setHref] = useState("/clients/contracts");
  useEffect(() => {
    const ret = sanitizeClientListReturnHref(
      new URLSearchParams(window.location.search).get("return"),
    );
    if (ret) setHref(ret);
  }, []);
  return href;
}

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
  if (type === "court_fee") return "Включите, если пошлина нужна, и укажите сумму";
  return "Укажите плановую сумму вручную";
}

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const listBackHref = useClientListReturnHref();
  const [client, setClient] = useState<ClientDetail | ClientBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    payment_schedule_id: "",
    amount: "",
    payment_date: todayIsoDate(),
    comment: "",
  });
  const [refundForm, setRefundForm] = useState({
    payment_schedule_id: "",
    amount: "",
    payment_date: todayIsoDate(),
    comment: "",
  });
  const [mandatoryPayingId, setMandatoryPayingId] = useState<string | null>(null);
  const [mandatoryPayForm, setMandatoryPayForm] = useState<{
    paymentId: string;
    amount: string;
    payment_date: string;
  } | null>(null);
  const [plannedEdits, setPlannedEdits] = useState<Record<string, string>>({});
  const [editingPlannedId, setEditingPlannedId] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneValue, setPhoneValue] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [scheduleContractDraft, setScheduleContractDraft] = useState("");
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
  const [activeTab, setActiveTab] = useState<ClientCardTab>("overview");
  const [tariffOpen, setTariffOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [claimModalOpen, setClaimModalOpen] = useState(false);

  const showToast = useCallback((message: string, tone: ToastState["tone"] = "success") => {
    setToast({ message, tone });
  }, []);

  const fetchClient = useCallback(async () => {
    if (user?.role === "call_center") {
      return clientsApi.get(params.id);
    }
    return clientsApi.getDetail(params.id);
  }, [params.id, user?.role]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function run() {
      setLoading(true);
      setLoadError(null);
      setNotFound(false);
      try {
        const data = await fetchClient();
        if (cancelled) return;
        setClient(data);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiRequestError && error.status === 404) {
          setNotFound(true);
          setClient(null);
        } else {
          setLoadError(getAuthErrorMessage(error));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [user, fetchClient, reloadKey]);

  const reloadClient = useCallback(() => {
    setReloadKey((value) => value + 1);
  }, []);

  const refreshClient = useCallback(async () => {
    setRefreshing(true);
    setLoadError(null);
    try {
      setClient(await fetchClient());
      setNotFound(false);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
        setNotFound(true);
        setClient(null);
      } else {
        const message = getAuthErrorMessage(error);
        setLoadError(message);
        showToast(message, "error");
      }
    } finally {
      setRefreshing(false);
    }
  }, [fetchClient, showToast]);

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
    const today = todayIsoDate();
    setPaymentForm({
      payment_schedule_id: "",
      amount: "",
      payment_date: today,
      comment: "",
    });
    setRefundForm({
      payment_schedule_id: "",
      amount: "",
      payment_date: today,
      comment: "",
    });
    setDocCollectionPaymentDate(today);
  }, [client?.id]);

  useEffect(() => {
    if (!client) return;
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

  useEffect(() => {
    if (!client || !isDetail(client) || !client.installment_plan) return;
    if (isScheduleDraftDirty(scheduleDraft, client.payment_schedule ?? [])) return;
    setScheduleContractDraft(formatAmountInput(client.installment_plan.total_amount));
  }, [client, scheduleDraft]);

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
    });
  }

  function handleRefundMonthSelect(scheduleId: string) {
    if (!isDetail(client)) return;

    const item = client.payment_schedule.find((row) => row.id === scheduleId);
    setRefundForm({
      ...refundForm,
      payment_schedule_id: scheduleId,
      amount: item ? String(Number(item.paid_amount)) : "",
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
      payment_date: todayIsoDate(),
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
        "Перестроить график от даты договора и привязать платежи к месяцам? Даты поступления в кассу не меняются. Только для старых клиентов с нестандартными суммами.",
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
      payment_date: todayIsoDate(),
      comment: "",
    });
    await refreshClient();
    setPaymentModalOpen(false);
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
        payment_date: todayIsoDate(),
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
    if (!client || !mandatoryPayForm || mandatoryPayForm.paymentId !== item.id) return;

    const amount = Number(mandatoryPayForm.amount);
    const rest = mandatoryRemaining(item);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("Укажите сумму платежа", "error");
      return;
    }
    if (amount > rest) {
      showToast("Сумма превышает остаток", "error");
      return;
    }
    if (!mandatoryPayForm.payment_date) {
      showToast("Укажите дату платежа", "error");
      return;
    }

    setMandatoryPayingId(item.id);
    try {
      await mandatoryPaymentsApi.record(client.id, item.id, {
        amount: amount.toFixed(2),
        payment_date: mandatoryPayForm.payment_date,
        comment: statusLabel(item.payment_type),
      });
      setMandatoryPayForm(null);
      await refreshClient();
      showToast("Обязательный платёж записан");
    } catch (error) {
      showToast(
        error instanceof ApiRequestError ? error.message : "Не удалось записать платёж",
        "error",
      );
    } finally {
      setMandatoryPayingId(null);
    }
  }

  function openMandatoryPayForm(item: MandatoryPayment) {
    const rest = mandatoryRemaining(item);
    setMandatoryPayForm({
      paymentId: item.id,
      amount: rest > 0 ? String(Math.round(rest)) : "",
      payment_date: todayIsoDate(),
    });
  }

  async function handleSavePlannedAmount(item: MandatoryPayment) {
    if (!client) return;
    const value = plannedEdits[item.id] ?? item.planned_amount;
    const amount = Number(value);
    const paid = Number(item.paid_amount);
    if (!Number.isFinite(amount) || amount < 0) {
      showToast("Укажите корректную плановую сумму", "error");
      return;
    }
    if (amount < paid) {
      showToast("Плановая сумма не может быть меньше уже оплаченной", "error");
      return;
    }
    try {
      await mandatoryPaymentsApi.update(client.id, item.id, {
        planned_amount: amount.toFixed(2),
        is_applicable: true,
      });
      setEditingPlannedId(null);
      await refreshClient();
      showToast("Плановая сумма сохранена");
    } catch (error) {
      showToast(
        error instanceof ApiRequestError ? error.message : "Не удалось сохранить сумму",
        "error",
      );
    }
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
    if (client && isDetail(client) && client.installment_plan) {
      setScheduleContractDraft(formatAmountInput(client.installment_plan.total_amount));
    }
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

  function syncScheduleContractToDraftTotal() {
    setScheduleContractDraft(formatAmountInput(String(draftPlannedTotalForActions())));
  }

  function draftPlannedTotalForActions(): number {
    if (!client || !isDetail(client)) return 0;
    return computeScheduleDraftPlannedTotal(client.payment_schedule, scheduleDraft);
  }

  function adjustLastScheduleMonthToContract() {
    if (!client || !isDetail(client)) return;
    const target = Number(scheduleContractDraft) || Number(client.installment_plan?.total_amount ?? 0);
    const draftPlanned = draftPlannedTotalForActions();
    const delta = Math.round(target - draftPlanned);
    if (delta === 0) return;

    const scheduleItems = client.payment_schedule;
    const visible = scheduleItems.filter((item) => !scheduleDraft.pendingDeletes.includes(item.id));
    const lastAdd = scheduleDraft.pendingAdds[scheduleDraft.pendingAdds.length - 1];

    if (lastAdd) {
      const paidFloor = 0;
      const newVal = Math.max(paidFloor + 1, Math.round(Number(lastAdd.planned_amount) + delta));
      updatePendingAdd(lastAdd.tempId, "planned_amount", String(newVal));
      return;
    }

    const adjustable = visible.filter((item) => item.status !== "paid");
    const targetItem = adjustable[adjustable.length - 1] ?? visible[visible.length - 1];

    if (!targetItem) {
      if (delta > 0) {
        const startDate =
          client.installment_plan?.start_date ?? client.contract_date ?? new Date().toISOString().slice(0, 10);
        setScheduleDraft((current) => ({
          ...current,
          pendingAdds: [
            ...current.pendingAdds,
            {
              tempId: crypto.randomUUID(),
              planned_amount: String(delta),
              due_date: startDate,
            },
          ],
        }));
      }
      return;
    }

    const values = getScheduleEditValues(targetItem, scheduleDraft.edits);
    const minAmount = Math.max(1, Math.round(Number(targetItem.paid_amount)));
    const newAmount = Math.max(minAmount, Math.round(Number(values.planned_amount) + delta));
    setScheduleDraft((current) => ({
      ...current,
      edits: {
        ...current.edits,
        [targetItem.id]: { ...values, planned_amount: String(newAmount) },
      },
    }));
  }

  async function applyScheduleDraftChanges() {
    if (!client || !isDetail(client) || !client.installment_plan) return;

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
  }

  async function handleSaveContractAndSchedule() {
    if (!client || !isDetail(client) || !client.installment_plan) return;

    const draftPlanned = computeScheduleDraftPlannedTotal(client.payment_schedule, scheduleDraft);
    const scheduleDirty = isScheduleDraftDirty(scheduleDraft, client.payment_schedule);
    const savedContract = Number(client.installment_plan.total_amount);
    let targetContract = Number(scheduleContractDraft);
    if (!Number.isFinite(targetContract) || targetContract <= 0) {
      targetContract = draftPlanned;
    }
    const contractDirty = Math.round(targetContract) !== Math.round(savedContract);

    if (!scheduleDirty && !contractDirty) return;

    if (scheduleDirty && draftPlanned <= 0) {
      showToast("Укажите суммы для месяцев графика", "error");
      return;
    }

    if (contractDirty || scheduleDirty) {
      const amountError = validatePositiveAmount(String(targetContract), { label: "Сумма договора" });
      if (amountError) {
        showToast(amountError, "error");
        return;
      }
    }

    setScheduleSaving(true);
    setScheduleError(null);

    try {
      if (scheduleDirty) {
        await applyScheduleDraftChanges();
      }

      const needsContractUpdate =
        contractDirty || (scheduleDirty && Math.round(targetContract) !== Math.round(draftPlanned));
      if (needsContractUpdate) {
        await installmentApi.update(client.id, client.installment_plan.id, {
          total_amount: targetContract.toFixed(2),
        });
      }

      resetScheduleDraft();
      await refreshClient();
      showToast(scheduleDirty && needsContractUpdate ? "Договор и график сохранены" : scheduleDirty ? "График платежей сохранён" : "Сумма договора сохранена");
    } catch (error) {
      const message =
        error instanceof ApiRequestError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Не удалось сохранить изменения";
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

  async function handleClaimClient() {
    if (!client || !user) return;
    setCardSaving("claim");
    try {
      const updated = await clientsApi.update(client.id, { assigned_manager_id: user.id });
      setClient((current) => (current ? { ...current, ...updated } : current));
      showToast("Клиент закреплён за вами");
      setClaimModalOpen(false);
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
        docCollectionPaymentDate || todayIsoDate(),
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
        setActiveTab("payments");
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

  if (loading && !client && !loadError) {
    return <LoadingState text="Загрузка карточки..." />;
  }

  if (loadError && !client) {
    return (
      <div className="page-stack">
        <PageHeader
          title="Карточка клиента"
          back={<BackLink href={listBackHref}>К списку клиентов</BackLink>}
        />
        <Card>
          <EmptyState>{loadError}</EmptyState>
          <div className="mt-3 flex justify-center">
            <Button type="button" onClick={reloadClient}>
              Повторить
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (notFound || !client) return <EmptyState>Клиент не найден</EmptyState>;

  const detail = isDetail(client) ? client : null;
  const isBankruptcy = client.engagement_stage === "bankruptcy";
  const docCollection = detail?.document_collection ?? null;

  const clientTabs: Array<{ id: ClientCardTab; label: string }> = [
    { id: "overview", label: "Обзор" },
  ];
  if (detail && isBankruptcy) {
    clientTabs.push({ id: "payments", label: "Платежи" });
  }
  if ((canEditClient && docCollection) || (isBankruptcy && canManageMandatory)) {
    clientTabs.push({ id: "documents", label: "Документы" });
  }
  if (canEditClient && detail) {
    clientTabs.push({ id: "journal", label: "Журнал" });
  }
  const effectiveTab = clientTabs.some((tab) => tab.id === activeTab) ? activeTab : "overview";

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

  function scheduleRowHasMenu(item: PaymentScheduleItem, rest: number, markedForDelete: boolean) {
    const canDefer = canRecordSchedulePayment && rest > 0 && !markedForDelete;
    const canToggleCommission =
      item.month_number === 1 && firstMonthPaid && canRecordSchedulePayment;
    const canWaive =
      canEditSchedule &&
      isOwner &&
      item.status === "overdue" &&
      !item.overdue_waived &&
      !markedForDelete;
    const canDelete = canEditSchedule && Number(item.paid_amount) <= 0;
    return canDefer || canToggleCommission || canWaive || canDelete;
  }
  const planContractTotal = detail?.installment_plan ? Number(detail.installment_plan.total_amount) : 0;
  const isManualInstallment = detail?.installment_plan?.pricing_tier_id == null;
  const draftPlannedTotal = computeScheduleDraftPlannedTotal(schedule, scheduleDraft);
  const effectiveScheduleContract = Number(scheduleContractDraft) || planContractTotal;
  const contractDraftDirty =
    canEditSchedule &&
    scheduleContractDraft !== "" &&
    Math.round(effectiveScheduleContract) !== Math.round(planContractTotal);
  const contractScheduleDirty = scheduleDraftDirty || contractDraftDirty;
  const hasScheduleDraftRows =
    schedule.some((item) => !scheduleDraft.pendingDeletes.includes(item.id)) ||
    scheduleDraft.pendingAdds.length > 0;
  const scheduleMismatchMessage =
    hasScheduleDraftRows || contractDraftDirty
      ? formatScheduleMismatchMessage(effectiveScheduleContract, draftPlannedTotal)
      : "";

  function renderPaymentFormContent() {
    return (
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
                {formatMoney(item.planned_amount)}, остаток {formatMoney(remainingAmount(item))})
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Дата поступления в кассу">
          <Input
            type="date"
            value={paymentForm.payment_date}
            onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
            required
          />
          <p className="mt-1 text-xs text-muted">
            Когда деньги реально пришли — от этого зависит доход в отчёте за месяц. Месяц графика
            выбирается отдельно.
          </p>
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
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button type="submit">Сохранить платёж</Button>
          <Button type="button" variant="secondary" onClick={() => setPaymentModalOpen(false)}>
            Отмена
          </Button>
        </div>
      </form>
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
        back={<BackLink href={listBackHref}>К списку клиентов</BackLink>}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {canClaimClient ? (
              <Button type="button" variant="secondary" onClick={() => setClaimModalOpen(true)}>
                Принять в работу
              </Button>
            ) : null}
            {canRecordSchedulePayment && isBankruptcy ? (
              <Button
                type="button"
                onClick={() => {
                  setPaymentForm((prev) => ({ ...prev, payment_date: todayIsoDate() }));
                  setPaymentModalOpen(true);
                }}
              >
                Зафиксировать платёж
              </Button>
            ) : null}
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
            {isOwner || user?.role !== "call_center" ? (
              <ActionMenu label="Действия с клиентом">
                {user?.role !== "call_center" && (
                  <ActionMenuItem
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
                    {exporting ? "Выгрузка..." : "Выгрузить в Excel"}
                  </ActionMenuItem>
                )}
                {isOwner && (
                  <ActionMenuItem
                    tone="danger"
                    disabled={deletingClient}
                    onClick={handleDeleteClient}
                  >
                    {deletingClient ? "Удаление..." : "Удалить клиента"}
                  </ActionMenuItem>
                )}
              </ActionMenu>
            ) : null}
          </div>
        }
      />

      {clientTabs.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {clientTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === "payments") setScheduleOpen(true);
              }}
              className={effectiveTab === tab.id ? "tab-pill-active" : "tab-pill-inactive"}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      {effectiveTab === "overview" && detail && isBankruptcy ? (
        <Card className="p-2.5">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 xl:grid-cols-5">
            <div>
              <p className="type-caption">Договор</p>
              <p className="field-value">{formatMoney(contractTotal)}</p>
            </div>
            <div>
              <p className="type-caption">Остаток</p>
              <p
                className={cn(
                  "field-value",
                  remainder > 0 ? "text-status-warning-text" : "text-status-success-text",
                )}
              >
                {formatMoney(remainder)}
              </p>
            </div>
            {nextDueItem ? (
              <div>
                <p className="type-caption">След. платёж</p>
                <p className="field-value">
                  {formatDate(effectiveDueDate(nextDueItem))} ·{" "}
                  {formatMoney(remainingAmount(nextDueItem))}
                </p>
              </div>
            ) : null}
            {isOwner ? (
              <>
                <div>
                  <p className="type-caption">Получено</p>
                  <p className="field-value">{formatMoney(collectedTotal)}</p>
                </div>
                <div>
                  <p className="type-caption">Прибыль</p>
                  <p
                    className={cn(
                      "field-value",
                      clientProfit >= 0 ? "text-status-success-text" : "text-status-danger-text",
                    )}
                  >
                    {formatMoney(clientProfit)}
                  </p>
                </div>
              </>
            ) : null}
          </div>
          {showManagerCommission || overdueScheduleItems.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
              {overdueScheduleItems.length > 0 ? (
                <Badge tone="danger">Просрочка: {overdueScheduleItems.length} мес.</Badge>
              ) : null}
              {showManagerCommission ? (
                <Badge tone={managerCommissionCollected ? "success" : "warning"}>
                  Менеджерские:{" "}
                  {managerCommissionCollected ? "выдано" : "10 000 ₽ не отмечено"}
                </Badge>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      {effectiveTab === "overview" && canEditClient ? (
        <Card
          id="section-client"
          className={cn(CLIENT_SECTION_CLASS, "border-t-4 border-t-chrome")}
        >
          <SectionTitle
            title="Данные клиента"
            description="Контакты, даты и статус"
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
            )}

            {isBankruptcy && detail?.matched_tier ? (
              <div className="rounded-md border border-border bg-surface-muted">
                <button
                  type="button"
                  className="interactive flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs"
                  onClick={() => setTariffOpen((open) => !open)}
                  aria-expanded={tariffOpen}
                >
                  <span>
                    <span className="text-muted">Подобранный тариф: </span>
                    <span className="font-medium text-foreground">
                      {formatMoney(detail.matched_tier.min_amount)} –{" "}
                      {formatMoney(detail.matched_tier.max_amount)} ·{" "}
                      {detail.matched_tier.total_months} мес. ·{" "}
                      {formatMoney(detail.matched_tier.total_cost)}
                    </span>
                  </span>
                  <span className="shrink-0 text-muted">{tariffOpen ? "▲" : "▼"}</span>
                </button>
                {tariffOpen ? (
                  <div className="grid gap-2 border-t border-border px-3 py-2 text-sm md:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <p className="text-muted">Диапазон долга</p>
                      <p className="mt-1 font-medium text-foreground">
                        {formatMoney(detail.matched_tier.min_amount)} –{" "}
                        {formatMoney(detail.matched_tier.max_amount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted">Стоимость по тарифу</p>
                      <p className="mt-1 font-medium text-foreground">
                        {formatMoney(detail.matched_tier.total_cost)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted">Срок</p>
                      <p className="mt-1 font-medium text-foreground">
                        {detail.matched_tier.total_months} мес.
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {effectiveTab === "documents" && canEditClient && isDetail(client) && docCollection ? (
        <Card
          id="section-doc"
          variant="accent"
          className={cn(CLIENT_SECTION_CLASS, "border-t-4 border-t-status-warning-solid")}
        >
          <SectionTitle
            title="Сбор документов"
            description={
              isBankruptcy
                ? `Оплачено ${formatDate(docCollection.paid_date ?? client.contract_date)} · ${formatMoney(docCollection.total_amount)}`
                : `Единоразовая оплата ${formatMoney(docCollection.total_amount)}`
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
                  <p className="rounded-md border border-border bg-surface px-3 py-2 field-value">
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
            !isBankruptcy ? (
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
            ) : null
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Badge tone={docCollection.status === "paid" ? "success" : "warning"}>
              {documentCollectionStatusLabel(docCollection.status)}
            </Badge>
            {docCollection.paid_date && (
              <span className="text-sm text-muted">
                Оплачено {formatDate(docCollection.paid_date)}
              </span>
            )}
            {isBankruptcy && (
              <Badge tone="success">Переведён на банкротство</Badge>
            )}
          </div>
          {!isBankruptcy && canRecordDocCollectionPayment && docCollection.status !== "paid" && (
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <FormField label="Дата поступления в кассу">
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
              {convertError && <p className="text-sm text-status-danger-text">{convertError}</p>}
              <Button type="submit" disabled={convertSaving}>
                {convertSaving ? "Перевод..." : "Перевести на банкротство"}
              </Button>
            </form>
          )}
        </Card>
      ) : null}

      {effectiveTab === "overview" && detail && !isBankruptcy ? (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Дата договора" value={formatDate(client.contract_date)} tone="brand" />
          <StatCard label="Статус" value={statusLabel(client.status)} tone="default" />
          <StatCard
            label="Услуга"
            value={engagementStageLabel(client.engagement_stage)}
            tone="warning"
          />
        </div>
      ) : null}

      {effectiveTab === "documents" && detail && isBankruptcy && canManageMandatory ? (
          <CollapsibleCard
            id="section-mandatory"
            className={cn(CLIENT_SECTION_CLASS, "border-t-4 border-t-status-warning-solid")}
            title="Обязательные платежи по процедуре"
            description="Суммы вводятся вручную. Дата внесения определяет месяц вычета из чистой прибыли"
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
                <table className="data-table table-cards">
                  <thead>
                    <tr>
                      <th>Платёж</th>
                      <th>План</th>
                      <th>Оплачено</th>
                      <th>Остаток</th>
                      <th>Дата оплаты</th>
                      <th>Статус</th>
                      {canManageMandatory && <th>Действие</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {mandatory.map((item) => {
                      const rest = mandatoryRemaining(item);
                      const canEditPlanned = item.is_applicable && canManageMandatory;
                      const editingPlanned = editingPlannedId === item.id;
                      const plannedValue = plannedEdits[item.id] ?? item.planned_amount;
                      const paying = mandatoryPayForm?.paymentId === item.id;

                      return (
                        <tr key={item.id}>
                          <td data-label="Платёж">
                            <div>
                              <p className="font-medium text-foreground">
                                {statusLabel(item.payment_type)}
                              </p>
                              <p className="text-xs text-muted">
                                {mandatoryTypeHint(item.payment_type)}
                              </p>
                            </div>
                          </td>
                          <td data-label="План">
                            {item.payment_type === "court_fee" && !item.is_applicable ? (
                              <span className="text-muted">Не требуется</span>
                            ) : canEditPlanned && (editingPlanned || Number(item.planned_amount) <= 0) ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <Input
                                  type="number"
                                  min={Number(item.paid_amount)}
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
                                {editingPlanned && Number(item.planned_amount) > 0 ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => {
                                      setEditingPlannedId(null);
                                      setPlannedEdits((prev) => {
                                        const next = { ...prev };
                                        delete next[item.id];
                                        return next;
                                      });
                                    }}
                                  >
                                    Отмена
                                  </Button>
                                ) : null}
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-2">
                                <span>{formatMoney(item.planned_amount)}</span>
                                {canEditPlanned ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => {
                                      setEditingPlannedId(item.id);
                                      setPlannedEdits({
                                        ...plannedEdits,
                                        [item.id]: String(Math.round(Number(item.planned_amount))),
                                      });
                                    }}
                                  >
                                    Изменить
                                  </Button>
                                ) : null}
                              </div>
                            )}
                          </td>
                          <td data-label="Оплачено">{formatMoney(item.paid_amount)}</td>
                          <td data-label="Остаток">
                            {item.is_applicable ? formatMoney(rest) : "—"}
                          </td>
                          <td data-label="Дата оплаты">
                            {item.paid_date ? formatDate(item.paid_date) : "—"}
                          </td>
                          <td data-label="Статус">
                            <Badge tone={scheduleTone(item.status)}>
                              {statusLabel(item.status)}
                            </Badge>
                          </td>
                          {canManageMandatory && (
                            <td data-label="Действие">
                              {item.payment_type === "court_fee" && (
                                <label className="mb-2 flex items-center gap-2 text-xs text-muted">
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
                                paying ? (
                                  <div className="flex min-w-[200px] flex-col gap-2">
                                    <FormField label="Сумма">
                                      <Input
                                        type="number"
                                        min={1}
                                        step={1}
                                        max={rest}
                                        value={mandatoryPayForm.amount}
                                        onChange={(e) =>
                                          setMandatoryPayForm({
                                            ...mandatoryPayForm,
                                            amount: e.target.value,
                                          })
                                        }
                                      />
                                    </FormField>
                                    <FormField label="Дата платежа">
                                      <Input
                                        type="date"
                                        value={mandatoryPayForm.payment_date}
                                        onChange={(e) =>
                                          setMandatoryPayForm({
                                            ...mandatoryPayForm,
                                            payment_date: e.target.value,
                                          })
                                        }
                                      />
                                    </FormField>
                                    <div className="flex flex-wrap gap-2">
                                      <Button
                                        type="button"
                                        disabled={mandatoryPayingId === item.id}
                                        onClick={() => handleMandatoryPay(item)}
                                      >
                                        {mandatoryPayingId === item.id
                                          ? "Сохранение..."
                                          : "Записать"}
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        disabled={mandatoryPayingId === item.id}
                                        onClick={() => setMandatoryPayForm(null)}
                                      >
                                        Отмена
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => openMandatoryPayForm(item)}
                                  >
                                    Внести платёж
                                  </Button>
                                )
                              ) : item.is_applicable && item.status === "paid" ? (
                                <span className="text-xs text-status-success-text">Оплачено</span>
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
      ) : null}

      {effectiveTab === "payments" && detail && isBankruptcy ? (
        <>
          <CollapsibleCard
            id="section-schedule"
            className={cn(CLIENT_SECTION_CLASS, "border-t-4 border-t-brand-600")}
            title="График платежей"
            description={
              canEditSchedule
                ? isManualInstallment
                  ? "Задайте сумму договора и месяцы — сохранение выровняет расхождения автоматически"
                  : "1-й месяц = дата договора, дальше по месяцам. Сумму договора можно менять прямо здесь"
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
              <div className="mb-3 flex flex-wrap items-end gap-3 rounded-md border border-border bg-surface-muted p-3">
                <div className="min-w-[180px]">
                  <FormField label="Сумма договора, ₽">
                    <Input
                      type="number"
                      min={0}
                      step={1000}
                      value={scheduleContractDraft}
                      onChange={(e) => setScheduleContractDraft(e.target.value)}
                    />
                  </FormField>
                </div>
                <div className="text-xs text-muted">
                  <p>
                    По графику: <strong className="text-foreground">{formatMoney(draftPlannedTotal)}</strong>
                  </p>
                  {scheduleMismatchMessage ? (
                    <p className="mt-1 text-status-warning-text">{scheduleMismatchMessage}</p>
                  ) : (
                    <p className="mt-1 text-status-success-text">Суммы совпадают</p>
                  )}
                </div>
                {scheduleMismatchMessage ? (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" onClick={syncScheduleContractToDraftTotal}>
                      Договор = график
                    </Button>
                    <Button type="button" variant="secondary" onClick={adjustLastScheduleMonthToContract}>
                      Подогнать последний месяц
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
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
            {schedule.length === 0 && scheduleDraft.pendingAdds.length === 0 ? (
              <EmptyState>
                {canEditSchedule
                  ? "График не сформирован. Нажмите «+ Добавить месяц»."
                  : "График не сформирован"}
              </EmptyState>
            ) : (
              <>
                <div className="overflow-x-auto">
                <table className="data-table table-cards text-xs">
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
                            markedForDelete && "bg-surface-muted opacity-60",
                            item.month_number === 1 &&
                              firstMonthPaid &&
                              (managerCommissionCollected
                                ? "bg-status-success-bg/60 hover:bg-status-success-bg"
                                : "bg-status-warning-bg/40 hover:bg-status-warning-bg/50"),
                          )}
                        >
                          <td data-label="Месяц" className="tabular-nums text-muted">
                            {item.month_number}
                            {rowChanged && (
                              <span className="ml-0.5 text-brand-600" title="Изменён">*</span>
                            )}
                          </td>
                          <td data-label="Дата">
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
                                  <p className="text-[11px] text-status-warning-text">
                                    было {formatDate(item.due_date)}
                                  </p>
                                )}
                                {item.deferral_comment && (
                                  <p className="mt-0.5 line-clamp-2 text-[11px] text-status-warning-text" title={item.deferral_comment}>
                                    {item.deferral_comment}
                                  </p>
                                )}
                              </div>
                            )}
                          </td>
                          <td data-label="План" className="text-right">
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
                          <td data-label="Оплачено / остаток" className="text-right tabular-nums leading-tight">
                            <p className="whitespace-nowrap">{formatMoney(item.paid_amount)}</p>
                            <p className={cn("whitespace-nowrap", rest > 0 ? "text-muted" : "text-status-success-text")}>
                              {formatMoney(rest)}
                            </p>
                          </td>
                          <td data-label="Статус">
                            <Badge tone={scheduleTone(item.status)}>
                              {statusLabel(item.status)}
                            </Badge>
                            {(item.overdue_waived || markedForWaive) && (
                              <p className="mt-0.5 text-[11px] text-muted">
                                {markedForWaive ? "Снятие проср." : "Проср. снята"}
                              </p>
                            )}
                            {item.deferred_until && !item.deferral_comment && (
                              <p className="mt-0.5 text-[11px] text-status-warning-text">
                                до {formatDate(item.deferred_until)}
                              </p>
                            )}
                          </td>
                          <td data-label="Примечание">
                            {canEditClient ? (
                              <button
                                type="button"
                                className={cn(
                                  "interactive w-full rounded px-1 py-0.5 text-left leading-snug",
                                  noteText
                                    ? "text-foreground hover:bg-surface-muted"
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
                              <p className="line-clamp-2 whitespace-pre-wrap leading-snug text-foreground" title={noteText}>
                                {noteText}
                              </p>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          {scheduleHasActions && (
                            <td data-label="Действия">
                              {deferringId === item.id ? (
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
                                    <Button type="button" size="sm" onClick={() => handleDefer(item)}>
                                      OK
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setDeferringId(null)}
                                    >
                                      ×
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-wrap items-center justify-end gap-1">
                                  {canRecordSchedulePayment && rest > 0 && !markedForDelete ? (
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      disabled={payingId === item.id}
                                      onClick={() => handleQuickPay(item)}
                                    >
                                      {payingId === item.id ? "…" : "Оплатить"}
                                    </Button>
                                  ) : canRecordSchedulePayment ? (
                                    <span className="text-[11px] text-muted">
                                      {markedForDelete ? "К удалению" : "Оплачено"}
                                    </span>
                                  ) : null}
                                  {scheduleRowHasMenu(item, rest, markedForDelete) ? (
                                    <ActionMenu label={`Действия по ${item.month_number} месяцу`}>
                                      {canRecordSchedulePayment && rest > 0 && !markedForDelete ? (
                                        <ActionMenuItem onClick={() => startDefer(item)}>
                                          Отсрочить платёж
                                        </ActionMenuItem>
                                      ) : null}
                                      {item.month_number === 1 &&
                                      firstMonthPaid &&
                                      canRecordSchedulePayment ? (
                                        <ActionMenuItem
                                          disabled={commissionSaving}
                                          onClick={() =>
                                            handleToggleManagerCommission(!managerCommissionCollected)
                                          }
                                        >
                                          {managerCommissionCollected
                                            ? "Отменить 10 000 ₽ менеджеру"
                                            : "Отметить 10 000 ₽ менеджеру"}
                                        </ActionMenuItem>
                                      ) : null}
                                      {canEditSchedule &&
                                      isOwner &&
                                      item.status === "overdue" &&
                                      !item.overdue_waived &&
                                      !markedForDelete ? (
                                        <ActionMenuItem
                                          onClick={() => handleToggleScheduleWaive(item.id)}
                                        >
                                          {markedForWaive ? "Не снимать просрочку" : "Снять просрочку"}
                                        </ActionMenuItem>
                                      ) : null}
                                      {canEditSchedule && Number(item.paid_amount) <= 0 ? (
                                        <ActionMenuItem
                                          tone={markedForDelete ? "default" : "danger"}
                                          onClick={() => handleToggleScheduleDelete(item.id)}
                                        >
                                          {markedForDelete ? "Вернуть месяц" : "Удалить месяц"}
                                        </ActionMenuItem>
                                      ) : null}
                                    </ActionMenu>
                                  ) : null}
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                        {notePanelId === item.id && (
                          <tr className="bg-surface-muted">
                            <td colSpan={scheduleTableColSpan}>
                              <div className="space-y-1.5 py-1">
                                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
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
                                  <p className="whitespace-pre-wrap text-xs text-foreground">
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
                        <td data-label="Месяц" className="text-muted">
                          {schedule.filter((row) => !scheduleDraft.pendingDeletes.includes(row.id)).length +
                            index +
                            1}
                          <Badge tone="warning">+</Badge>
                        </td>
                        <td data-label="Дата">
                          <Input
                            type="date"
                            className="max-w-[118px] py-0.5"
                            value={item.due_date}
                            onChange={(e) =>
                              updatePendingAdd(item.tempId, "due_date", e.target.value)
                            }
                          />
                        </td>
                        <td data-label="План">
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
                        <td
                          data-label="Оплачено / остаток"
                          className="text-right tabular-nums leading-tight text-muted"
                        >
                          <p className="whitespace-nowrap">{formatMoney(0)}</p>
                          <p className="whitespace-nowrap">{formatMoney(item.planned_amount)}</p>
                        </td>
                        <td data-label="Статус">
                          <Badge tone="warning">Новый</Badge>
                        </td>
                        <td data-label="Примечание">
                          <span className="text-muted">—</span>
                        </td>
                        {scheduleHasActions && (
                          <td data-label="Действия">
                            {canEditSchedule ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemovePendingAdd(item.tempId)}
                              >
                                Убрать
                              </Button>
                            ) : (
                              <span className="text-[11px] text-muted">После сохр.</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {canEditSchedule && contractScheduleDirty && (
                <div className="sticky bottom-2 z-10 mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-border-strong bg-surface p-2">
                  <p className="text-xs font-medium text-foreground">
                    {scheduleDraftDirty && contractDraftDirty
                      ? "Есть несохранённые изменения в договоре и графике"
                      : scheduleDraftDirty
                        ? "Есть несохранённые изменения в графике"
                        : "Изменена сумма договора"}
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
                      onClick={handleSaveContractAndSchedule}
                    >
                      {scheduleSaving
                        ? "Сохранение..."
                        : scheduleDraftDirty && contractDraftDirty
                          ? "Сохранить договор и график"
                          : scheduleDraftDirty
                            ? "Сохранить график"
                            : "Сохранить сумму договора"}
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
            className={cn(CLIENT_SECTION_CLASS, "border-t-4 border-t-border-strong")}
          >
            <SectionTitle
              title="История платежей"
              description={
                isOwner
                  ? "Дата поступления в кассу определяет месяц в отчёте. Месяц графика — за какой платёж по рассрочке закрывается строка."
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
                            payment.is_refund ? "text-status-danger-text" : "text-foreground"
                          }`}
                        >
                          {payment.is_refund ? "−" : ""}
                          {formatMoney(payment.amount)}
                        </p>
                        {payment.is_refund && <Badge tone="danger">Возврат</Badge>}
                      </div>
                      <p className="text-sm text-muted">
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
        </>
      ) : null}

      {effectiveTab === "journal" && canEditClient ? (
            <CollapsibleCard
              title="История изменений карточки"
              description="Изменения по этому клиенту. Общий журнал по организации — в разделе «Журнал изменений»."
              defaultOpen
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
                            <span className="text-sm font-medium text-foreground">
                              {entry.field_name}
                            </span>
                          )}
                        </div>
                        {entry.field_name && (
                          <p className="mt-1 text-sm text-muted">
                            {entry.old_value ?? "—"} → {entry.new_value ?? "—"}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted">
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
      ) : null}

      <Modal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        title="Зафиксировать платёж"
        description="Выберите месяц графика (за какой платёж по рассрочке) и дату поступления денег в кассу. При опоздании месяцы будут разными — это нормально."
      >
        {renderPaymentFormContent()}
      </Modal>

      <Modal
        open={claimModalOpen}
        onClose={() => setClaimModalOpen(false)}
        title="Принять клиента в работу"
        description="Нераспределённые клиенты с этапа сбора можно закрепить за собой"
      >
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={cardSaving === "claim"} onClick={handleClaimClient}>
            {cardSaving === "claim" ? "Закрепление..." : "Принять в работу"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setClaimModalOpen(false)}>
            Отмена
          </Button>
        </div>
      </Modal>
    </div>
  );
}
