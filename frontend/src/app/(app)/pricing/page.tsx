"use client";

import { useEffect, useState } from "react";
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
} from "@/components/ui";
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
    <div className="page-stack">
      <PageHeader
        title="Тарифная сетка"
        subtitle="Управление прайсом организации и графиками рассрочки"
      />

      <Card variant="accent">
        <SectionTitle title="Добавить тариф" />
        <form onSubmit={handleCreate} className="form-grid-3">
          <FormField label="Минимальная сумма долга">
            <Input
              placeholder="300 000"
              value={form.min_amount}
              onChange={(e) => setForm({ ...form, min_amount: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Максимальная сумма долга">
            <Input
              placeholder="500 000"
              value={form.max_amount}
              onChange={(e) => setForm({ ...form, max_amount: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Стоимость по тарифу">
            <Input
              placeholder="180 000"
              value={form.total_cost}
              onChange={(e) => setForm({ ...form, total_cost: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Платёж 1-го месяца">
            <Input
              placeholder="40 000"
              value={form.first_month_payment}
              onChange={(e) => setForm({ ...form, first_month_payment: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Платёж 2-го месяца">
            <Input
              placeholder="20 000"
              value={form.second_month_payment}
              onChange={(e) => setForm({ ...form, second_month_payment: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Количество остальных месяцев">
            <Input
              placeholder="8"
              value={form.remaining_months_count}
              onChange={(e) => setForm({ ...form, remaining_months_count: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Платёж остальных месяцев">
            <Input
              placeholder="15 000"
              value={form.remaining_month_payment}
              onChange={(e) => setForm({ ...form, remaining_month_payment: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Всего месяцев">
            <Input
              placeholder="10"
              value={form.total_months}
              onChange={(e) => setForm({ ...form, total_months: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Действует с">
            <Input
              type="date"
              value={form.effective_from}
              onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
              required
            />
          </FormField>
          {error && <p className="alert-danger md:col-span-2 xl:col-span-3">{error}</p>}
          <div className="md:col-span-2 xl:col-span-3">
            <Button type="submit">Сохранить тариф</Button>
          </div>
        </form>
      </Card>

      <Card>
        <SectionTitle title="Текущие тарифы" />
        {loading ? (
          <LoadingState text="Загрузка тарифов..." />
        ) : tiers.length === 0 ? (
          <EmptyState>Тарифы не заданы (от 300 000 ₽)</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table table-cards">
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
                    <td data-label="Диапазон" className="font-medium text-foreground">
                      {formatMoney(tier.min_amount)} — {formatMoney(tier.max_amount)}
                    </td>
                    <td data-label="Итого">{formatMoney(tier.total_cost)}</td>
                    <td data-label="1/2 мес">
                      {formatMoney(tier.first_month_payment)} /{" "}
                      {formatMoney(tier.second_month_payment)}
                    </td>
                    <td data-label="Далее">
                      {tier.remaining_months_count} × {formatMoney(tier.remaining_month_payment)}
                    </td>
                    <td data-label="С даты">{formatDate(tier.effective_from)}</td>
                    <td data-label="Статус">
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
