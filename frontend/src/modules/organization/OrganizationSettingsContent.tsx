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
import type { Organization, OrganizationFeatures } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

type FeatureKey = keyof OrganizationFeatures;

const FEATURES: { key: FeatureKey; label: string; hint: string }[] = [
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

export function OrganizationSettingsContent({ homeHref }: { homeHref: string }) {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const isOwner = user?.role === "owner";
  const canAccess = user?.role === "owner" || user?.role === "collector";
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [features, setFeatures] = useState<OrganizationFeatures | null>(null);
  const [greenApiUrl, setGreenApiUrl] = useState("");
  const [greenApiId, setGreenApiId] = useState("");
  const [greenApiToken, setGreenApiToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user && !canAccess) {
      router.replace(homeHref);
    }
  }, [user, router, homeHref, canAccess]);

  useEffect(() => {
    if (!canAccess) return;
    void (async () => {
      setLoading(true);
      try {
        const data = await organizationsApi.current();
        setOrganization(data);
        setName(data.name);
        setFeatures(data.features);
        setGreenApiUrl(data.green_api_url ?? "");
        setGreenApiId(data.green_api_id_instance ?? "");
        setGreenApiToken("");
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Не удалось загрузить настройки");
      } finally {
        setLoading(false);
      }
    })();
  }, [canAccess, user?.role]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (isOwner && !features) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const payload: Record<string, unknown> = {
        green_api_url: greenApiUrl.trim(),
        green_api_id_instance: greenApiId.trim(),
      };
      if (isOwner && features) {
        payload.name = name.trim();
        payload.feature_document_collection = features.document_collection;
        payload.feature_tasks = features.tasks;
        payload.feature_expenses = features.expenses;
        payload.feature_pricing = features.pricing;
        payload.feature_analytics = features.analytics;
      }
      if (greenApiToken.trim()) {
        payload.green_api_token_instance = greenApiToken.trim();
      }
      const updated = await organizationsApi.update(payload);
      setOrganization(updated);
      setName(updated.name);
      setFeatures(updated.features);
      setGreenApiUrl(updated.green_api_url ?? "");
      setGreenApiId(updated.green_api_id_instance ?? "");
      setGreenApiToken("");
      await refreshUser();
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  if (!canAccess) {
    return <LoadingState text="Недостаточно прав" />;
  }

  if (loading || (isOwner && !features)) {
    return <LoadingState text="Загрузка настроек..." />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Настройки компании"
        subtitle={
          isOwner
            ? "Подстройте название, WhatsApp и разделы"
            : "Подключение WhatsApp (Green API) для рассылки"
        }
      />

      {error && <p className="alert-danger">{error}</p>}
      {saved && (
        <p className="alert-success px-2 py-1.5 text-xs">
          Сохранено
          {isOwner ? ". Меню обновится сразу — данные клиентов не затронуты." : "."}
        </p>
      )}

      <form onSubmit={handleSave} className="page-stack">
        {isOwner ? (
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
                id {organization.id.slice(0, 8)}…
              </p>
            )}
          </Card>
        ) : null}

        <Card>
          <SectionTitle
            title="WhatsApp · Green API"
            description="Ключи из консоли Green API. После сохранения рассылка на дашборде заработает сразу."
          />
          {organization?.green_api_configured ? (
            <p className="mb-3 text-xs text-status-success-text">
              Подключено
              {organization.green_api_from_env ? " (из переменных сервера)" : ""}.
              {organization.green_api_token_set ? " Токен сохранён." : ""}
            </p>
          ) : (
            <p className="mb-3 text-xs text-status-warning-text">
              Пока не подключено — вставьте значения со страницы instance в Green API.
            </p>
          )}
          <div className="space-y-3">
            <FormField label="apiUrl">
              <Input
                value={greenApiUrl}
                onChange={(e) => setGreenApiUrl(e.target.value)}
                placeholder="https://7201.api.green-api.com"
                autoComplete="off"
              />
            </FormField>
            <FormField label="idInstance">
              <Input
                value={greenApiId}
                onChange={(e) => setGreenApiId(e.target.value)}
                placeholder="720122811283"
                autoComplete="off"
              />
            </FormField>
            <FormField
              label={
                organization?.green_api_token_set
                  ? "apiTokenInstance (оставьте пустым, чтобы не менять)"
                  : "apiTokenInstance"
              }
            >
              <Input
                type="password"
                value={greenApiToken}
                onChange={(e) => setGreenApiToken(e.target.value)}
                placeholder={
                  organization?.green_api_token_set ? "•••••••• (сохранён)" : "токен из консоли"
                }
                autoComplete="new-password"
              />
            </FormField>
          </div>
        </Card>

        {isOwner && features ? (
          <Card>
            <SectionTitle
              title="Разделы"
              description="Выключите то, чем не пользуетесь. Скрытый раздел пропадает из меню; уже внесённые данные остаются в базе."
            />
            <div className="space-y-2">
              {FEATURES.map((item) => (
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
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={saving || (isOwner && name.trim().length < 2)}
          >
            {saving ? "Сохранение..." : "Сохранить"}
          </Button>
        </div>
      </form>
    </div>
  );
}
