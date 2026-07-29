"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Card, FormField, Input, LoadingState, PageHeader, PhoneInput, SectionTitle } from "@/components/ui";
import { ApiRequestError, retailApi } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { PHONE_PREFIX } from "@/lib/phone";
import {
  collectErrors,
  filterDecimalInput,
  filterPersonName,
  hasErrors,
  validateEmail,
  validateFullName,
  validatePassword,
  validatePhoneOptional,
  validatePositiveAmount,
} from "@/lib/validation";
import type { User } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

export default function RetailInvestorsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [investors, setInvestors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [amountEdits, setAmountEdits] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    password: "investor123",
    investment_amount: "",
  });

  useEffect(() => {
    if (user?.role !== "owner") {
      router.replace("/retail");
      return;
    }
    retailApi
      .listInvestors()
      .then(setInvestors)
      .catch(() => setInvestors([]))
      .finally(() => setLoading(false));
  }, [router, user?.role]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const errors = collectErrors({
      full_name: validateFullName(form.full_name),
      email: form.email.trim() ? validateEmail(form.email) : null,
      phone: validatePhoneOptional(form.phone),
      password: validatePassword(form.password),
      investment_amount: form.investment_amount.trim()
        ? validatePositiveAmount(form.investment_amount, { allowZero: true, label: "Сумма вклада" })
        : null,
    });
    if (hasErrors(errors)) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    try {
      const created = await retailApi.createInvestor({
        full_name: form.full_name.trim().replace(/\s+/g, " "),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() && form.phone.trim() !== PHONE_PREFIX ? form.phone.trim() : undefined,
        password: form.password,
        investment_amount: form.investment_amount || "0",
        is_active: true,
      });
      setInvestors((current) => [...current, created]);
      setShowForm(false);
      setShowPassword(false);
      setForm({
        full_name: "",
        email: "",
        phone: "",
        password: "investor123",
        investment_amount: "",
      });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось добавить инвестора");
    }
  }

  async function handleSaveAmount(investor: User) {
    const value = amountEdits[investor.id] ?? investor.investment_amount ?? "0";
    const amountError = validatePositiveAmount(String(value), {
      allowZero: true,
      label: "Сумма вклада",
    });
    if (amountError) {
      setError(amountError);
      return;
    }
    setSavingId(investor.id);
    setError(null);
    try {
      const updated = await retailApi.updateInvestor(investor.id, {
        investment_amount: value,
      });
      setInvestors((current) =>
        current.map((item) => (item.id === investor.id ? { ...item, ...updated } : item)),
      );
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось сохранить сумму");
    } finally {
      setSavingId(null);
    }
  }

  async function handleDeleteInvestor(investor: User) {
    if (
      !window.confirm(
        `Удалить инвестора «${investor.full_name}»? Если у него были договоры, аккаунт будет отключён.`,
      )
    ) {
      return;
    }

    setDeletingId(investor.id);
    setError(null);
    try {
      await retailApi.deleteInvestor(investor.id);
      setInvestors((current) => current.filter((item) => item.id !== investor.id));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось удалить инвестора");
    } finally {
      setDeletingId(null);
    }
  }

  if (user?.role !== "owner") return <LoadingState text="Перенаправление..." />;
  if (loading) return <LoadingState text="Загрузка инвесторов..." />;

  return (
    <div className="page-stack">
      <PageHeader
        title="Инвесторы"
        subtitle="Управление инвесторами и суммами их вкладов"
        action={
          <Button onClick={() => setShowForm((value) => !value)}>
            {showForm ? "Скрыть форму" : "Добавить инвестора"}
          </Button>
        }
      />

      {showForm && (
        <Card>
          <SectionTitle title="Новый инвестор" />
          <form onSubmit={handleCreate} className="grid gap-2 md:grid-cols-2">
            <FormField label="ФИО" error={formErrors.full_name}>
              <Input
                placeholder="Иванов Иван"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: filterPersonName(e.target.value) })}
                required
              />
            </FormField>
            <FormField label="Email" error={formErrors.email}>
              <Input
                placeholder="investor@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </FormField>
            <FormField label="Телефон" error={formErrors.phone}>
              <PhoneInput
                allowEmpty
                value={form.phone}
                onValueChange={(phone) => setForm({ ...form, phone })}
              />
            </FormField>
            <FormField label="Сумма вклада" error={formErrors.investment_amount}>
              <Input
                inputMode="decimal"
                placeholder="0"
                value={form.investment_amount}
                onChange={(e) =>
                  setForm({ ...form, investment_amount: filterDecimalInput(e.target.value) })
                }
              />
            </FormField>
            <div className="md:col-span-2">
              <FormField label="Пароль" error={formErrors.password}>
                <div className="flex gap-2">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Пароль"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? "Скрыть" : "Показать"}
                  </Button>
                </div>
              </FormField>
            </div>
            <Button type="submit" className="md:col-span-2">
              Создать инвестора
            </Button>
          </form>
          {error && <p className="mt-3 text-sm text-status-danger-text">{error}</p>}
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="data-table table-cards">
            <thead>
              <tr>
                <th>ФИО</th>
                <th>Email</th>
                <th>Телефон</th>
                <th>Сумма вклада</th>
                <th>Статус</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {investors.map((investor) => (
                <tr key={investor.id}>
                  <td data-label="ФИО" className="font-medium text-foreground">
                    {investor.full_name}
                  </td>
                  <td data-label="Email">{investor.email || "—"}</td>
                  <td data-label="Телефон">{investor.phone || "—"}</td>
                  <td data-label="Сумма вклада">
                    <div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          step={1000}
                          className="max-w-[160px]"
                          value={amountEdits[investor.id] ?? investor.investment_amount ?? "0"}
                          onChange={(e) =>
                            setAmountEdits({ ...amountEdits, [investor.id]: e.target.value })
                          }
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={savingId === investor.id}
                          onClick={() => handleSaveAmount(investor)}
                        >
                          {savingId === investor.id ? "..." : "OK"}
                        </Button>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        Текущий вклад: {formatMoney(investor.investment_amount ?? "0")}
                      </p>
                    </div>
                  </td>
                  <td data-label="Статус">{investor.is_active ? "Активен" : "Отключён"}</td>
                  <td data-label="Действие">
                    <Button
                      type="button"
                      variant="danger"
                      disabled={deletingId === investor.id}
                      onClick={() => handleDeleteInvestor(investor)}
                    >
                      {deletingId === investor.id ? "..." : "Удалить"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!showForm && error && <p className="mt-3 text-sm text-status-danger-text">{error}</p>}
      </Card>
    </div>
  );
}
