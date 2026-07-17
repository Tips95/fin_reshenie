"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Card, FormField, Input, LoadingState, PageHeader, SectionTitle } from "@/components/ui";
import { ApiRequestError, retailApi } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
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
    try {
      const created = await retailApi.createInvestor({
        full_name: form.full_name,
        email: form.email || undefined,
        phone: form.phone || undefined,
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
    <div className="space-y-8">
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
          <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
            <Input
              placeholder="ФИО"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              required
            />
            <Input
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              placeholder="Телефон"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <Input
              type="number"
              min={0}
              step={1000}
              placeholder="Сумма вклада, ₽"
              value={form.investment_amount}
              onChange={(e) => setForm({ ...form, investment_amount: e.target.value })}
            />
            <div className="md:col-span-2">
              <FormField label="Пароль">
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
          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="data-table">
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
                  <td className="font-medium text-slate-900">{investor.full_name}</td>
                  <td>{investor.email || "—"}</td>
                  <td>{investor.phone || "—"}</td>
                  <td>
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
                    <p className="mt-1 text-xs text-slate-500">
                      Текущий вклад: {formatMoney(investor.investment_amount ?? "0")}
                    </p>
                  </td>
                  <td>{investor.is_active ? "Активен" : "Отключён"}</td>
                  <td>
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
        {!showForm && error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      </Card>
    </div>
  );
}
