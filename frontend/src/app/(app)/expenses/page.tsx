"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Badge,
  Button,
  EmptyState,
  FormField,
  Input,
  LoadingState,
  Metric,
  MetricStrip,
  PageHeader,
  Panel,
  SectionNav,
  Select,
} from "@/components/ui";
import { ApiRequestError, analyticsApi, civilCasesApi, clientsApi, expensesApi } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  formatAmountInput,
  formatDate,
  formatMoney,
  formatMonthLabel,
  formatShortName,
  statusLabel,
} from "@/lib/format";
import type {
  CivilShareLine,
  CivilSharesOverview,
  ExpenseCategory,
  ExpenseGroup,
  ExpensePayment,
  ManagerFirstCommissionsOverview,
  MandatoryOutflowsOverview,
  OneTimeExpense,
  OperatingExpense,
} from "@/lib/types";
import { AgentPayouts } from "@/modules/agents/AgentPayouts";
import { PayeeRow, PayoutTracking } from "@/modules/expenses/PayoutTracking";
import { useAuth } from "@/modules/auth/AuthProvider";

const EXPENSE_SECTIONS = [
  { id: "manager-payouts", label: "Менеджерские" },
  { id: "agent-payouts", label: "Удалённые" },
  { id: "civil-shares", label: "Гражданка" },
  { id: "deposit-fin", label: "Депозит и фин." },
  { id: "one-time", label: "Разовые" },
  { id: "salary", label: "Зарплата" },
  { id: "production", label: "Производственные" },
  { id: "add-expense", label: "Новая статья" },
  { id: "history", label: "История" },
] as const;

