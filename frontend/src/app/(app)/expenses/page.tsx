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
import { formatDate, formatMoney, formatMonthLabel, statusLabel } from "@/lib/format";
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
    amount: item.amount,
    pay_day: item.pay_day ? String(item.pay_day) : "",
    sort_order: String(item.sort_order),
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
  setEditForm,
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
  setEditForm: React.Dispatch<React.SetStateAction<EditForm | null>>;
}) {
  if (items.length === 0) return <EmptyState>Статьи не добавлены</EmptyState>;

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>Название</th>
            <th>Категория</th>
            {showPayDay && <th>День выплаты</th>}
            <th>Сумма / мес.</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const isEditing = editingId === item.id && editForm !== null;
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
                      min={0.01}
                      step={0.01}
                      value={editForm.amount}
                      onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                    />
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        disabled={savingId === item.id}
                        onClick={() => onSaveEdit(item.id)}
                      >
                        {savingId === item.id ? "Сохранение..." : "Сохранить"}
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
              <tr key={item.id}>
                <td className="font-medium text-slate-900">{item.name}</td>
                <td>
                  <Badge tone={categoryTone(item.category)}>{statusLabel(item.category)}</Badge>
                </td>
                {showPayDay && <td>{item.pay_day ? `${item.pay_day}-е число` : "—"}</td>}
                <td>{formatMoney(item.amount)}</td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    {showPayDay && (
                      <Button
                        type="button"
                        disabled={recordingId === item.id}
                        onClick={() => onRecordPayment(item)}
                      >
                        {recordingId === item.id ? "Сохранение..." : "Выплата"}
                      </Button>
                    )}
                    <Button type="button" variant="secondary" onClick={() => onStartEdit(item)}>
                      Изменить
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => onDelete(item.id, item.name)}>
                      Удалить
                    </Button>
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
  const [periodMonth, setPeriodMonth] = useState(currentMonthValue());

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
    return parsed.toFixed(2);
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
      await expensesApi.recordPayment(item.id, {
        amount: item.amount,
        payment_date: today,
        period_month: monthToPeriodDate(periodMonth),
        comment: `Зарплата за ${periodMonth}`,
      });
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

  const expenseNameById = useMemo(
    () => new Map(activeExpenses.map((item) => [item.id, item.name])),
    [activeExpenses],
  );

  const paymentsByMonth = useMemo(() => {
    const groups = new Map<string, ExpensePayment[]>();
    for (const payment of payments) {
      const key = payment.period_month.slice(0, 7);
      const bucket = groups.get(key) ?? [];
      bucket.push(payment);
      groups.set(key, bucket);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [payments]);

  const currentMonthPayments = payments.filter(
    (payment) => payment.period_month.slice(0, 7) === periodMonth,
  );

  if (user?.role !== "owner") {
    return <LoadingState text="Доступ только для руководителя" />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Ежемесячные расходы"
        subtitle="Зарплатный проект, производственные расходы и учёт выплат"
      />

      <div className="grid gap-4 md:grid-cols-3">
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

      <Card>
        <SectionTitle
          title="Учёт выплат по месяцам"
          description="Выберите месяц для фиксации новых выплат. История сохраняется в базе."
        />
        <div className="max-w-xs">
          <FormField label="Месяц для новой выплаты">
            <Input type="month" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} />
          </FormField>
        </div>
        {currentMonthPayments.length > 0 && (
          <p className="mt-3 text-sm text-emerald-700">
            За {formatMonthLabel(periodMonth)} зафиксировано выплат: {currentMonthPayments.length}
          </p>
        )}
      </Card>

      <Card variant="accent">
        <SectionTitle title="Добавить расход" />
        <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
            min={0.01}
            step={0.01}
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

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <Card>
        <SectionTitle
          title="Зарплатный проект"
          description="Сотрудники, день выплаты и фиксация зарплатных выплат"
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
            setEditForm={setEditForm}
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
          title="История выплат по месяцам"
          description="Все зафиксированные выплаты сохраняются и доступны для просмотра"
        />
        {loading ? (
          <LoadingState text="Загрузка выплат..." />
        ) : paymentsByMonth.length === 0 ? (
          <EmptyState>Выплаты ещё не зафиксированы</EmptyState>
        ) : (
          <div className="space-y-6">
            {paymentsByMonth.map(([month, monthPayments]) => {
              const monthTotal = monthPayments.reduce(
                (sum, payment) => sum + Number(payment.amount),
                0,
              );
              return (
                <div key={month} className="rounded-2xl border border-slate-200/80 bg-slate-50/40 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold capitalize text-slate-900">
                      {formatMonthLabel(month)}
                    </h3>
                    <p className="text-sm font-semibold text-brand-700">
                      Итого: {formatMoney(monthTotal)}
                    </p>
                  </div>
                  <div className="space-y-3">
                    {monthPayments.map((payment) => (
                      <div key={payment.id} className="history-item">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {expenseNameById.get(payment.expense_id) ?? "Статья расхода"}
                          </p>
                          <p className="text-sm text-slate-500">
                            {formatDate(payment.payment_date)}
                            {payment.comment ? ` · ${payment.comment}` : ""}
                          </p>
                        </div>
                        <p className="font-bold text-brand-700">{formatMoney(payment.amount)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
