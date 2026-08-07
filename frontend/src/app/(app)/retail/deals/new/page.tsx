"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Button,
  Card,
  FormField,
  Input,
  LoadingState,
  PageHeader,
  PhoneInput,
  SectionTitle,
  Select,
  StatCard,
} from "@/components/ui";
import { ApiRequestError, retailApi } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { PHONE_PREFIX } from "@/lib/phone";
import { canManageRetailDeals, isRetailOwner } from "@/lib/retail-access";
import type { RetailTermRate, User } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";
import {
  collectErrors,
  filterDecimalInput,
  filterPersonName,
  hasErrors,
  validateFullName,
  validatePhone,
  validatePositiveAmount,
  validateRequiredDate,
} from "@/lib/validation";

function previewTotal(productPrice: number, markupPercent: number, downPayment: number) {
  if (!Number.isFinite(productPrice) || productPrice <= 0) return null;
  const total = Math.round(productPrice * (1 + markupPercent / 100));
  const financed = Math.max(total - downPayment, 0);
  return { total, financed };
}

export default function RetailNewDealPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isOwner = isRetailOwner(user);
  const [rates, setRates] = useState<RetailTermRate[]>([]);
  const [investors, setInvestors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    full_name: "",
    phone: PHONE_PREFIX,
    product_name: "",
    purchase_price: "",
    product_price: "",
    term_months: "6",
    down_payment: "0",
    contract_date: new Date().toISOString().slice(0, 10),
    investor_id: "",
  });

  useEffect(() => {
    if (!user || !canManageRetailDeals(user)) return;
    void (async () => {
      try {
        const ratesData = await retailApi.termRates();
        setRates(ratesData);
        if (isOwner) {
          setInvestors(await retailApi.listInvestors());
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [user, isOwner]);

  const selectedRate = rates.find((item) => String(item.term_months) === form.term_months);
  const markupPercent = selectedRate ? Number(selectedRate.markup_percent) : 0;
  const purchase = Number(form.purchase_price);
  const saleBase = Number(form.product_price);
  const downPayment = Number(form.down_payment) || 0;
  const preview = previewTotal(saleBase, markupPercent, downPayment);
  const expectedProfit =
    preview && Number.isFinite(purchase) ? preview.total - purchase : null;

  const monthlyPayment =
    preview && preview.financed > 0 && Number(form.term_months) > 0
      ? Math.round(preview.financed / Number(form.term_months))
      : null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const errors = collectErrors({
      full_name: validateFullName(form.full_name),
      phone: validatePhone(form.phone),
      product_name: form.product_name.trim() ? null : "Укажите товар",
      purchase_price: validatePositiveAmount(form.purchase_price, { label: "Закупка" }),
      product_price: validatePositiveAmount(form.product_price, { label: "Цена для клиента" }),
      down_payment: validatePositiveAmount(form.down_payment, {
        allowZero: true,
        label: "Первый взнос",
      }),
      contract_date: validateRequiredDate(form.contract_date),
      investor_id: isOwner && !form.investor_id ? "Выберите инвестора" : null,
    });
    if (hasErrors(errors)) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    setSaving(true);
    try {
      const result = await retailApi.createDeal({
        full_name: form.full_name.trim().replace(/\s+/g, " "),
        phone: form.phone.trim(),
        product_name: form.product_name.trim(),
        purchase_price: Number(form.purchase_price).toFixed(2),
        product_price: Number(form.product_price).toFixed(2),
        term_months: Number(form.term_months),
        down_payment: Number(form.down_payment || 0).toFixed(2),
        contract_date: form.contract_date,
        investor_id: isOwner ? form.investor_id : undefined,
      });
      router.push(`/retail/contracts/${result.contract.id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось оформить сделку");
    } finally {
      setSaving(false);
    }
  }

  if (!canManageRetailDeals(user)) {
    return <LoadingState text="Нет доступа" />;
  }

  if (loading) {
    return <LoadingState text="Загрузка..." />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Новая сделка"
        subtitle="Клиент + товар + рассрочка за один шаг. Вы выкупаете товар — клиент возвращает с наценкой."
        back={
          <Link href="/retail" className="link-brand text-sm font-semibold">
            ← Дашборд
          </Link>
        }
      />

      <div className="grid gap-2 lg:grid-cols-3">
        <StatCard
          label="Закупка"
          value={Number.isFinite(purchase) && purchase > 0 ? formatMoney(purchase) : "—"}
          hint="Сколько вы заплатили за товар"
        />
        <StatCard
          label="Клиент вернёт"
          value={preview ? formatMoney(preview.total) : "—"}
          tone="brand"
          hint={selectedRate ? `Наценка ${markupPercent}% · ${form.term_months} мес.` : "Выберите срок"}
        />
        <StatCard
          label="Прибыль по сделке"
          value={expectedProfit !== null ? formatMoney(expectedProfit) : "—"}
          tone="success"
          hint="К возврату − закупка"
        />
      </div>

      <Card variant="accent">
        <SectionTitle
          title="Оформить сделку"
          description="Минимум полей: клиент, закупочная цена, цена для клиента и срок. Паспорт и поручителя можно добавить позже."
        />
        <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-2">
          <FormField label="ФИО клиента" error={formErrors.full_name}>
            <Input
              value={form.full_name}
              onChange={(e) =>
                setForm({ ...form, full_name: filterPersonName(e.target.value) })
              }
              required
            />
          </FormField>
          <FormField label="Телефон" error={formErrors.phone}>
            <PhoneInput value={form.phone} onValueChange={(phone) => setForm({ ...form, phone })} />
          </FormField>
          <FormField label="Товар" error={formErrors.product_name}>
            <Input
              placeholder="iPhone 15, холодильник..."
              value={form.product_name}
              onChange={(e) => setForm({ ...form, product_name: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Закупочная цена, ₽" error={formErrors.purchase_price}>
            <Input
              inputMode="decimal"
              value={form.purchase_price}
              onChange={(e) =>
                setForm({ ...form, purchase_price: filterDecimalInput(e.target.value) })
              }
              required
            />
          </FormField>
          <FormField
            label="Цена для клиента (до наценки), ₽"
            error={formErrors.product_price}
          >
            <Input
              inputMode="decimal"
              value={form.product_price}
              onChange={(e) =>
                setForm({ ...form, product_price: filterDecimalInput(e.target.value) })
              }
              required
            />
          </FormField>
          <FormField label="Срок рассрочки">
            <Select
              value={form.term_months}
              onChange={(e) => setForm({ ...form, term_months: e.target.value })}
            >
              {rates.map((rate) => (
                <option key={rate.id} value={rate.term_months}>
                  {rate.term_months} мес. · наценка {rate.markup_percent}%
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Первый взнос, ₽" error={formErrors.down_payment}>
            <Input
              inputMode="decimal"
              value={form.down_payment}
              onChange={(e) =>
                setForm({ ...form, down_payment: filterDecimalInput(e.target.value) })
              }
            />
          </FormField>
          <FormField label="Дата договора" error={formErrors.contract_date}>
            <Input
              type="date"
              value={form.contract_date}
              onChange={(e) => setForm({ ...form, contract_date: e.target.value })}
              required
            />
          </FormField>
          {isOwner ? (
            <FormField label="Инвестор" error={formErrors.investor_id}>
              <Select
                value={form.investor_id}
                onChange={(e) => setForm({ ...form, investor_id: e.target.value })}
                required
              >
                <option value="">Выберите инвестора</option>
                {investors.map((investor) => (
                  <option key={investor.id} value={investor.id}>
                    {investor.full_name}
                    {investor.investment_amount
                      ? ` · вклад ${formatMoney(investor.investment_amount)}`
                      : ""}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}
          {preview ? (
            <div className="md:col-span-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
              <p className="text-muted">Расчёт по сделке</p>
              <p className="mt-1 text-foreground">
                Клиент платит <span className="font-semibold">{formatMoney(preview.total)}</span>
                {monthlyPayment ? (
                  <>
                    {" "}
                    · ≈ <span className="font-semibold">{formatMoney(monthlyPayment)}</span> / мес.
                  </>
                ) : null}
                {expectedProfit !== null ? (
                  <>
                    {" "}
                    · ваша прибыль{" "}
                    <span className="font-semibold text-status-success-text">
                      {formatMoney(expectedProfit)}
                    </span>
                  </>
                ) : null}
              </p>
            </div>
          ) : null}
          {error ? <p className="alert-danger md:col-span-2">{error}</p> : null}
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Оформление..." : "Оформить сделку"}
            </Button>
            <Link href="/retail/clients">
              <Button type="button" variant="secondary">
                Расширенная форма
              </Button>
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
