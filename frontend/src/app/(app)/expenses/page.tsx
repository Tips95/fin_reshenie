"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
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
import { ApiRequestError, expensesApi } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  formatAmountInput,
  formatDate,
  formatMoney,
  formatMonthLabel,
  statusLabel,
} from "@/lib/format";
import type { ExpenseCategory, ExpenseGroup, ExpensePayment, OperatingExpense } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

const emptyForm = {
  name: "",
  category: "salary" as ExpenseCategory,
  expense_group: "salary_project" as ExpenseGroup,
  amount: "",
  pay_day: "10",
  sort_order: "0",
};

type EditForm = {
  name: string;
  category: ExpenseCategory;
  expense_group: ExpenseGroup;
  amount: string;
  pay_day: string;
  sort_order: string;
};

type PaymentEditForm = {
  amount: string;
  payment_date: string;
};

function categoryTone(category: ExpenseCategory): "default" | "success" | "warning" | "danger" {
  if (category === "salary") return "warning";
  if (category === "rent") return "danger";
  if (category === "utilities") return "default";
  return "success";
}

function toEditForm(item: OperatingExpense): EditForm {
  return {
    name: item.name,
    category: item.category,
    expense_group: item.expense_group,
    amount: formatAmountInput(item.amount),
    pay_day: item.pay_day ? String(item.pay_day) : "",
    sort_order: String(item.sort_order),
  };
}

function toPaymentEditForm(payment: ExpensePayment): PaymentEditForm {
  return {
    amount: formatAmountInput(payment.amount),
    payment_date: payment.payment_date,
  };
}

function currentMonthValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function monthToPeriodDate(month: string): string {
  return `${month}-01`;
}

