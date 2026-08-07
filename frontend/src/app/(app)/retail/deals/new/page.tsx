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
  PassportInput,
  PhoneInput,
  SectionTitle,
  Select,
  StatCard,
} from "@/components/ui";
import { PdfDocumentField } from "@/components/PdfDocumentField";
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
  formatPassport,
  hasErrors,
  validateAddress,
  validateFullName,
  validatePassport,
  validatePdfFile,
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
  const [clientPassportFile, setClientPassportFile] = useState<File | null>(null);
  const [guarantorPassportFile, setGuarantorPassportFile] = useState<File | null>(null);
  const [clientPassportFileError, setClientPassportFileError] = useState<string | null>(null);
  const [guarantorPassportFileError, setGuarantorPassportFileError] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    phone: PHONE_PREFIX,
    passport: "",
    address: "",
    guarantor_full_name: "",
    guarantor_phone: PHONE_PREFIX,
    guarantor_passport: "",
    product_name: "",
    purchase_price: "",
    product_price: "",
    term_months: "6",
    down_payment: "",
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
      passport: validatePassport(form.passport),
      address: validateAddress(form.address),
      guarantor_full_name: validateFullName(form.guarantor_full_name),
      guarantor_phone: validatePhone(form.guarantor_phone),
      guarantor_passport: validatePassport(form.guarantor_passport),
      product_name: form.product_name.trim() ? null : "Укажите товар",
      purchase_price: validatePositiveAmount(form.purchase_price, { label: "Закупка" }),
      product_price: validatePositiveAmount(form.product_price, { label: "Цена для клиента" }),
      down_payment: validatePositiveAmount(form.down_payment, {
        allowZero: true,
        label: "Первоначальный взнос",
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
    let contractId: string | null = null;
    try {
      const result = await retailApi.createDeal({
        full_name: form.full_name.trim().replace(/\s+/g, " "),
        guarantor_full_name: form.guarantor_full_name.trim().replace(/\s+/g, " "),
        phone: form.phone.trim(),
        guarantor_phone: form.guarantor_phone.trim(),
        passport: formatPassport(form.passport),
        guarantor_passport: formatPassport(form.guarantor_passport),
        address: form.address.trim(),
        product_name: form.product_name.trim(),
        purchase_price: Number(form.purchase_price).toFixed(2),
        product_price: Number(form.product_price).toFixed(2),
        term_months: Number(form.term_months),
        down_payment: Number(form.down_payment || 0).toFixed(2),
        contract_date: form.contract_date,
        investor_id: isOwner ? form.investor_id : undefined,
      });
      contractId = result.contract.id;
      const clientId = result.client.id;

      if (clientPassportFile) {
        await retailApi.uploadClientPassportPdf(clientId, clientPassportFile);
      }
      if (guarantorPassportFile) {
        await retailApi.uploadGuarantorPassportPdf(clientId, guarantorPassportFile);
      }

      router.push(`/retail/contracts/${contractId}`);
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.message : "Не удалось оформить сделку";
      setError(
        contractId
          ? `${message}. Сделка создана — откройте договор и загрузите сканы вручную.`
          : message,
      );
      if (contractId) {
        router.push(`/retail/contracts/${contractId}`);
      }
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
        subtitle="Клиент и договор рассрочки — одной формой. Вы выкупаете товар, клиент возвращает с наценкой."
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

      <form onSubmit={handleSubmit} className="page-stack">
        <Card variant="accent">
          <SectionTitle title="Клиент" description="Данные заёмщика и сканы паспортов" />
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="ФИО" error={formErrors.full_name}>
              <Input
                placeholder="Иванов Иван"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: filterPersonName(e.target.value) })}
                required
              />
            </FormField>
            <FormField label="Телефон" error={formErrors.phone}>
              <PhoneInput value={form.phone} onValueChange={(phone) => setForm({ ...form, phone })} required />
            </FormField>
            <FormField label="Паспорт" error={formErrors.passport}>
              <PassportInput
                value={form.passport}
                onValueChange={(passport) => setForm({ ...form, passport })}
                required
              />
            </FormField>
            <FormField label="Адрес" error={formErrors.address}>
              <Input
                placeholder="г. Москва, ул. Ленина, 10"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                required
              />
            </FormField>
            <FormField label="Поручитель ФИО" error={formErrors.guarantor_full_name}>
              <Input
                placeholder="Петров Пётр"
                value={form.guarantor_full_name}
                onChange={(e) =>
                  setForm({ ...form, guarantor_full_name: filterPersonName(e.target.value) })
                }
                required
              />
            </FormField>
            <FormField label="Поручитель телефон" error={formErrors.guarantor_phone}>
              <PhoneInput
                value={form.guarantor_phone}
                onValueChange={(guarantor_phone) => setForm({ ...form, guarantor_phone })}
                required
              />
            </FormField>
            <div className="md:col-span-2">
              <FormField label="Поручитель паспорт" error={formErrors.guarantor_passport}>
                <PassportInput
                  value={form.guarantor_passport}
                  onValueChange={(guarantor_passport) => setForm({ ...form, guarantor_passport })}
                  required
                />
              </FormField>
            </div>
            <div>
              <PdfDocumentField
                label="Скан паспорта клиента"
                hasFile={Boolean(clientPassportFile)}
                filename={clientPassportFile?.name}
                uploading={saving}
                canUpload={!saving}
                canDelete={Boolean(clientPassportFile) && !saving}
                showDownload={false}
                uploadLabel="Добавить скан"
                replaceLabel="Заменить скан"
                emptyLabel="Скан не выбран"
                onUpload={(file) => {
                  const pdfError = validatePdfFile(file);
                  if (pdfError) {
                    setClientPassportFileError(pdfError);
                    return;
                  }
                  setClientPassportFile(file);
                  setClientPassportFileError(null);
                }}
                onDelete={() => {
                  setClientPassportFile(null);
                  setClientPassportFileError(null);
                }}
              />
              {clientPassportFileError ? (
                <p className="mt-1 text-xs text-status-danger-text">{clientPassportFileError}</p>
              ) : null}
            </div>
            <div>
              <PdfDocumentField
                label="Скан паспорта поручителя"
                hasFile={Boolean(guarantorPassportFile)}
                filename={guarantorPassportFile?.name}
                uploading={saving}
                canUpload={!saving}
                canDelete={Boolean(guarantorPassportFile) && !saving}
                showDownload={false}
                uploadLabel="Добавить скан"
                replaceLabel="Заменить скан"
                emptyLabel="Скан не выбран"
                onUpload={(file) => {
                  const pdfError = validatePdfFile(file);
                  if (pdfError) {
                    setGuarantorPassportFileError(pdfError);
                    return;
                  }
                  setGuarantorPassportFile(file);
                  setGuarantorPassportFileError(null);
                }}
                onDelete={() => {
                  setGuarantorPassportFile(null);
                  setGuarantorPassportFileError(null);
                }}
              />
              {guarantorPassportFileError ? (
                <p className="mt-1 text-xs text-status-danger-text">{guarantorPassportFileError}</p>
              ) : null}
            </div>
          </div>
        </Card>

        <Card variant="accent">
          <SectionTitle
            title="Товар и рассрочка"
            description="Закупочная цена, условия для клиента и срок"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Название товара" error={formErrors.product_name}>
              <Input
                placeholder="iPhone 15, холодильник..."
                value={form.product_name}
                onChange={(e) => setForm({ ...form, product_name: e.target.value })}
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
            ) : (
              <div />
            )}
            <FormField label="Закупочная цена, ₽" error={formErrors.purchase_price}>
              <Input
                inputMode="decimal"
                placeholder="40000"
                value={form.purchase_price}
                onChange={(e) =>
                  setForm({ ...form, purchase_price: filterDecimalInput(e.target.value) })
                }
                required
              />
            </FormField>
            <FormField label="Цена для клиента (до наценки), ₽" error={formErrors.product_price}>
              <Input
                inputMode="decimal"
                placeholder="50000"
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
            <FormField label="Первоначальный взнос, ₽" error={formErrors.down_payment}>
              <Input
                inputMode="decimal"
                placeholder="0"
                value={form.down_payment}
                onChange={(e) =>
                  setForm({ ...form, down_payment: filterDecimalInput(e.target.value) })
                }
                required
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
                      · прибыль{" "}
                      <span className="font-semibold text-status-success-text">
                        {formatMoney(expectedProfit)}
                      </span>
                    </>
                  ) : null}
                </p>
              </div>
            ) : null}
          </div>
        </Card>

        {error ? <p className="alert-danger">{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Оформление..." : "Оформить сделку"}
          </Button>
          <Link href="/retail/clients">
            <Button type="button" variant="secondary">
              К списку клиентов
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
