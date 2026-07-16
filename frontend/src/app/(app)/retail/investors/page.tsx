"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Card, Input, LoadingState, PageHeader, SectionTitle } from "@/components/ui";
import { ApiRequestError, retailApi } from "@/lib/api-client";
import type { User } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

export default function RetailInvestorsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [investors, setInvestors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    password: "investor123",
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
        ...form,
        role: "investor",
        is_active: true,
      });
      setInvestors((current) => [...current, created]);
      setShowForm(false);
      setForm({ full_name: "", email: "", phone: "", password: "investor123" });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось добавить инвестора");
    }
  }

  if (user?.role !== "owner") return <LoadingState text="Перенаправление..." />;
  if (loading) return <LoadingState text="Загрузка инвесторов..." />;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Инвесторы"
        subtitle="Только админ видит всех инвесторов и их показатели"
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
            <Input placeholder="ФИО" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
            <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input placeholder="Телефон" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input placeholder="Пароль" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            <Button type="submit" className="md:col-span-2">Создать инвестора</Button>
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
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {investors.map((investor) => (
                <tr key={investor.id}>
                  <td className="font-medium text-slate-900">{investor.full_name}</td>
                  <td>{investor.email || "—"}</td>
                  <td>{investor.phone || "—"}</td>
                  <td>{investor.is_active ? "Активен" : "Отключён"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