function ExpenseTable({
  items,
  editingId,
  editForm,
  savingId,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onRecordPayment,
  recordingId,
  showPayDay,
  trackMonthlyPayments,
  periodMonth,
  paymentByExpenseId,
  editingPaymentId,
  paymentEditForm,
  savingPaymentId,
  onStartPaymentEdit,
  onCancelPaymentEdit,
  onSavePaymentEdit,
  setEditForm,
  setPaymentEditForm,
}: {
  items: OperatingExpense[];
  editingId: string | null;
  editForm: EditForm | null;
  savingId: string | null;
  onStartEdit: (item: OperatingExpense) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onRecordPayment: (item: OperatingExpense) => void;
  recordingId: string | null;
  showPayDay: boolean;
  trackMonthlyPayments?: boolean;
  periodMonth?: string;
  paymentByExpenseId?: Map<string, ExpensePayment>;
  editingPaymentId?: string | null;
  paymentEditForm?: PaymentEditForm | null;
  savingPaymentId?: string | null;
  onStartPaymentEdit?: (payment: ExpensePayment) => void;
  onCancelPaymentEdit?: () => void;
  onSavePaymentEdit?: (paymentId: string) => void;
  setEditForm: React.Dispatch<React.SetStateAction<EditForm | null>>;
  setPaymentEditForm?: React.Dispatch<React.SetStateAction<PaymentEditForm | null>>;
}) {
  if (items.length === 0) return <EmptyState>Статьи не добавлены</EmptyState>;

  return (
    <div className="overflow-x-auto">
      <table className="data-table table-cards text-xs">
        <thead>
          <tr>
            <th>Название</th>
            <th>Категория</th>
            {showPayDay && <th>День</th>}
            <th className="text-right">План / мес.</th>
            {trackMonthlyPayments && periodMonth && (
              <>
                <th className="text-right">Выплачено</th>
                <th>Статус</th>
              </>
            )}
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const payment = paymentByExpenseId?.get(item.id);
            const isPaid = Boolean(payment);
            const isEditing = editingId === item.id && editForm !== null;
            const isEditingPayment =
              payment &&
              editingPaymentId === payment.id &&
              paymentEditForm &&
              setPaymentEditForm;

            if (isEditing) {
              return (
                <tr key={item.id} className="is-editing">
                  <td>
                    <Input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </td>
                  <td>
                    <Select
                      value={editForm.category}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          category: e.target.value as ExpenseCategory,
                        })
                      }
                    >
                      <option value="salary">Зарплата</option>
                      <option value="rent">Аренда</option>
                      <option value="utilities">Коммунальные</option>
                      <option value="marketing">Маркетинг</option>
                      <option value="other">Прочее</option>
                    </Select>
                  </td>
                  {showPayDay && (
                    <td>
                      <Input
                        type="number"
                        min={1}
                        max={31}
                        value={editForm.pay_day}
                        onChange={(e) => setEditForm({ ...editForm, pay_day: e.target.value })}
                      />
                    </td>
                  )}
                  <td>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      className="text-right"
                      value={editForm.amount}
                      onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                    />
                  </td>
                  {trackMonthlyPayments && periodMonth && <td colSpan={2} />}
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        disabled={savingId === item.id}
                        onClick={() => onSaveEdit(item.id)}
                      >
                        {savingId === item.id ? "…" : "Сохранить"}
                      </Button>
                      <Button type="button" variant="secondary" onClick={onCancelEdit}>
                        Отмена
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            }

            return (
              <tr
                key={item.id}
                className={cn(
                  trackMonthlyPayments && isPaid && "bg-status-success-bg/70 hover:bg-status-success-bg",
                )}
              >
                <td data-label="Название" className="font-medium text-foreground">{item.name}</td>
                <td data-label="Категория">
                  <Badge tone={categoryTone(item.category)}>{statusLabel(item.category)}</Badge>
                </td>
                {showPayDay && (
                  <td data-label="День">{item.pay_day ? `${item.pay_day}-е` : "—"}</td>
                )}
                <td data-label="План / мес." className="text-right tabular-nums">
                  {formatMoney(item.amount)}
                </td>
                {trackMonthlyPayments && periodMonth && (
                  <>
                    <td data-label="Выплачено" className="text-right">
                      {isEditingPayment ? (
                        <div className="flex flex-col gap-1">
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            className="w-24 py-0.5 text-right"
                            value={paymentEditForm.amount}
                            onChange={(e) =>
                              setPaymentEditForm({ ...paymentEditForm, amount: e.target.value })
                            }
                          />
                          <Input
                            type="date"
                            className="w-32 py-0.5"
                            value={paymentEditForm.payment_date}
                            onChange={(e) =>
                              setPaymentEditForm({
                                ...paymentEditForm,
                                payment_date: e.target.value,
                              })
                            }
                          />
                        </div>
                      ) : isPaid ? (
                        <div className="leading-tight">
                          <p className="whitespace-nowrap font-semibold text-status-success-text">
                            {formatMoney(payment!.amount)}
                          </p>
                          <p className="text-[11px] text-muted">{formatDate(payment!.payment_date)}</p>
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td data-label="Статус">
                      {isPaid ? (
                        <Badge tone="success">Выплачено</Badge>
                      ) : (
                        <Badge tone="warning">Ожидает</Badge>
                      )}
                    </td>
                  </>
                )}
                <td data-label="Действия">
                  <div className="flex flex-wrap justify-end gap-1">
                    {trackMonthlyPayments && periodMonth && isEditingPayment && payment && (
                      <>
                        <Button
                          type="button"
                          disabled={savingPaymentId === payment.id}
                          onClick={() => onSavePaymentEdit?.(payment.id)}
                        >
                          {savingPaymentId === payment.id ? "…" : "Сохранить"}
                        </Button>
                        <Button type="button" variant="secondary" onClick={onCancelPaymentEdit}>
                          Отмена
                        </Button>
                      </>
                    )}
                    {trackMonthlyPayments &&
                      periodMonth &&
                      !isEditingPayment &&
                      isPaid &&
                      payment && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => onStartPaymentEdit?.(payment)}
                        >
                          Сумма
                        </Button>
                      )}
                    {trackMonthlyPayments && periodMonth && !isPaid && showPayDay && (
                      <Button
                        type="button"
                        disabled={recordingId === item.id}
                        onClick={() => onRecordPayment(item)}
                      >
                        {recordingId === item.id ? "…" : "Выплатить"}
                      </Button>
                    )}
                    {!isEditingPayment && (
                      <>
                        <Button type="button" variant="ghost" onClick={() => onStartEdit(item)}>
                          Статья
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => onDelete(item.id, item.name)}>
                          ×
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ExpensesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [expenses, setExpenses] = useState<OperatingExpense[]>([]);
  const [payments, setPayments] = useState<ExpensePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [paymentEditForm, setPaymentEditForm] = useState<PaymentEditForm | null>(null);
  const [savingPaymentId, setSavingPaymentId] = useState<string | null>(null);
  const [periodMonth, setPeriodMonth] = useState(currentMonthValue());
  const [historyMonthFilter, setHistoryMonthFilter] = useState<string>("");

  useEffect(() => {
    if (user && user.role !== "owner") {
      router.replace("/");
    }
  }, [user, router]);

  async function loadData() {
    setLoading(true);
    try {
      const [expenseData, paymentData] = await Promise.all([
        expensesApi.list(),
        expensesApi.listPayments(),
      ]);
      setExpenses(expenseData);
      setPayments(paymentData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user?.role === "owner") {
      void loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  function normalizeAmount(value: string): string {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error("Укажите сумму больше 0");
    }
    return Math.round(parsed).toFixed(2);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await expensesApi.create({
        name: form.name.trim(),
        category: form.category,
        expense_group: form.expense_group,
        amount: normalizeAmount(form.amount),
        pay_day: form.expense_group === "salary_project" ? Number(form.pay_day) || null : null,
        sort_order: Number(form.sort_order) || 0,
        is_active: true,
      });
      setForm(emptyForm);
      loadData();
    } catch (err) {
      setError(
        err instanceof ApiRequestError || err instanceof Error
          ? err.message
          : "Ошибка сохранения",
      );
    }
  }

  function startEdit(item: OperatingExpense) {
    setEditingId(item.id);
    setEditForm(toEditForm(item));
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
  }

  function startPaymentEdit(payment: ExpensePayment) {
    setEditingPaymentId(payment.id);
    setPaymentEditForm(toPaymentEditForm(payment));
    setError(null);
  }

  function cancelPaymentEdit() {
    setEditingPaymentId(null);
    setPaymentEditForm(null);
  }

  async function handleSaveEdit(itemId: string) {
    if (!editForm) return;
    setSavingId(itemId);
    setError(null);
    try {
      await expensesApi.update(itemId, {
        name: editForm.name.trim(),
        category: editForm.category,
        expense_group: editForm.expense_group,
        amount: normalizeAmount(editForm.amount),
        pay_day:
          editForm.expense_group === "salary_project" && editForm.pay_day
            ? Number(editForm.pay_day)
            : null,
        sort_order: Number(editForm.sort_order) || 0,
      });
      cancelEdit();
      loadData();
    } catch (err) {
      setError(
        err instanceof ApiRequestError || err instanceof Error
          ? err.message
          : "Ошибка сохранения",
      );
    } finally {
      setSavingId(null);
    }
  }

  async function handleSavePaymentEdit(paymentId: string) {
    if (!paymentEditForm) return;
    setSavingPaymentId(paymentId);
    setError(null);
    try {
      await expensesApi.updatePayment(paymentId, {
        amount: normalizeAmount(paymentEditForm.amount),
        payment_date: paymentEditForm.payment_date,
      });
      cancelPaymentEdit();
      loadData();
    } catch (err) {
      setError(
        err instanceof ApiRequestError || err instanceof Error
          ? err.message
          : "Не удалось сохранить выплату",
      );
    } finally {
      setSavingPaymentId(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Удалить статью расхода «${name}»?`)) return;
    setError(null);
    try {
      await expensesApi.delete(id);
      if (editingId === id) cancelEdit();
      loadData();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Не удалось удалить расход",
      );
    }
  }

  async function handleRecordPayment(item: OperatingExpense) {
    setRecordingId(item.id);
    setError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const existing = paymentByExpenseId.get(item.id);
      const payload = {
        amount: normalizeAmount(formatAmountInput(item.amount)),
        payment_date: today,
        period_month: monthToPeriodDate(periodMonth),
        comment: `Зарплата за ${formatMonthLabel(periodMonth)}`,
      };

      if (existing) {
        await expensesApi.updatePayment(existing.id, payload);
      } else {
        await expensesApi.recordPayment(item.id, payload);
      }
      loadData();
    } catch (err) {
      setError(
        err instanceof ApiRequestError || err instanceof Error
          ? err.message
          : "Не удалось зафиксировать выплату",
      );
    } finally {
      setRecordingId(null);
    }
  }

  const activeExpenses = expenses.filter((item) => item.is_active);
  const salaryExpenses = activeExpenses.filter((item) => item.expense_group === "salary_project");
  const productionExpenses = activeExpenses.filter((item) => item.expense_group === "production");
  const salaryTotal = salaryExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const productionTotal = productionExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const totalMonthly = salaryTotal + productionTotal;

  const paymentByExpenseId = useMemo(() => {
    const map = new Map<string, ExpensePayment>();
    for (const payment of payments) {
      if (payment.period_month.slice(0, 7) !== periodMonth) continue;
      const existing = map.get(payment.expense_id);
      if (!existing || payment.payment_date > existing.payment_date) {
        map.set(payment.expense_id, payment);
      }
    }
    return map;
  }, [payments, periodMonth]);

  const currentMonthSalaryPayments = useMemo(
    () =>
      payments.filter(
        (payment) =>
          payment.period_month.slice(0, 7) === periodMonth &&
          payment.expense_group === "salary_project",
      ),
    [payments, periodMonth],
  );

  const monthPaidTotal = currentMonthSalaryPayments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  );
  const monthPaidCount = paymentByExpenseId.size;
  const monthPendingCount = Math.max(salaryExpenses.length - monthPaidCount, 0);

  const filteredHistory = useMemo(() => {
    const items = historyMonthFilter
      ? payments.filter((payment) => payment.period_month.slice(0, 7) === historyMonthFilter)
      : payments;
    return [...items].sort((a, b) => {
      const monthCmp = b.period_month.localeCompare(a.period_month);
      if (monthCmp !== 0) return monthCmp;
      return b.payment_date.localeCompare(a.payment_date);
    });
  }, [payments, historyMonthFilter]);

  if (user?.role !== "owner") {
    return <LoadingState text="Доступ только для руководителя" />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Ежемесячные расходы"
        subtitle="Зарплатный проект, производственные расходы и учёт выплат"
      />

      <div className="grid gap-2 md:grid-cols-3">
        <StatCard label="Зарплатный проект" value={formatMoney(salaryTotal)} tone="warning" />
        <StatCard
          label="Производственные расходы"
          value={formatMoney(productionTotal)}
          tone="brand"
        />
        <StatCard
          label="Итого в месяц"
          value={formatMoney(totalMonthly)}
          tone="danger"
          hint={`${activeExpenses.length} активных статей`}
        />
      </div>

      <Card variant="accent">
        <SectionTitle
          title="Выплаты за месяц"
          description="Выберите месяц — выплаченные строки подсветятся зелёным, сумму можно изменить"
        />
        <div className="grid gap-3 md:grid-cols-[minmax(0,220px)_1fr] md:items-end">
          <FormField label="Расчётный месяц">
            <Input
              type="month"
              value={periodMonth}
              onChange={(e) => {
                setPeriodMonth(e.target.value);
                cancelPaymentEdit();
              }}
            />
          </FormField>
          <div className="grid gap-2 sm:grid-cols-3">
            <StatCard
              label="Выплачено"
              value={formatMoney(monthPaidTotal)}
              tone="success"
              hint={`${monthPaidCount} из ${salaryExpenses.length}`}
            />
            <StatCard
              label="Ожидает"
              value={String(monthPendingCount)}
              tone="warning"
              hint="сотрудников без выплаты"
            />
            <StatCard
              label="План по зарплате"
              value={formatMoney(salaryTotal)}
              tone="default"
            />
          </div>
        </div>
      </Card>

      <Card variant="accent">
        <SectionTitle title="Добавить расход" />
        <form onSubmit={handleCreate} className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          <Input
            placeholder="Название (ФИО или статья)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Select
            value={form.expense_group}
            onChange={(e) =>
              setForm({
                ...form,
                expense_group: e.target.value as ExpenseGroup,
                category: e.target.value === "salary_project" ? "salary" : form.category,
              })
            }
          >
            <option value="salary_project">Зарплатный проект</option>
            <option value="production">Производственные расходы</option>
          </Select>
          <Select
            value={form.category}
            onChange={(e) =>
              setForm({ ...form, category: e.target.value as ExpenseCategory })
            }
          >
            <option value="salary">Зарплата</option>
            <option value="rent">Аренда</option>
            <option value="utilities">Коммунальные</option>
            <option value="marketing">Маркетинг</option>
            <option value="other">Прочее</option>
          </Select>
          <Input
            placeholder="Сумма в месяц"
            type="number"
            min={1}
            step={1}
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            required
          />
          {form.expense_group === "salary_project" && (
            <Input
              placeholder="День выплаты (1-31)"
              type="number"
              min={1}
              max={31}
              value={form.pay_day}
              onChange={(e) => setForm({ ...form, pay_day: e.target.value })}
            />
          )}
          <Input
            placeholder="Порядок сортировки"
            type="number"
            min={0}
            step={1}
            value={form.sort_order}
            onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
          />
          <Button type="submit" className="md:col-span-2 xl:col-span-3">
            Добавить
          </Button>
        </form>
      </Card>

      {error && <p className="alert-danger">{error}</p>}

      <Card>
        <SectionTitle
          title={`Зарплатный проект · ${formatMonthLabel(periodMonth)}`}
          description="Выплаты за выбранный месяц — зелёная строка значит выплачено"
        />
        {loading ? (
          <LoadingState text="Загрузка..." />
        ) : (
          <ExpenseTable
            items={salaryExpenses}
            editingId={editingId}
            editForm={editForm}
            savingId={savingId}
            onStartEdit={startEdit}
            onCancelEdit={cancelEdit}
            onSaveEdit={handleSaveEdit}
            onDelete={handleDelete}
            onRecordPayment={handleRecordPayment}
            recordingId={recordingId}
            showPayDay
            trackMonthlyPayments
            periodMonth={periodMonth}
            paymentByExpenseId={paymentByExpenseId}
            editingPaymentId={editingPaymentId}
            paymentEditForm={paymentEditForm}
            savingPaymentId={savingPaymentId}
            onStartPaymentEdit={startPaymentEdit}
            onCancelPaymentEdit={cancelPaymentEdit}
            onSavePaymentEdit={handleSavePaymentEdit}
            setEditForm={setEditForm}
            setPaymentEditForm={setPaymentEditForm}
          />
        )}
      </Card>

      <Card>
        <SectionTitle
          title="Производственные расходы"
          description="Аренда, коммунальные, маркетинг и прочие затраты"
        />
        {loading ? (
          <LoadingState text="Загрузка..." />
        ) : (
          <ExpenseTable
            items={productionExpenses}
            editingId={editingId}
            editForm={editForm}
            savingId={savingId}
            onStartEdit={startEdit}
            onCancelEdit={cancelEdit}
            onSaveEdit={handleSaveEdit}
            onDelete={handleDelete}
            onRecordPayment={handleRecordPayment}
            recordingId={recordingId}
            showPayDay={false}
            setEditForm={setEditForm}
          />
        )}
      </Card>

      <Card>
        <SectionTitle
          title="История выплат"
          description="Кто, за какой месяц и сколько получил — суммы можно исправить"
        />
        <div className="mb-3 max-w-xs">
          <FormField label="Фильтр по месяцу">
            <Select
              value={historyMonthFilter}
              onChange={(e) => setHistoryMonthFilter(e.target.value)}
            >
              <option value="">Все месяцы</option>
              {Array.from(new Set(payments.map((p) => p.period_month.slice(0, 7))))
                .sort((a, b) => b.localeCompare(a))
                .map((month) => (
                  <option key={month} value={month}>
                    {formatMonthLabel(month)}
                  </option>
                ))}
            </Select>
          </FormField>
        </div>
        {loading ? (
          <LoadingState text="Загрузка выплат..." />
        ) : filteredHistory.length === 0 ? (
          <EmptyState>Выплаты ещё не зафиксированы</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table table-cards text-xs">
              <thead>
                <tr>
                  <th>Месяц</th>
                  <th>Получатель</th>
                  <th className="text-right">Сумма</th>
                  <th>Дата выплаты</th>
                  <th>Зафиксировал</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((payment) => {
                  const isEditing = editingPaymentId === payment.id && paymentEditForm;
                  const isCurrentMonth = payment.period_month.slice(0, 7) === periodMonth;

                  return (
                    <tr
                      key={payment.id}
                      className={cn(isCurrentMonth && "bg-status-success-bg/40")}
                    >
                      <td data-label="Месяц" className="capitalize">
                        {formatMonthLabel(payment.period_month.slice(0, 7))}
                      </td>
                      <td data-label="Получатель" className="font-medium text-foreground">
                        {payment.expense_name ?? "Статья расхода"}
                      </td>
                      <td data-label="Сумма" className="text-right">
                        {isEditing ? (
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            className="w-24 py-0.5 text-right"
                            value={paymentEditForm.amount}
                            onChange={(e) =>
                              setPaymentEditForm({ ...paymentEditForm, amount: e.target.value })
                            }
                          />
                        ) : (
                          <span className="font-semibold text-status-success-text">
                            {formatMoney(payment.amount)}
                          </span>
                        )}
                      </td>
                      <td data-label="Дата выплаты">
                        {isEditing ? (
                          <Input
                            type="date"
                            className="w-32 py-0.5"
                            value={paymentEditForm.payment_date}
                            onChange={(e) =>
                              setPaymentEditForm({
                                ...paymentEditForm,
                                payment_date: e.target.value,
                              })
                            }
                          />
                        ) : (
                          formatDate(payment.payment_date)
                        )}
                      </td>
                      <td data-label="Зафиксировал" className="text-muted">
                        {payment.created_by_name ?? "—"}
                      </td>
                      <td data-label="">
                        <div className="flex flex-wrap justify-end gap-1">
                          {isEditing ? (
                            <>
                              <Button
                                type="button"
                                disabled={savingPaymentId === payment.id}
                                onClick={() => handleSavePaymentEdit(payment.id)}
                              >
                                {savingPaymentId === payment.id ? "…" : "OK"}
                              </Button>
                              <Button type="button" variant="ghost" onClick={cancelPaymentEdit}>
                                ×
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => startPaymentEdit(payment)}
                            >
                              Изменить
                            </Button>
                          )}
                        </div>
                      </td>
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
