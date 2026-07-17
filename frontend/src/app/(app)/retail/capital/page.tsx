"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Card, FormField, Input, LoadingState, PageHeader, SectionTitle } from "@/components/ui";
import { ApiRequestError, retailApi } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { useAuth } from "@/modules/auth/AuthProvider";

export default function RetailCapitalPage() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role !== "investor") {
      router.replace("/retail");
      return;
    }

    retailApi
      .getMyInvestment()
      .then((profile) => setAmount(profile.investment_amount ?? "0"))
      .catch(() => setAmount(user?.investment_amount ?? "0"))
      .finally(() => setLoading(false));
  }, [router, user?.investment_amount, user?.role]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await retailApi.updateMyInvestment(amount || "0");
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось сохранить сумму вклада");
    } finally {
      setSaving(false);
    }
  }

  if (user?.role !== "investor") return <LoadingState text="Перенаправление..." />;
  if (loading) return <LoadingState text="Загрузка..." />;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Мой вклад"
        subtitle="Укажите сумму, которую вы готовы инвестировать в договоры"
      />

      <Card>
        <SectionTitle
          title="Сумма вклада"
          description="Эта сумма видна руководителю при назначении договоров"
        />
        <form onSubmit={handleSave} className="max-w-md space-y-4">
          <FormField label="Текущий вклад">
            <p className="text-lg font-semibold text-slate-900">
              {formatMoney(user?.investment_amount ?? amount ?? "0")}
            </p>
          </FormField>
          <FormField label="Новая сумма, ₽">
            <Input
              type="number"
              min={0}
              step={1000}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </FormField>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <Button type="submit" disabled={saving}>
            {saving ? "Сохранение..." : "Сохранить"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
