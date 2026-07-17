"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  BackLink,
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  LoadingState,
  PageHeader,
  ProgressBar,
  SectionTitle,
  Select,
  StatCard,
} from "@/components/ui";
import { ApiRequestError, auditApi, clientsApi, documentCollectionApi, exportsApi, mandatoryPaymentsApi, paymentsApi, scheduleApi, usersApi } from "@/lib/api-client";
import { effectiveDueDate, documentCollectionStatusLabel, engagementStageLabel, formatDate, formatMoney, formatShortName, statusLabel } from "@/lib/format";
import type { AuditLogEntry, ClientBrief, ClientDetail, ClientStatus, MandatoryPayment, PaymentScheduleItem, ProcedureStage, User } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

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

function paymentProgress(item: PaymentScheduleItem): number {
  const planned = Number(item.planned_amount);
  if (planned <= 0) return 0;
  return Math.min(100, Math.round((Number(item.paid_amount) / planned) * 100));
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

function progressTone(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "paid") return "success";
  if (status === "partial") return "warning";
  if (status === "overdue") return "danger";
  return "default";
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
  const [deferringId, setDeferringId] = useState<string | null>(null);
  const [deferForm, setDeferForm] = useState({ deferred_until: "", comment: "" });
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
  const [exporting, setExporting] = useState(false);
  const [managers, setManagers] = useState<User[]>([]);
  const [cardSaving, setCardSaving] = useState<string | null>(null);
  const [docCollectionSaving, setDocCollectionSaving] = useState(false);
  const [convertSaving, setConvertSaving] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertForm, setConvertForm] = useState({ debt_amount: "", contract_date: "" });
  const [deletingClient, setDeletingClient] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (user?.role === "call_center") {
        const clientData = await clientsApi.get(params.id);
        setClient(clientData);
      } else {
        const detail = await clientsApi.getDetail(params.id);
        setClient(detail);
      }
    } finally {
      setLoading(false);
    }
  }, [params.id, user?.role]);

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
      payment_date: new Date().toISOString().slice(0, 10),
      comment: "",
    });
    load();
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
      load();
    } catch (error) {
      alert(
        error instanceof ApiRequestError
          ? error.message
          : "Не удалось отменить платёж",
      );
    } finally {
      setDeletingId(null);
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
      alert(
        error instanceof ApiRequestError
          ? error.message
          : "Не удалось удалить клиента",
      );
    } finally {
      setDeletingClient(false);
    }
  }

  async function handlePayment(event: React.FormEvent) {
    event.preventDefault();
    if (!client) return;

    await paymentsApi.create({
      client_id: client.id,
      payment_schedule_id: paymentForm.payment_schedule_id || null,
      amount: paymentForm.amount,
      payment_date: paymentForm.payment_date,
      comment: paymentForm.comment || null,
    });

    setPaymentForm({
      payment_schedule_id: "",
      amount: "",
      payment_date: new Date().toISOString().slice(0, 10),
      comment: "",
    });
    load();
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
        payment_date: new Date().toISOString().slice(0, 10),
        comment: `Оплата за ${item.month_number} месяц`,
      });
      load();
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
        payment_date: new Date().toISOString().slice(0, 10),
        comment: statusLabel(item.payment_type),
      });
      load();
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
    load();
  }

  async function handleToggleCourtFee(item: MandatoryPayment, enabled: boolean) {
    if (!client) return;
    await mandatoryPaymentsApi.update(client.id, item.id, {
      is_applicable: enabled,
      planned_amount: enabled ? item.planned_amount : "0.00",
    });
    load();
  }

  async function handleSavePhone() {
    if (!client) return;
    setPhoneSaving(true);
    try {
      await clientsApi.update(client.id, { phone: phoneValue.trim() });
      setEditingPhone(false);
      load();
    } catch (error) {
      alert(error instanceof ApiRequestError ? error.message : "Не удалось сохранить телефон");
    } finally {
      setPhoneSaving(false);
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
      alert("Укажите причину отсрочки");
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
      load();
    } catch (error) {
      alert(error instanceof ApiRequestError ? error.message : "Не удалось оформить отсрочку");
    } finally {
      setDeferringId(null);
    }
  }

  const isOwner = user?.role === "owner";
  const canEditClient = isOwner || user?.role === "manager";
  const canAssignManager = user?.role === "owner";
  const canRecordPayment = canEditClient;

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

  async function handleCardUpdate(data: Record<string, unknown>, field: string) {
    if (!client) return;
    setCardSaving(field);
    try {
      const updated = await clientsApi.update(client.id, data);
      setClient((current) => (current ? { ...current, ...updated } : current));
    } catch (error) {
      alert(error instanceof ApiRequestError ? error.message : "Не удалось сохранить изменения");
    } finally {
      setCardSaving(null);
    }
  }

  async function handleRecordDocumentCollection() {
    if (!client) return;
    setDocCollectionSaving(true);
    try {
      await documentCollectionApi.recordPayment(
        client.id,
        new Date().toISOString().slice(0, 10),
      );
      await load();
    } catch (error) {
      alert(error instanceof ApiRequestError ? error.message : "Не удалось зафиксировать оплату");
    } finally {
      setDocCollectionSaving(false);
    }
  }

  async function handleConvertToBankruptcy(event: React.FormEvent) {
    event.preventDefault();
    if (!client) return;
    setConvertSaving(true);
    setConvertError(null);
    try {
      const updated = await documentCollectionApi.convertToBankruptcy(client.id, {
        debt_amount: convertForm.debt_amount,
        contract_date: convertForm.contract_date || undefined,
      });
      setClient(updated);
    } catch (error) {
      setConvertError(
        error instanceof ApiRequestError ? error.message : "Не удалось перевести на банкротство",
      );
    } finally {
      setConvertSaving(false);
    }
  }

  if (loading) return <LoadingState text="Загрузка карточки..." />;
  if (!client) return <EmptyState>Клиент не найден</EmptyState>;

  const detail = isDetail(client) ? client : null;
  const isBankruptcy = client.engagement_stage === "bankruptcy";
  const docCollection = detail?.document_collection ?? null;
  const schedule = detail?.payment_schedule ?? [];
  const mandatory = detail?.mandatory_payments ?? [];
  const paidTotal = schedule.reduce((sum, item) => sum + Number(item.paid_amount), 0);
  const plannedTotal = schedule.reduce((sum, item) => sum + Number(item.planned_amount), 0);
  const remainder = plannedTotal - paidTotal;
  const collectedTotal = (detail?.payments ?? []).reduce((sum, payment) => {
    const signed = payment.is_refund ? -Number(payment.amount) : Number(payment.amount);
    return sum + signed;
  }, 0);
  const mandatoryPaidTotal = mandatory
    .filter((item) => item.is_applicable)
    .reduce((sum, item) => sum + Number(item.paid_amount), 0);
  const clientProfit = collectedTotal - mandatoryPaidTotal;

  return (
    <div className="space-y-8">
      <PageHeader
        title={formatShortName(client.full_name)}
        subtitle={client.phone}
        back={<BackLink href="/clients">К списку клиентов</BackLink>}
        action={
          <div className="flex flex-wrap items-center gap-2">
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
                    alert(
                      error instanceof ApiRequestError
                        ? error.message
                        : "Не удалось выгрузить Excel",
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

      {canEditClient && (
        <Card>
          <SectionTitle title="Контактные данные" />
          {editingPhone ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <FormField label="Телефон">
                  <Input
                    value={phoneValue}
                    onChange={(e) => setPhoneValue(e.target.value)}
                    placeholder="+7 928 000-00-00"
                  />
                </FormField>
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
              <p className="text-lg font-semibold text-slate-900">{client.phone}</p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setPhoneValue(client.phone);
                  setEditingPhone(true);
                }}
              >
                Изменить номер
              </Button>
            </div>
          )}
        </Card>
      )}

      {canEditClient && isDetail(client) && (
        <Card>
          <SectionTitle title="Статус, этап и менеджер" />
          <div className="mb-4">
            <Badge tone={isBankruptcy ? "success" : "warning"}>
              {engagementStageLabel(client.engagement_stage)}
            </Badge>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
            {isBankruptcy && (
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
        </Card>
      )}

      {canEditClient && isDetail(client) && !isBankruptcy && docCollection && (
        <Card variant="accent">
          <SectionTitle
            title="Сбор документов"
            description="Единоразовая оплата 13 000 ₽: сбор 10 000 + нотариус 2 000 + менеджеру 1 000"
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="К оплате" value={formatMoney(docCollection.total_amount)} tone="brand" />
            <StatCard label="Сбор документов" value={formatMoney(docCollection.collection_fee)} tone="default" />
            <StatCard label="Нотариус" value={formatMoney(docCollection.notary_fee)} tone="default" />
            <StatCard
              label="Комиссия менеджера"
              value={formatMoney(docCollection.manager_commission)}
              tone="success"
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Badge tone={docCollection.status === "paid" ? "success" : "warning"}>
              {documentCollectionStatusLabel(docCollection.status)}
            </Badge>
            {docCollection.paid_date && (
              <span className="text-sm text-slate-600">
                Оплачено {formatDate(docCollection.paid_date)}
              </span>
            )}
          </div>
          {canRecordPayment && docCollection.status !== "paid" && (
            <div className="mt-4">
              <Button disabled={docCollectionSaving} onClick={handleRecordDocumentCollection}>
                {docCollectionSaving ? "Сохранение..." : "Зафиксировать оплату 13 000 ₽"}
              </Button>
            </div>
          )}
          {canRecordPayment && docCollection.status === "paid" && (
            <form onSubmit={handleConvertToBankruptcy} className="mt-6 space-y-4 border-t border-slate-200 pt-6">
              <SectionTitle
                title="Перевести на банкротство"
                description="После успешного сбора документов укажите сумму долга — создастся график рассрочки"
              />
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Сумма долга (от 300 000 ₽)">
                  <Input
                    type="number"
                    min={300000}
                    step={1000}
                    value={convertForm.debt_amount}
                    onChange={(e) =>
                      setConvertForm({ ...convertForm, debt_amount: e.target.value })
                    }
                    required
                  />
                </FormField>
                <FormField label="Дата договора банкротства (необязательно)">
                  <Input
                    type="date"
                    value={convertForm.contract_date}
                    onChange={(e) =>
                      setConvertForm({ ...convertForm, contract_date: e.target.value })
                    }
                  />
                </FormField>
              </div>
              {convertError && <p className="text-sm text-rose-600">{convertError}</p>}
              <Button type="submit" disabled={convertSaving}>
                {convertSaving ? "Перевод..." : "Перевести на банкротство"}
              </Button>
            </form>
          )}
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Дата договора" value={formatDate(client.contract_date)} tone="brand" />
        {detail && isBankruptcy ? (
          <>
            <StatCard label="Сумма долга" value={formatMoney(detail.debt_amount)} tone="default" />
            <StatCard label="Оплачено по графику" value={formatMoney(paidTotal)} tone="success" />
            <StatCard
              label="Остаток по графику"
              value={formatMoney(remainder)}
              tone={remainder > 0 ? "warning" : "success"}
            />
          </>
        ) : (
          <StatCard label="Статус" value={statusLabel(client.status)} tone="default" />
        )}
        {detail && !isBankruptcy && (
          <StatCard
            label="Услуга"
            value={engagementStageLabel(client.engagement_stage)}
            tone="warning"
          />
        )}
      </div>

      {detail && isBankruptcy && isOwner && (
        <Card variant="accent">
          <SectionTitle
            title="Прибыль по клиенту"
            description="Получено по платежам минус обязательные расходы"
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
              label="Остаток по графику"
              value={formatMoney(remainder)}
              tone={remainder > 0 ? "warning" : "success"}
            />
          </div>
        </Card>
      )}

      {detail && isBankruptcy && (
        <>
          {detail.matched_tier && (
            <Card variant="accent">
              <SectionTitle title="Подобранный тариф" />
              <div className="grid gap-4 text-sm md:grid-cols-3">
                <div>
                  <p className="text-slate-500">Диапазон долга</p>
                  <p className="mt-1 font-medium text-slate-900">
                    {formatMoney(detail.matched_tier.min_amount)} –{" "}
                    {formatMoney(detail.matched_tier.max_amount)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Стоимость рассрочки</p>
                  <p className="mt-1 font-medium text-slate-900">
                    {formatMoney(detail.matched_tier.total_cost)}
                  </p>
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
                  График с {formatDate(detail.installment_plan.start_date)} · автоматически
                  сформирован при создании клиента
                </p>
              )}
            </Card>
          )}

          <Card>
            <SectionTitle
              title="Обязательные платежи по процедуре"
              description="Депозит, финансовое управление и судебная пошлина — отдельно от графика рассрочки"
            />
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
                      {canRecordPayment && <th>Действие</th>}
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
                            ) : needsAmount && canRecordPayment ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min={0.01}
                                  step={0.01}
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
                          {canRecordPayment && (
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
          </Card>

          <Card>
            <SectionTitle title="График платежей" />
            {schedule.length === 0 ? (
              <EmptyState>График не сформирован</EmptyState>
            ) : (
              <>
                <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {schedule.map((item) => (
                    <div
                      key={`chart-${item.id}`}
                      className="payment-tile"
                      title={`${formatDate(effectiveDueDate(item))} · ${formatMoney(item.planned_amount)}`}
                    >
                      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
                        <span>Мес. {item.month_number}</span>
                        <span>{paymentProgress(item)}%</span>
                      </div>
                      <ProgressBar value={paymentProgress(item)} tone={progressTone(item.status)} />
                      <p className="mt-2 text-xs text-slate-400">
                        {formatDate(effectiveDueDate(item))}
                        {item.deferred_until && " · отсрочка"}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Месяц</th>
                      <th>Дата</th>
                      <th>План</th>
                      <th>Оплачено</th>
                      <th>Остаток</th>
                      <th>Статус</th>
                      <th>Отсрочка</th>
                      {canRecordPayment && <th>Действие</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((item) => {
                      const rest = remainingAmount(item);
                      return (
                        <tr key={item.id}>
                          <td>{item.month_number}</td>
                          <td>
                            <p>{formatDate(effectiveDueDate(item))}</p>
                            {item.deferred_until && (
                              <p className="text-xs text-amber-600">
                                было {formatDate(item.due_date)}
                              </p>
                            )}
                          </td>
                          <td>{formatMoney(item.planned_amount)}</td>
                          <td>{formatMoney(item.paid_amount)}</td>
                          <td>{formatMoney(rest)}</td>
                          <td>
                            <Badge tone={scheduleTone(item.status)}>
                              {statusLabel(item.status)}
                            </Badge>
                          </td>
                          <td>
                            {item.deferral_comment ? (
                              <div className="max-w-[220px] text-xs text-slate-600">
                                <p className="font-medium text-amber-700">до {formatDate(item.deferred_until!)}</p>
                                <p className="mt-1">{item.deferral_comment}</p>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                          {canRecordPayment && (
                            <td>
                              <div className="flex flex-col gap-2">
                                {rest > 0 ? (
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    disabled={payingId === item.id}
                                    onClick={() => handleQuickPay(item)}
                                  >
                                    {payingId === item.id ? "Сохранение..." : "Внести платёж"}
                                  </Button>
                                ) : (
                                  <span className="text-xs text-slate-400">Оплачено</span>
                                )}
                                {rest > 0 && deferringId === item.id ? (
                                  <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                                    <Input
                                      type="date"
                                      value={deferForm.deferred_until}
                                      onChange={(e) =>
                                        setDeferForm({ ...deferForm, deferred_until: e.target.value })
                                      }
                                    />
                                    <Input
                                      placeholder="Причина невозможности оплаты"
                                      value={deferForm.comment}
                                      onChange={(e) =>
                                        setDeferForm({ ...deferForm, comment: e.target.value })
                                      }
                                    />
                                    <div className="flex gap-2">
                                      <Button type="button" onClick={() => handleDefer(item)}>
                                        Сохранить
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={() => setDeferringId(null)}
                                      >
                                        Отмена
                                      </Button>
                                    </div>
                                  </div>
                                ) : rest > 0 ? (
                                  <Button type="button" variant="ghost" onClick={() => startDefer(item)}>
                                    Отсрочка
                                  </Button>
                                ) : null}
                              </div>
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
          </Card>

          {canRecordPayment && (
            <>
              <Card>
                <SectionTitle title="Зафиксировать платёж вручную" />
                <form onSubmit={handlePayment} className="grid gap-4 md:grid-cols-2">
                  <FormField label="Месяц графика">
                    <Select
                      value={paymentForm.payment_schedule_id}
                      onChange={(e) => handleMonthSelect(e.target.value)}
                    >
                      <option value="">Без привязки к месяцу</option>
                      {schedule.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.month_number} — {formatDate(item.due_date)} (
                          {formatMoney(item.planned_amount)}, остаток{" "}
                          {formatMoney(remainingAmount(item))})
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <Input
                    type="date"
                    value={paymentForm.payment_date}
                    onChange={(e) =>
                      setPaymentForm({ ...paymentForm, payment_date: e.target.value })
                    }
                    required
                  />
                  <Input
                    placeholder="Сумма"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                    required
                  />
                  <Input
                    placeholder="Комментарий"
                    value={paymentForm.comment}
                    onChange={(e) => setPaymentForm({ ...paymentForm, comment: e.target.value })}
                  />
                  <Button type="submit" className="md:col-span-2">
                    Сохранить платёж
                  </Button>
                </form>
              </Card>

              <Card>
                <SectionTitle
                  title="Оформить возврат"
                  description="Возврат уменьшает оплаченную сумму по выбранному месяцу графика."
                />
                <form onSubmit={handleRefund} className="grid gap-4 md:grid-cols-2">
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
                  <Input
                    type="date"
                    value={refundForm.payment_date}
                    onChange={(e) =>
                      setRefundForm({ ...refundForm, payment_date: e.target.value })
                    }
                    required
                  />
                  <Input
                    placeholder="Сумма возврата"
                    value={refundForm.amount}
                    onChange={(e) => setRefundForm({ ...refundForm, amount: e.target.value })}
                    required
                  />
                  <Input
                    placeholder="Причина возврата"
                    value={refundForm.comment}
                    onChange={(e) => setRefundForm({ ...refundForm, comment: e.target.value })}
                  />
                  <Button type="submit" variant="danger" className="md:col-span-2">
                    Оформить возврат
                  </Button>
                </form>
              </Card>
            </>
          )}

          <Card>
            <SectionTitle title="История платежей" />
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
                        {formatDate(payment.payment_date)}
                        {payment.comment ? ` · ${payment.comment}` : ""}
                      </p>
                    </div>
                    {isOwner && (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={deletingId === payment.id}
                        onClick={() => handleDeletePayment(payment.id)}
                      >
                        {deletingId === payment.id ? "Отмена..." : "Отменить"}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {canEditClient && (
            <Card>
              <SectionTitle title="История изменений карточки" />
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
            </Card>
          )}
        </>
      )}
    </div>
  );
}
