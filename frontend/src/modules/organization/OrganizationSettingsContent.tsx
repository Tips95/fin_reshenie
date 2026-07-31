"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Button,
  Card,
  FormField,
  Input,
  LoadingState,
  PageHeader,
  SectionTitle,
} from "@/components/ui";
import { ApiRequestError, organizationsApi } from "@/lib/api-client";
import type { Organization, OrganizationFeatures, OrganizationType } from "@/lib/types";
import { WORKSPACE_LABELS } from "@/lib/workspace";
import { useAuth } from "@/modules/auth/AuthProvider";

type FeatureKey = keyof OrganizationFeatures;

const LEGAL_FEATURES: { key: FeatureKey; label: string; hint: string }[] = [
  {
    key: "document_collection",
    label: "Сбор документов",
    hint: "Отдельный этап до договора и раздел в меню",
  },
  {
    key: "tasks",
    label: "Задачи и воронка",
    hint: "Просрочки, первый платёж, этапы процедуры",
  },
  {
    key: "expenses",
    label: "Расходы",
    hint: "Ежемесячные статьи расходов компании",
  },
  {
    key: "pricing",
    label: "Тарифы",
    hint: "Сетка стоимости договоров по сумме долга",
  },
  {
    key: "analytics",
    label: "Аналитика",
    hint: "Отдельный экран аналитики для руководителя",
  },
];

const RETAIL_FEATURES: { key: FeatureKey; label: string; hint: string }[] = [
  {
    key: "investors",
    label: "Инвесторы",
    hint: "Раздел инвесторов и их вкладов",
  },
];

export function OrganizationSettingsContent({
  homeHref,
  organizationType,
}: {
  homeHref: string;
  organizationType: OrganizationType;
}) {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [features, setFeatures] = useState<OrganizationFeatures | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user && user.role !== "owner") {
      router.replace(homeHref);
    }
  }, [user, router, homeHref]);

  useEffect(() => {
    if (user?.role !== "owner") return;
    void (async () => {
      setLoading(true);
      try {
        const data = await organizationsApi.current();
        setOrganization(data);
        setName(data.name);
        setFeatures(data.features);
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Не удалось загрузить настройки");
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.role]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!features) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await organizationsApi.update({
        name: name.trim(),
        feature_document_collection: features.document_collection,
        feature_tasks: features.tasks,
        feature_expenses: features.expenses,
        feature_pricing: features.pricing,
        feature_analytics: features.analytics,
        feature_investors: features.investors,
      });
      setOrganization(updated);
      setName(updated.name);
      setFeatures(updated.features);
      await refreshUser();
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  if (user?.role !== "owner") {
    return <LoadingState text="Доступ только для руководителя" />;
  }

  if (loading || !features) {
    return <LoadingState text="Загрузка настроек..." />;
  }

  const featureList = organizationType === "retail" ? RETAIL_FEATURES : LEGAL_FEATURES;
  const contourLabel =
    organizationType === "retail" ? WORKSPACE_LABELS.retail : WORKSPACE_LABELS.legal;

  return (
    <div className="page-stack">
      <PageHeader
        title="Настройки компании"
        subtitle={`${contourLabel} · подстройте название и разделы под себя`}
      />

      {error && <p className="alert-danger">{error}</p>}
      {saved && (
        <p className="alert-success px-2 py-1.5 text-xs">
          Сохранено. Меню обновится сразу — данные клиентов не затронуты.
        </p>
      )}

      <form onSubmit={handleSave} className="page-stack">
        <Card>
          <SectionTitle
            title="Компания"
            description="Это имя видят сотрудники в меню. На платформе у каждой компании своё."
          />
          <FormField label="Название компании">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ООО «Ваша компания»"
              required
              minLength={2}
            />
          </FormField>
          {organization && (
            <p className="mt-2 text-[11px] text-muted">
              Контур: {contourLabel} · id {organization.id.slice(0, 8)}…
            </p>
          )}
        </Card>

        <Card>
          <SectionTitle
            title="Разделы"
            description="Выключите то, чем не пользуетесь. Скрытый раздел пропадает из меню; уже внесённые данные остаются в базе."
          />
          <div className="space-y-2">
            {featureList.map((item) => (
              <label
                key={item.key}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-surface-muted px-3 py-2"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={features[item.key]}
                  onChange={(e) =>
                    setFeatures({ ...features, [item.key]: e.target.checked })
                  }
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">{item.label}</span>
                  <span className="block text-[11px] text-muted">{item.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving || name.trim().length < 2}>
            {saving ? "Сохранение..." : "Сохранить"}
          </Button>
        </div>
      </form>
    </div>
  );
}
