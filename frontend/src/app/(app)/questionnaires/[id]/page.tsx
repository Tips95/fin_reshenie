"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { BackLink, Button, LoadingState, PageHeader, Toast } from "@/components/ui";
import { ApiRequestError, getDuplicateClientId, questionnairesApi } from "@/lib/api-client";
import { QuestionnaireForm } from "@/modules/questionnaires/QuestionnaireForm";
import { LeadPanel } from "@/modules/questionnaires/LeadPanel";
import {
  formToPayload,
  questionnaireToForm,
  type QuestionnaireFormValue,
} from "@/modules/questionnaires/defaults";
import {
  UnsavedChangesGuard,
  questionnaireFormSnapshot,
} from "@/modules/questionnaires/UnsavedChangesGuard";
import { canOpenClientCards, canSuperviseLeads } from "@/lib/organization-features";
import { useAuth } from "@/modules/auth/AuthProvider";
import type { LeadManagerOption, Questionnaire } from "@/lib/types";

export default function QuestionnaireDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [item, setItem] = useState<Questionnaire | null>(null);
  const [form, setForm] = useState<QuestionnaireFormValue | null>(null);
  const [baseline, setBaseline] = useState<string>("");
  const [managers, setManagers] = useState<LeadManagerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(
    null,
  );
  const [leaveHref, setLeaveHref] = useState<string | null>(null);

  const dirty = useMemo(() => {
    if (!form || !baseline) return false;
    return questionnaireFormSnapshot(formToPayload(form)) !== baseline;
  }, [form, baseline]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await questionnairesApi.get(params.id);
        const nextForm = questionnaireToForm(data);
        setItem(data);
        setForm(nextForm);
        setBaseline(questionnaireFormSnapshot(formToPayload(nextForm)));
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

  useEffect(() => {
    if (!canSuperviseLeads(user)) return;
    void (async () => {
      try {
        setManagers(await questionnairesApi.managers());
      } catch {
        setManagers([]);
      }
    })();
  }, [user]);

  async function saveQuestionnaire() {
    if (!form) return;
    setSaving(true);
    try {
      const updated = await questionnairesApi.update(params.id, formToPayload(form));
      const nextForm = questionnaireToForm(updated);
      setItem(updated);
      setForm(nextForm);
      setBaseline(questionnaireFormSnapshot(formToPayload(nextForm)));
      setToast({ message: "Анкета сохранена", tone: "success" });
    } catch (error) {
      setToast({
        message: error instanceof ApiRequestError ? error.message : "Не удалось сохранить",
        tone: "error",
      });
      throw error;
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
    if (dirty) {
      try {
        await saveQuestionnaire();
      } catch {
        return;
      }
    }
    setCreatingClient(true);
    try {
      const updated = await questionnairesApi.createClient(params.id);
      setItem(updated);
      const nextForm = questionnaireToForm(updated);
      setForm(nextForm);
      setBaseline(questionnaireFormSnapshot(formToPayload(nextForm)));
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
      <UnsavedChangesGuard
        dirty={dirty && !saving && !deleting}
        saving={saving}
        onSave={saveQuestionnaire}
        requestHref={leaveHref}
        onRequestHandled={() => setLeaveHref(null)}
        title="Сохранить анкету перед выходом?"
        description="Есть несохранённые изменения. Если уйдёте сейчас — они пропадут."
      />
      {toast ? (
        <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />
      ) : null}
      <PageHeader
        title={item.full_name || item.phone || "Лид без имени"}
        subtitle={item.client_id ? "Привязана к карточке клиента" : "Клиент ещё не заведён"}
        back={<BackLink href="/questionnaires">К списку лидов</BackLink>}
        action={
          user?.role === "owner" ? (
            <Button type="button" variant="danger" disabled={deleting} onClick={() => void handleDelete()}>
              {deleting ? "Удаление..." : "Удалить"}
            </Button>
          ) : undefined
        }
      />
      <LeadPanel
        item={item}
        managers={managers}
        canAssign={canSuperviseLeads(user)}
        onUpdated={(next) => {
          setItem(next);
          const nextForm = questionnaireToForm(next);
          setForm(nextForm);
          setBaseline(questionnaireFormSnapshot(formToPayload(nextForm)));
        }}
        onError={(message) => setToast({ message, tone: "error" })}
      />
      <QuestionnaireForm
        value={form}
        onChange={setForm}
        onSubmit={() => void saveQuestionnaire().catch(() => undefined)}
        saving={saving}
        submitLabel="Сохранить анкету"
        extraActions={
          <>
            <Button type="button" variant="secondary" disabled={downloading} onClick={() => void handlePdf()}>
              {downloading ? "PDF..." : "Скачать PDF"}
            </Button>
            {item.client_id ? (
              canOpenClientCards(user) ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const href = `/clients/${item.client_id}`;
                    if (dirty) setLeaveHref(href);
                    else router.push(href);
                  }}
                >
                  Карточка клиента
                </Button>
              ) : null
            ) : (
              <Button
                type="button"
                variant="secondary"
                disabled={creatingClient || saving}
                onClick={() => void handleCreateClient()}
              >
                {creatingClient || saving ? "Сохранение..." : "Создать клиента"}
              </Button>
            )}
          </>
        }
      />
    </div>
  );
}
