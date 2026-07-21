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
  SectionTitle,
  Select,
  StatCard,
} from "@/components/ui";
import { ApiRequestError, retailApi } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/format";
import type { RetailContractDetail } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

function statusTone(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "completed") return "success";
  if (status === "overdue") return "danger";
  if (status === "active") return "warning";
  return "default";
}

function statusText(status: string): string {
  if (status === "completed") return "Завершён";
  if (status === "overdue") return "Просрочен";
  if (status === "active") return "Активен";
  if (status === "cancelled") return "Отменён";
  return status;
}

export default function RetailContractDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [contract, setContract] = useState<RetailContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    payment_date: new Date().toISOString().slice(0, 10),
    payment_type: "monthly",
    payment_schedule_id: "",
    comment: "",
  });
  const [overdueForm, setOverdueForm] = useState({
    action_date: new Date().toISOString().slice(0, 10),
    comment: "",
    promised_date: "",
    status: "in_progress",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await retailApi.getContract(params.id);
      setContract(data);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePayment(event: React.FormEvent) {
    event.preventDefault();
    if (!contract) return;
    setSaving(true);
    try {
      await retailApi.recordPayment(contract.id, {
        ...paymentForm,
        payment_schedule_id: paymentForm.payment_schedule_id || undefined,
      });
      setPaymentForm({
        amount: "",
        payment_date: new Date().toISOString().slice(0, 10),
        payment_type: "monthly",
        payment_schedule_id: "",
        comment: "",
      });
      await load();
    } catch (error) {
      alert(error instanceof ApiRequestError ? error.message : "Не удалось сохранить платёж");
    } finally {
      setSaving(false);
    }
  }

  async function handleOverdueLog(event: React.FormEvent) {
    event.preventDefault();
    if (!contract) return;
    setSaving(true);
    try {
      await retailApi.createOverdueLog(contract.id, {
        ...overdueForm,
        promised_date: overdueForm.promised_date || undefined,
      });
      setOverdueForm({
        action_date: new Date().toISOString().slice(0, 10),
        comment: "",
        promised_date: "",
        status: "in_progress",
      });
      await load();
    } catch (error) {
      alert(error instanceof ApiRequestError ? error.message : "Не удалось сохранить запись");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteContract() {
    if (!contract) return;
    if (
      !window.confirm(
        `Удалить договор «${contract.product_name}» и все платежи без возможности восстановления?`,
      )
    ) {
      return;
    }
    if (!window.confirm("Подтвердите окончательное удаление.")) {
      return;
    }

    setDeleting(true);
    try {
      await retailApi.deleteContract(contract.id);
      router.push("/retail/contracts");
    } catch (error) {
      alert(error instanceof ApiRequestError ? error.message : "Не удалось удалить договор");
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeletePayment(paymentId: string) {
    if (
      !window.confirm(
        "Отменить этот платёж? Запись будет удалена, график пересчитается.",
      )
    ) {
      return;
    }

    setDeletingPaymentId(paymentId);
    try {
      await retailApi.deletePayment(paymentId);
      await load();
    } catch (error) {
      alert(error instanceof ApiRequestError ? error.message : "Не удалось отменить платёж");
    } finally {
      setDeletingPaymentId(null);
    }
  }

  if (loading) return <LoadingState text="Загрузка договора..." />;
  if (!contract) return <EmptyState>Договор не найден</EmptyState>;

  return (
    <div className="space-y-4">
      <PageHeader
        title={contract.product_name}
        subtitle={`${contract.client_name} · ${contract.investor_name}`}
        back={<BackLink href="/retail/contracts">К договорам</BackLink>}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {isOwner && (
              <Button variant="danger" disabled={deleting} onClick={handleDeleteContract}>
                {deleting ? "Удаление..." : "Удалить договор"}
              </Button>
            )}
            <Badge tone={statusTone(contract.status)}>{statusText(contract.status)}</Badge>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Цена товара" value={formatMoney(contract.product_price)} tone="default" />
        <StatCard label="Наценка" value={`${contract.markup_percent}%`} tone="brand" />
        <StatCard label="Итого" value={formatMoney(contract.total_amount)} tone="default" />
        <StatCard label="Первоначальный взнос" value={formatMoney(contract.down_payment)} tone="warning" />
        <StatCard label="В рассрочку" value={formatMoney(contract.financed_amount)} tone="default" />
        <StatCard label="Ежемесячно" value={formatMoney(contract.monthly_payment)} tone="default" />
        <StatCard label="Получено" value={formatMoney(contract.collected_total)} tone="success" />
        <StatCard label="Остаток" value={formatMoney(contract.remainder_total)} tone="warning" />
      </div>

      <Card>
        <SectionTitle title="График платежей" />
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Месяц</th>
                <th>Дата</th>
                <th>План</th>
                <th>Оплачено</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {contract.payment_schedule.map((item) => (
                <tr key={item.id}>
                  <td>{item.month_number}</td>
                  <td>{formatDate(item.due_date)}</td>
                  <td>{formatMoney(item.planned_amount)}</td>
                  <td>{formatMoney(item.paid_amount)}</td>
                  <td>{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <SectionTitle title="Внести платёж" description="Первоначальный взнос идёт в кассу инвестора" />
        <form onSubmit={handlePayment} className="grid gap-4 md:grid-cols-2">
          <FormField label="Тип платежа">
            <Select
              value={paymentForm.payment_type}
              onChange={(e) => setPaymentForm({ ...paymentForm, payment_type: e.target.value })}
            >
              <option value="down_payment">Первоначальный взнос</option>
              <option value="monthly">Ежемесячный</option>
              <option value="early_repayment">Досрочное погашение</option>
            </Select>
          </FormField>
          {paymentForm.payment_type === "monthly" && (
            <FormField label="Месяц графика">
              <Select
                value={paymentForm.payment_schedule_id}
                onChange={(e) =>
                  setPaymentForm({ ...paymentForm, payment_schedule_id: e.target.value })
                }
                required
              >
                <option value="">Выберите месяц</option>
                {contract.payment_schedule.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.month_number} — {formatDate(item.due_date)} ({formatMoney(item.planned_amount)})
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <Input
            type="date"
            value={paymentForm.payment_date}
            onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
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
            className="md:col-span-2"
          />
          <Button type="submit" disabled={saving} className="md:col-span-2">
            {saving ? "Сохранение..." : "Зафиксировать платёж"}
          </Button>
        </form>
      </Card>

      {contract.status === "overdue" && (
        <Card>
          <SectionTitle title="Работа с просрочкой" />
          <form onSubmit={handleOverdueLog} className="grid gap-4 md:grid-cols-2">
            <Input
              type="date"
              value={overdueForm.action_date}
              onChange={(e) => setOverdueForm({ ...overdueForm, action_date: e.target.value })}
              required
            />
            <Select
              value={overdueForm.status}
              onChange={(e) => setOverdueForm({ ...overdueForm, status: e.target.value })}
            >
              <option value="in_progress">В работе</option>
              <option value="promised">Обещал оплатить</option>
              <option value="no_contact">Не выходит на связь</option>
              <option value="closed">Закрыто</option>
            </Select>
            <Input
              type="date"
              value={overdueForm.promised_date}
              onChange={(e) => setOverdueForm({ ...overdueForm, promised_date: e.target.value })}
            />
            <Input
              placeholder="Комментарий"
              value={overdueForm.comment}
              onChange={(e) => setOverdueForm({ ...overdueForm, comment: e.target.value })}
              className="md:col-span-2"
              required
            />
            <Button type="submit" disabled={saving} className="md:col-span-2">
              {saving ? "Сохранение..." : "Добавить запись"}
            </Button>
          </form>
          <div className="mt-6 space-y-3">
            {contract.overdue_logs.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
                <p className="font-medium text-slate-900">{formatDate(entry.action_date)} · {entry.status}</p>
                <p className="mt-1 text-slate-600">{entry.comment}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle title="История платежей" />
        {contract.payments.length === 0 ? (
          <EmptyState>Платежей пока нет</EmptyState>
        ) : (
          <div className="space-y-3">
            {contract.payments.map((payment) => (
              <div key={payment.id} className="history-item">
                <div>
                  <p className="font-medium text-slate-900">{formatMoney(payment.amount)}</p>
                  <p className="text-sm text-slate-500">
                    {payment.payment_type} · {formatDate(payment.payment_date)}
                    {payment.comment ? ` · ${payment.comment}` : ""}
                  </p>
                </div>
                {isOwner && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={deletingPaymentId === payment.id}
                    onClick={() => handleDeletePayment(payment.id)}
                  >
                    {deletingPaymentId === payment.id ? "Отмена..." : "Отменить"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
