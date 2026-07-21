"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge, Button, Card, Input, LoadingState, PageHeader, SectionTitle } from "@/components/ui";
import { pricingApi } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/format";
import type { PricingTier } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

const emptyForm = {
  min_amount: "",
  max_amount: "",
  total_cost: "",
  first_month_payment: "",
  second_month_payment: "",
  remaining_months_count: "8",
  remaining_month_payment: "",
  total_months: "10",
  effective_from: new Date().toISOString().slice(0, 10),
};

export default function PricingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== "owner") {
      router.replace("/");
    }
  }, [user, router]);

  async function loadTiers() {
    setLoading(true);
    try {
      setTiers(await pricingApi.list());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user?.role === "owner") loadTiers();
  }, [user?.role]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await pricingApi.create({
        min_amount: form.min_amount,
        max_amount: form.max_amount,
        total_cost: form.total_cost,
        first_month_payment: form.first_month_payment,
        second_month_payment: form.second_month_payment,
        remaining_months_count: Number(form.remaining_months_count),
        remaining_month_payment: form.remaining_month_payment,
        total_months: Number(form.total_months),
        effective_from: form.effective_from,
        is_active: true,
      });
      setForm(emptyForm);
      loadTiers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    }
  }

  if (user?.role !== "owner") {
    return <LoadingState text="Доступ только для руководителя" />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Тарифная сетка"
        subtitle="Управление прайсом организации и графиками рассрочки"
      />

      <Card variant="accent">
        <SectionTitle title="Добавить тариф" />
        <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Input
            placeholder="Мин. сумма"
            value={form.min_amount}
            onChange={(e) => setForm({ ...form, min_amount: e.target.value })}
            required
          />
          <Input
            placeholder="Макс. сумма"
            value={form.max_amount}
            onChange={(e) => setForm({ ...form, max_amount: e.target.value })}
            required
          />
          <Input
            placeholder="Итого (total_cost)"
            value={form.total_cost}
            onChange={(e) => setForm({ ...form, total_cost: e.target.value })}
            required
          />
          <Input
            placeholder="1-й месяц"
            value={form.first_month_payment}
            onChange={(e) => setForm({ ...form, first_month_payment: e.target.value })}
            required
          />
          <Input
            placeholder="2-й месяц"
            value={form.second_month_payment}
            onChange={(e) => setForm({ ...form, second_month_payment: e.target.value })}
            required
          />
          <Input
            placeholder="Остальные месяцы (кол-во)"
            value={form.remaining_months_count}
            onChange={(e) => setForm({ ...form, remaining_months_count: e.target.value })}
            required
          />
          <Input
            placeholder="Платёж остальных месяцев"
            value={form.remaining_month_payment}
            onChange={(e) => setForm({ ...form, remaining_month_payment: e.target.value })}
            required
          />
          <Input
            placeholder="Всего месяцев"
            value={form.total_months}
            onChange={(e) => setForm({ ...form, total_months: e.target.value })}
            required
          />
          <Input
            type="date"
            value={form.effective_from}
            onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
            required
          />
          {error && <p className="text-sm text-red-600 md:col-span-2 xl:col-span-3">{error}</p>}
          <Button type="submit" className="md:col-span-2 xl:col-span-3">
            Сохранить тариф
          </Button>
        </form>
      </Card>

      <Card>
        <SectionTitle title="Текущие тарифы" />
        {loading ? (
          <LoadingState text="Загрузка тарифов..." />
        ) : tiers.length === 0 ? (
          <p className="empty-state">Тарифы не заданы (от 300 000 ₽)</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Диапазон</th>
                  <th>Итого</th>
                  <th>1/2 мес</th>
                  <th>Далее</th>
                  <th>С даты</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier) => (
                  <tr key={tier.id}>
                    <td className="font-medium text-slate-900">
                      {formatMoney(tier.min_amount)} — {formatMoney(tier.max_amount)}
                    </td>
                    <td>{formatMoney(tier.total_cost)}</td>
                    <td>
                      {formatMoney(tier.first_month_payment)} /{" "}
                      {formatMoney(tier.second_month_payment)}
                    </td>
                    <td>
                      {tier.remaining_months_count} × {formatMoney(tier.remaining_month_payment)}
                    </td>
                    <td>{formatDate(tier.effective_from)}</td>
                    <td>
                      <Badge tone={tier.is_active ? "success" : "default"}>
                        {tier.is_active ? "Активен" : "Неактивен"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
