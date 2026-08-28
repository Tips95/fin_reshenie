"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  BackLink,
  Button,
  Card,
  FormField,
  Input,
  LoadingState,
  PageHeader,
  PhoneInput,
  Select,
} from "@/components/ui";
import { ApiRequestError, civilCasesApi } from "@/lib/api-client";
import { todayIsoDate } from "@/lib/format";
import { canCreateCivilCase } from "@/lib/organization-features";
import { PHONE_PREFIX } from "@/lib/phone";
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
import type { CivilCaseExecutorOption } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

export default function NewCivilCasePage() {
  const { user } = useAuth();
  const router = useRouter();
  const canCreate = canCreateCivilCase(user);
  const [executors, setExecutors] = useState<CivilCaseExecutorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    full_name: "",
    phone: PHONE_PREFIX,
    price: "",
    appeal_date: todayIsoDate(),
    subject: "",
    assigned_executor_id: "",
  });

  useEffect(() => {
    if (user && !canCreate) {
      router.replace("/civil-cases");
    }
  }, [user, canCreate, router]);

  useEffect(() => {
    if (!canCreate) return;
    void (async () => {
      try {
        setExecutors(await civilCasesApi.executors());
      } catch {
        setExecutors([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [canCreate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const errors = collectErrors({
      full_name: validateFullName(form.full_name),
      phone: validatePhone(form.phone),
      price: validatePositiveAmount(form.price, { label: "Цена" }),
      appeal_date: validateRequiredDate(form.appeal_date),
      subject: form.subject.trim().length < 3 ? "Укажите предмет обращения" : null,
    });
    if (hasErrors(errors)) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    setSaving(true);
    setError(null);
    try {
      const created = await civilCasesApi.create({
        full_name: form.full_name.trim().replace(/\s+/g, " "),
        phone: form.phone.trim(),
        price: form.price.trim(),
        appeal_date: form.appeal_date,
        subject: form.subject.trim(),
        assigned_executor_id: form.assigned_executor_id || null,
      });
      router.replace(`/civil-cases/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось создать дело");
    } finally {
      setSaving(false);
    }
  }

  if (!canCreate) {
    return <LoadingState text="Загрузка..." />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Новое гражданское дело"
        subtitle="Клиент попадает исполнителю и ведётся по этапам"
        back={<BackLink href="/civil-cases">К списку дел</BackLink>}
      />

      {error ? <p className="alert-danger">{error}</p> : null}

      <Card>
        {loading ? (
          <LoadingState text="Загрузка исполнителей..." />
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} className="grid gap-3 md:grid-cols-2">
            <FormField label="ФИО клиента" error={formErrors.full_name}>
              <Input
                value={form.full_name}
                onChange={(event) =>
                  setForm({ ...form, full_name: filterPersonName(event.target.value) })
                }
                placeholder="Иванов Иван Иванович"
              />
            </FormField>
            <FormField label="Телефон" error={formErrors.phone}>
              <PhoneInput
                value={form.phone}
                onValueChange={(phone) => setForm({ ...form, phone })}
              />
            </FormField>
            <FormField label="Цена" error={formErrors.price}>
              <Input
                inputMode="decimal"
                value={form.price}
                onChange={(event) =>
                  setForm({ ...form, price: filterDecimalInput(event.target.value) })
                }
                placeholder="0.00"
              />
            </FormField>
            <FormField label="Дата обращения" error={formErrors.appeal_date}>
              <Input
                type="date"
                value={form.appeal_date}
                onChange={(event) => setForm({ ...form, appeal_date: event.target.value })}
              />
            </FormField>
            <div className="md:col-span-2">
              <FormField label="Предмет обращения" error={formErrors.subject}>
                <textarea
                  value={form.subject}
                  onChange={(event) => setForm({ ...form, subject: event.target.value })}
                  className="interactive min-h-[72px] w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-soft outline-none placeholder:text-muted focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
                  placeholder="Например: жалоба в администрацию, иск о взыскании, раздел имущества"
                />
              </FormField>
            </div>
            <div className="md:col-span-2">
              <FormField label="Исполнитель">
              <Select
                value={form.assigned_executor_id}
                onChange={(event) => setForm({ ...form, assigned_executor_id: event.target.value })}
              >
                <option value="">Назначить позже</option>
                {executors.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.full_name}
                  </option>
                ))}
              </Select>
              {executors.length === 0 ? (
                <p className="mt-1 text-[11px] text-muted">
                  Сначала добавьте сотрудника с ролью «Исполнитель» в разделе «Команда».
                </p>
              ) : null}
              </FormField>
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Сохранение..." : "Завести дело"}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
