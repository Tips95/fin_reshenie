"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { BackLink, Button, LoadingState, PageHeader, Toast } from "@/components/ui";
import { ApiRequestError, getDuplicateClientId, questionnairesApi } from "@/lib/api-client";
import { QuestionnaireForm } from "@/modules/questionnaires/QuestionnaireForm";
import {
  formToPayload,
  questionnaireToForm,
  type QuestionnaireFormValue,
} from "@/modules/questionnaires/defaults";
import { useAuth } from "@/modules/auth/AuthProvider";
import type { Questionnaire } from "@/lib/types";

export default function QuestionnaireDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [item, setItem] = useState<Questionnaire | null>(null);
  const [form, setForm] = useState<QuestionnaireFormValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(
    null,
  );

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await questionnairesApi.get(params.id);
        setItem(data);
        setForm(questionnaireToForm(data));
      } catch (error) {
        setToast({
          message: error instanceof ApiRequestError ? error.message : "Анкета не найдена",
          tone: "error",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [params.id]);

  async function handleSubmit() {
    if (!form) return;
    setSaving(true);
    try {
      const updated = await questionnairesApi.update(params.id, formToPayload(form));
      setItem(updated);
      setForm(questionnaireToForm(updated));
      setToast({ message: "Анкета сохранена", tone: "success" });
    } catch (error) {
      setToast({
        message: error instanceof ApiRequestError ? error.message : "Не удалось сохранить",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handlePdf() {
    setDownloading(true);
    try {
      await questionnairesApi.downloadPdf(params.id, `anketa_${params.id.slice(0, 8)}.pdf`);
    } catch (error) {
      setToast({
        message: error instanceof ApiRequestError ? error.message : "Не удалось скачать PDF",
        tone: "error",
      });
    } finally {
      setDownloading(false);
    }
  }

  async function handleCreateClient() {
    setCreatingClient(true);
    try {
      const updated = await questionnairesApi.createClient(params.id);
      setItem(updated);
      setForm(questionnaireToForm(updated));
      if (updated.client_id) {
        router.push(`/clients/${updated.client_id}`);
      }
    } catch (error) {
      const clientId = getDuplicateClientId(error);
      if (clientId) {
        setToast({
          message: "Клиент с такими данными уже есть — можно открыть его карточку",
          tone: "info",
        });
        router.push(`/clients/${clientId}`);
        return;
      }
      setToast({
        message:
          error instanceof ApiRequestError
            ? error.message
            : "Не удалось создать клиента. Проверьте ФИО и телефон.",
        tone: "error",
      });
    } finally {
      setCreatingClient(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Удалить анкету? Карточка клиента не будет затронута.")) return;
    setDeleting(true);
    try {
      await questionnairesApi.remove(params.id);
      router.replace("/questionnaires");
    } catch (error) {
      setToast({
        message: error instanceof ApiRequestError ? error.message : "Не удалось удалить",
        tone: "error",
      });
      setDeleting(false);
    }
  }

  if (loading || !form || !item) {
    return <LoadingState text="Загрузка анкеты..." />;
  }

  return (
    <div className="page-stack">
      {toast ? (
        <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />
      ) : null}
      <PageHeader
        title={item.full_name}
        subtitle={item.client_id ? "Привязана к карточке клиента" : "Клиент ещё не заведён"}
        back={<BackLink href="/questionnaires">К списку анкет</BackLink>}
        action={
          user?.role === "owner" ? (
            <Button type="button" variant="danger" disabled={deleting} onClick={() => void handleDelete()}>
              {deleting ? "Удаление..." : "Удалить"}
            </Button>
          ) : undefined
        }
      />
      <QuestionnaireForm
        value={form}
        onChange={setForm}
        onSubmit={() => void handleSubmit()}
        saving={saving}
        submitLabel="Сохранить анкету"
        extraActions={
          <>
            <Button type="button" variant="secondary" disabled={downloading} onClick={() => void handlePdf()}>
              {downloading ? "PDF..." : "Скачать PDF"}
            </Button>
            {item.client_id ? (
              <Button type="button" variant="secondary" onClick={() => router.push(`/clients/${item.client_id}`)}>
                Карточка клиента
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                disabled={creatingClient}
                onClick={() => void handleCreateClient()}
              >
                {creatingClient ? "Создание..." : "Создать клиента"}
              </Button>
            )}
          </>
        }
      />
    </div>
  );
}