const emptyOneTimeForm = {
  name: "",
  amount: "",
  expense_date: new Date().toISOString().slice(0, 10),
  comment: "",
};

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
    <div className="overflow-x-auto rounded-lg border border-border">
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
            <th className="text-right">Действия</th>
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
                  trackMonthlyPayments && isPaid && "bg-status-success-bg hover:bg-status-success-bg",
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
                          Изменить
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label={`Удалить ${item.name}`}
                          title="Удалить статью"
                          onClick={() => onDelete(item.id, item.name)}
                        >
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
  const [oneTimeExpenses, setOneTimeExpenses] = useState<OneTimeExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [oneTimeForm, setOneTimeForm] = useState(emptyOneTimeForm);
  const [oneTimeSaving, setOneTimeSaving] = useState(false);
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
  const [managerPayouts, setManagerPayouts] = useState<ManagerFirstCommissionsOverview | null>(null);
  const [civilShares, setCivilShares] = useState<CivilSharesOverview | null>(null);
  const [mandatoryOutflows, setMandatoryOutflows] = useState<MandatoryOutflowsOverview | null>(null);
  const [expandedManagers, setExpandedManagers] = useState<Record<string, boolean>>({});
  const [markingClientId, setMarkingClientId] = useState<string | null>(null);
  const [markingManagerKey, setMarkingManagerKey] = useState<string | null>(null);
  const [markingShareKey, setMarkingShareKey] = useState<string | null>(null);
  const [markingSharePayeeId, setMarkingSharePayeeId] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== "owner") {
      router.replace("/");
    }
  }, [user, router]);

  async function loadData() {
    setLoading(true);
    try {
      // Always load the working period; also load history month when it differs.
      // Never request the full unbounded payment list.
      const historyMonth = historyMonthFilter || periodMonth;
      const [expenseData, periodPayments, historyPayments, oneTimeData, payoutData, shareData, outflowData] =
        await Promise.all([
          expensesApi.list(),
          expensesApi.listPayments({ period_month: periodMonth }),
          historyMonth === periodMonth
            ? Promise.resolve([] as ExpensePayment[])
            : expensesApi.listPayments({ period_month: historyMonth }),
          expensesApi.listOneTime({ period_month: periodMonth }),
          analyticsApi.managerFirstCommissions(periodMonth).catch(() => null),
          analyticsApi.civilShares(periodMonth).catch(() => null),
          analyticsApi.mandatoryOutflows(periodMonth).catch(() => null),
        ]);
      const merged = new Map<string, ExpensePayment>();
      for (const payment of [...periodPayments, ...historyPayments]) {
        merged.set(payment.id, payment);
      }
      setExpenses(expenseData);
      setPayments(Array.from(merged.values()));
      setOneTimeExpenses(oneTimeData);
      setManagerPayouts(payoutData);
      setCivilShares(shareData);
      setMandatoryOutflows(outflowData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user?.role === "owner") {
      void loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, periodMonth, historyMonthFilter]);

  async function refreshManagerPayouts() {
    const payoutData = await analyticsApi.managerFirstCommissions(periodMonth);
    setManagerPayouts(payoutData);
  }

  async function refreshCivilShares() {
    setCivilShares(await analyticsApi.civilShares(periodMonth));
  }

  async function handleMarkCivilShare(line: CivilShareLine, collected: boolean) {
    const lineKey = `${line.case_id}:${line.role}`;
    setMarkingShareKey(lineKey);
    setError(null);
    try {
      await civilCasesApi.markShares([{ case_id: line.case_id, role: line.role }], collected);
      await refreshCivilShares();
    } catch (err) {
      setError(
        err instanceof ApiRequestError || err instanceof Error
          ? err.message
          : "Не удалось обновить долю по гражданке",
      );
    } finally {
      setMarkingShareKey(null);
    }
  }

  async function handleMarkCivilShareAll(
    payeeId: string,
    lines: CivilShareLine[],
    collected: boolean,
  ) {
    if (lines.length === 0) return;
    setMarkingSharePayeeId(payeeId);
    setError(null);
    try {
      await civilCasesApi.markShares(
        lines.map((line) => ({ case_id: line.case_id, role: line.role })),
        collected,
      );
      await refreshCivilShares();
    } catch (err) {
      setError(
        err instanceof ApiRequestError || err instanceof Error
          ? err.message
          : "Не удалось обновить доли по гражданке",
      );
    } finally {
      setMarkingSharePayeeId(null);
    }
  }

  function toggleManagerExpanded(managerKey: string) {
    setExpandedManagers((prev) => ({ ...prev, [managerKey]: !prev[managerKey] }));
  }

  async function handleMarkManagerPayout(clientId: string, collected: boolean) {
    setMarkingClientId(clientId);
    setError(null);
    try {
      await clientsApi.setManagerFirstCommission(clientId, collected);
      await refreshManagerPayouts();
    } catch (err) {
      setError(
        err instanceof ApiRequestError || err instanceof Error
          ? err.message
          : "Не удалось обновить менеджерские",
      );
    } finally {
      setMarkingClientId(null);
    }
  }

  async function handleMarkManagerPayoutAll(
    managerKey: string,
    clientIds: string[],
    collected: boolean,
  ) {
    if (clientIds.length === 0) return;
    setMarkingManagerKey(managerKey);
    setError(null);
    try {
      await clientsApi.setManagerFirstCommissionBulk(clientIds, collected);
      await refreshManagerPayouts();
    } catch (err) {
      setError(
        err instanceof ApiRequestError || err instanceof Error
          ? err.message
          : "Не удалось обновить менеджерские",
      );
    } finally {
      setMarkingManagerKey(null);
    }
  }

  function normalizeAmount(value: string): string {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error("Укажите сумму больше 0");
    }
    return Math.round(parsed).toFixed(2);
  }

  async function handleCreateOneTime(event: React.FormEvent) {
    event.preventDefault();
    setOneTimeSaving(true);
    setError(null);
    try {
      await expensesApi.createOneTime({
        name: oneTimeForm.name.trim(),
        amount: normalizeAmount(oneTimeForm.amount),
        period_month: monthToPeriodDate(periodMonth),
        expense_date: oneTimeForm.expense_date,
        comment: oneTimeForm.comment.trim() || null,
      });
      setOneTimeForm({
        ...emptyOneTimeForm,
        expense_date: new Date().toISOString().slice(0, 10),
      });
      loadData();
    } catch (err) {
      setError(
        err instanceof ApiRequestError || err instanceof Error
          ? err.message
          : "Не удалось добавить разовый расход",
      );
    } finally {
      setOneTimeSaving(false);
    }
  }

  async function handleDeleteOneTime(id: string, name: string) {
    if (!window.confirm(`Удалить разовый расход «${name}»?`)) return;
    setError(null);
    try {
      await expensesApi.deleteOneTime(id);
      loadData();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Не удалось удалить разовый расход",
      );
    }
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
  const oneTimeMonthTotal = oneTimeExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const totalWithOneTime = totalMonthly + oneTimeMonthTotal;

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

  const historyMonthOptions = useMemo(() => {
    const months: string[] = [];
    const anchor = new Date();
    for (let offset = 0; offset < 24; offset += 1) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - offset, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return months;
  }, []);

  const filteredHistory = useMemo(() => {
    const target = historyMonthFilter || periodMonth;
    const items = payments.filter((payment) => payment.period_month.slice(0, 7) === target);
    return [...items].sort((a, b) => {
      const monthCmp = b.period_month.localeCompare(a.period_month);
      if (monthCmp !== 0) return monthCmp;
      return b.payment_date.localeCompare(a.payment_date);
    });
  }, [payments, historyMonthFilter, periodMonth]);

  if (user?.role !== "owner") {
    return <LoadingState text="Доступ только для руководителя" />;
  }

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <PageHeader
          title="Расходы и выплаты"
          subtitle="Зарплатный проект, производственные расходы, доли и обязательные платежи"
          action={
            <div className="flex items-center gap-2">
              <span className="type-caption hidden sm:inline">Месяц</span>
              <Input
                type="month"
                value={periodMonth}
                onChange={(e) => {
                  setPeriodMonth(e.target.value || currentMonthValue());
                  cancelPaymentEdit();
                }}
                className="w-[160px]"
                aria-label="Расчётный месяц"
              />
            </div>
          }
        />

        {error && <p className="alert-danger">{error}</p>}

        <MetricStrip columns={5}>
          <Metric
            label="Итого в месяц"
            value={formatMoney(totalWithOneTime)}
            tone="danger"
            hint={`${activeExpenses.length} статей и ${oneTimeExpenses.length} разовых`}
          />
          <Metric
            label="Зарплатный проект"
            value={formatMoney(salaryTotal)}
            hint={`${salaryExpenses.length} сотрудников`}
          />
          <Metric
            label="Производственные"
            value={formatMoney(productionTotal)}
            hint={`${productionExpenses.length} статей`}
          />
          <Metric
            label={`Разовые · ${formatMonthLabel(periodMonth)}`}
            value={formatMoney(oneTimeMonthTotal)}
            tone="warning"
            hint={`${oneTimeExpenses.length} записей`}
          />
          <Metric
            label="Зарплата выплачена"
            value={formatMoney(monthPaidTotal)}
            tone="success"
            hint={`${monthPaidCount} из ${salaryExpenses.length} · ждут ${monthPendingCount}`}
            className="col-span-2 lg:col-span-1"
          />
        </MetricStrip>
      </div>

      <SectionNav items={EXPENSE_SECTIONS} />

      <Panel
        id="manager-payouts"
        dot="brand"
        title={`Менеджерские выплаты · ${formatMonthLabel(periodMonth)}`}
        description="С октября 2026: 10 000 ₽ за своего клиента с договором на банкротство (по дате договора). За клиента от удалённого менеджера — 5 000 ₽ после первого платежа. 1 000 ₽ за доверенность сюда не входит."
      >
        {managerPayouts ? (
          <>
            <MetricStrip columns={3}>
              <Metric
                label="К выдаче"
                value={formatMoney(managerPayouts.to_pay_amount)}
                tone="warning"
                hint={`${managerPayouts.clients_count} клиентов`}
              />
              <Metric
                label="Выплачено"
                value={formatMoney(managerPayouts.paid_amount)}
                tone="success"
              />
              <Metric label="Начислено за месяц" value={formatMoney(managerPayouts.total_amount)} />
            </MetricStrip>
            {managerPayouts.managers.length === 0 ? (
              <EmptyState>За этот месяц нет договоров на банкротство</EmptyState>
            ) : (
              <div className="space-y-2">
                {managerPayouts.managers.map((row) => {
                  const managerKey = row.manager_id ?? "none";
                  const expanded = Boolean(expandedManagers[managerKey]);
                  const unpaidIds = row.clients
                    .filter((item) => !item.collected)
                    .map((item) => item.client_id);
                  const busy =
                    markingManagerKey === managerKey ||
                    row.clients.some((item) => markingClientId === item.client_id);

                  return (
                    <PayeeRow
                      key={managerKey}
                      name={row.manager_name}
                      meta={`${row.clients_count} кл. · выплачено ${formatMoney(row.paid_amount)} из ${formatMoney(row.total_amount)}`}
                      toPay={row.to_pay_amount}
                      paid={row.paid_amount}
                      total={row.total_amount}
                      open={expanded}
                      onToggle={() => toggleManagerExpanded(managerKey)}
                      action={
                        unpaidIds.length > 0 ? (
                          <Button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void handleMarkManagerPayoutAll(managerKey, unpaidIds, true)
                            }
                          >
                            {markingManagerKey === managerKey ? "…" : "Выплатить всё"}
                          </Button>
                        ) : (
                          <Badge tone="success">Закрыто</Badge>
                        )
                      }
                    >
                      <div className="overflow-x-auto">
                        <table className="data-table table-cards text-xs">
                          <thead>
                            <tr>
                              <th>Клиент</th>
                              <th>Договор</th>
                              <th className="text-right">Сумма</th>
                              <th>Статус</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {row.clients.map((item) => (
                              <tr key={item.client_id}>
                                <td data-label="Клиент">
                                  <Link href={`/clients/${item.client_id}`} className="link-brand">
                                    {formatShortName(item.client_name)}
                                  </Link>
                                  {item.from_agent ? (
                                    <span className="ml-1.5 text-[10px] font-semibold uppercase text-muted">
                                      от агента
                                    </span>
                                  ) : null}
                                </td>
                                <td data-label="Договор" className="tabular text-muted">
                                  {formatDate(item.contract_date)}
                                  {item.first_payment_date
                                    ? ` · платёж ${formatDate(item.first_payment_date)}`
                                    : ""}
                                </td>
                                <td data-label="Сумма" className="tabular text-right font-medium">
                                  {formatMoney(item.amount)}
                                </td>
                                <td data-label="Статус">
                                  <Badge tone={item.collected ? "success" : "warning"}>
                                    {item.collected ? "Выплачено" : "К выдаче"}
                                  </Badge>
                                </td>
                                <td data-label="Действие" className="text-right">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={item.collected ? "ghost" : "secondary"}
                                    disabled={busy}
                                    onClick={() =>
                                      handleMarkManagerPayout(item.client_id, !item.collected)
                                    }
                                  >
                                    {markingClientId === item.client_id
                                      ? "…"
                                      : item.collected
                                        ? "Снять"
                                        : "Выплатить"}
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </PayeeRow>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <EmptyState>Не удалось загрузить менеджерские</EmptyState>
        )}
      </Panel>

      <AgentPayouts month={periodMonth} />

      <PayoutTracking
        month={periodMonth}
        loading={loading}
        civil={civilShares}
        outflows={mandatoryOutflows}
        markingLineKey={markingShareKey}
        markingPayeeId={markingSharePayeeId}
        onMarkLine={(line, collected) => void handleMarkCivilShare(line, collected)}
        onMarkPayee={(payeeId, lines, collected) =>
          void handleMarkCivilShareAll(payeeId, lines, collected)
        }
      />

      <Panel
        id="one-time"
        dot="warning"
        title={`Разовые расходы · ${formatMonthLabel(periodMonth)}`}
        description="Траты только за выбранный месяц — попадают в чистую прибыль на дашборде."
        action={
          <span className="tabular text-sm font-semibold text-foreground">
            {formatMoney(oneTimeMonthTotal)}
          </span>
        }
        footer={
          <form
            onSubmit={handleCreateOneTime}
            className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.4fr)_auto]"
          >
            <Input
              placeholder="Название расхода"
              value={oneTimeForm.name}
              onChange={(e) => setOneTimeForm({ ...oneTimeForm, name: e.target.value })}
              required
            />
            <Input
              placeholder="Сумма, ₽"
              type="number"
              min={1}
              step={1}
              value={oneTimeForm.amount}
              onChange={(e) => setOneTimeForm({ ...oneTimeForm, amount: e.target.value })}
              required
            />
            <Input
              type="date"
              value={oneTimeForm.expense_date}
              onChange={(e) => setOneTimeForm({ ...oneTimeForm, expense_date: e.target.value })}
              required
            />
            <Input
              placeholder="Комментарий (необязательно)"
              value={oneTimeForm.comment}
              onChange={(e) => setOneTimeForm({ ...oneTimeForm, comment: e.target.value })}
            />
            <Button type="submit" disabled={oneTimeSaving}>
              {oneTimeSaving ? "Сохранение..." : "Добавить"}
            </Button>
          </form>
        }
      >
        {loading ? (
          <LoadingState text="Загрузка..." />
        ) : oneTimeExpenses.length === 0 ? (
          <EmptyState>Разовых расходов за этот месяц пока нет</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="data-table table-cards text-xs">
              <thead>
                <tr>
                  <th>Название</th>
                  <th className="text-right">Сумма</th>
                  <th>Дата оплаты</th>
                  <th>Комментарий</th>
                  <th>Кто добавил</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {oneTimeExpenses.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Название" className="font-medium text-foreground">
                      {item.name}
                    </td>
                    <td data-label="Сумма" className="tabular text-right font-semibold text-foreground">
                      {formatMoney(item.amount)}
                    </td>
                    <td data-label="Дата оплаты" className="tabular">
                      {formatDate(item.expense_date)}
                    </td>
                    <td data-label="Комментарий" className="text-muted">
                      {item.comment || "—"}
                    </td>
                    <td data-label="Кто добавил" className="text-muted">
                      {item.created_by_name ?? "—"}
                    </td>
                    <td data-label="Действие" className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteOneTime(item.id, item.name)}
                      >
                        Удалить
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        id="salary"
        dot="success"
        title={`Зарплатный проект · ${formatMonthLabel(periodMonth)}`}
        description="Зелёная строка — выплачено за выбранный месяц. Сумму выплаты можно поправить."
      >
        <MetricStrip columns={3}>
          <Metric
            label="Выплачено"
            value={formatMoney(monthPaidTotal)}
            tone="success"
            hint={`${monthPaidCount} из ${salaryExpenses.length}`}
          />
          <Metric
            label="Ожидают выплаты"
            value={monthPendingCount}
            tone={monthPendingCount > 0 ? "warning" : "muted"}
            hint="сотрудников"
          />
          <Metric label="План по зарплате" value={formatMoney(salaryTotal)} />
        </MetricStrip>
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
      </Panel>

      <Panel
        id="production"
        title="Производственные расходы"
        description="Аренда, коммунальные, маркетинг и прочие затраты."
        action={
          <span className="tabular text-sm font-semibold text-foreground">
            {formatMoney(productionTotal)} / мес.
          </span>
        }
      >
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
      </Panel>

      <Panel
        id="add-expense"
        title="Новая статья расхода"
        description="Сотрудник в зарплатный проект или постоянная производственная статья."
      >
        <form onSubmit={handleCreate} className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          <FormField label="Название" required>
            <Input
              placeholder="ФИО или статья"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Группа">
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
          </FormField>
          <FormField label="Категория">
            <Select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
            >
              <option value="salary">Зарплата</option>
              <option value="rent">Аренда</option>
              <option value="utilities">Коммунальные</option>
              <option value="marketing">Маркетинг</option>
              <option value="other">Прочее</option>
            </Select>
          </FormField>
          <FormField label="Сумма в месяц, ₽" required>
            <Input
              placeholder="0"
              type="number"
              min={1}
              step={1}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
          </FormField>
          {form.expense_group === "salary_project" && (
            <FormField label="День выплаты">
              <Input
                placeholder="1–31"
                type="number"
                min={1}
                max={31}
                value={form.pay_day}
                onChange={(e) => setForm({ ...form, pay_day: e.target.value })}
              />
            </FormField>
          )}
          <FormField label="Порядок в списке">
            <Input
              placeholder="0"
              type="number"
              min={0}
              step={1}
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
            />
          </FormField>
          <div className="flex justify-end md:col-span-2 xl:col-span-3">
            <Button type="submit">Добавить статью</Button>
          </div>
        </form>
      </Panel>

      <Panel
        id="history"
        title="История выплат"
        description="Кто, за какой месяц и сколько получил — суммы можно исправить."
        action={
          <Select
            value={historyMonthFilter || periodMonth}
            onChange={(e) => setHistoryMonthFilter(e.target.value)}
            className="w-[180px]"
            aria-label="Месяц истории"
          >
            {historyMonthOptions.map((month) => (
              <option key={month} value={month}>
                {formatMonthLabel(month)}
              </option>
            ))}
          </Select>
        }
      >
        {loading ? (
          <LoadingState text="Загрузка выплат..." />
        ) : filteredHistory.length === 0 ? (
          <EmptyState>Выплаты ещё не зафиксированы</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
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

                  return (
                    <tr key={payment.id}>
                      <td data-label="Месяц" className="first-letter:uppercase">
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
                          <span className="tabular font-semibold text-status-success-text">
                            {formatMoney(payment.amount)}
                          </span>
                        )}
                      </td>
                      <td data-label="Дата выплаты" className="tabular">
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
                      <td data-label="Действие">
                        <div className="flex flex-wrap justify-end gap-1">
                          {isEditing ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                disabled={savingPaymentId === payment.id}
                                onClick={() => handleSavePaymentEdit(payment.id)}
                              >
                                {savingPaymentId === payment.id ? "…" : "Сохранить"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={cancelPaymentEdit}
                              >
                                Отмена
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
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
      </Panel>
    </div>
  );
}
