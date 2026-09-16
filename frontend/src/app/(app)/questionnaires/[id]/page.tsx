"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { BackLink, Button, LoadingState, Toast } from "@/components/ui";
import { ApiRequestError, getDuplicateClientId, questionnairesApi } from "@/lib/api-client";
import { canOpenClientCards, canSuperviseLeads } from "@/lib/organization-features";
import { useAuth } from "@/modules/auth/AuthProvider";
import { CallHistoryTimeline } from "@/modules/questionnaires/CallHistoryTimeline";
import {
  DeleteLeadModal,
  LeadClientHeader,
} from "@/modules/questionnaires/LeadClientHeader";
import { LeadOverview } from "@/modules/questionnaires/LeadOverview";
import { LeadPanel, type LeadPanelOpenForm } from "@/modules/questionnaires/LeadPanel";
import { LeadSectionNav, useActiveLeadSection } from "@/modules/questionnaires/LeadSectionNav";
import { QuestionnaireForm } from "@/modules/questionnaires/QuestionnaireForm";
import {
  formToPayload,
  questionnaireToForm,
  type QuestionnaireFormValue,
} from "@/modules/questionnaires/defaults";
import {
  UnsavedChangesGuard,
  questionnaireFormSnapshot,
} from "@/modules/questionnaires/UnsavedChangesGuard";
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [panelForm, setPanelForm] = useState<LeadPanelOpenForm>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(
    null,
  );
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const { active, scrollTo } = useActiveLeadSection();

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
      setToast({ message: "Изменения сохранены", tone: "success" });
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

  function discardChanges() {
    if (!item) return;
    const nextForm = questionnaireToForm(item);
    setForm(nextForm);
    setBaseline(questionnaireFormSnapshot(formToPayload(nextForm)));
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
      setDeleteOpen(false);
    }
  }

  if (loading || !form || !item) {
    return <LoadingState text="Загрузка карточки..." />;
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
      <DeleteLeadModal
        open={deleteOpen}
        deleting={deleting}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void handleDelete()}
      />
      {toast ? (
        <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />
      ) : null}

      <BackLink href="/questionnaires">К списку лидов</BackLink>

      <LeadClientHeader
        item={item}
        canDelete={user?.role === "owner"}
        deleting={deleting}
        creatingClient={creatingClient || saving}
        canOpenClient={canOpenClientCards(user)}
        onCallAnswered={() => setPanelForm("answered")}
        onCallNoAnswer={() => setPanelForm("no_answer")}
        onBookAppointment={() => setPanelForm("appointment")}
        onCreateClient={() => void handleCreateClient()}
        onOpenClient={() => {
          const href = `/clients/${item.client_id}`;
          if (dirty) setLeaveHref(href);
          else router.push(href);
        }}
        onDelete={() => setDeleteOpen(true)}
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <LeadSectionNav active={active} onSelect={scrollTo} />

        <div className="min-w-0 flex-1 space-y-4">
          <LeadOverview item={item} form={form} />

          <div id="status-panel" className="scroll-mt-24">
            <LeadPanel
              item={item}
              managers={managers}
              canAssign={canSuperviseLeads(user)}
              openForm={panelForm}
              onOpenFormChange={setPanelForm}
              onUpdated={(next) => {
                setItem(next);
                const nextForm = questionnaireToForm(next);
                // Preserve unsaved form edits outside lead-status fields when possible:
                // appointment/lead fields come from server; merge phone/name etc from current form only if clean.
                if (!dirty) {
                  setForm(nextForm);
                  setBaseline(questionnaireFormSnapshot(formToPayload(nextForm)));
                } else {
                  setForm((prev) =>
                    prev
                      ? {
                          ...prev,
                          appointment_at: next.appointment_at,
                          appointment_note: next.appointment_note ?? "",
                        }
                      : nextForm,
                  );
                }
              }}
              onError={(message) => setToast({ message, tone: "error" })}
            />
          </div>

          <QuestionnaireForm
            value={form}
            onChange={setForm}
            onSubmit={() => void saveQuestionnaire().catch(() => undefined)}
            saving={saving}
            dirty={dirty}
            onDiscard={discardChanges}
            submitLabel="Сохранить изменения"
            showAppointmentInContacts={false}
            hideHistoryHint
            extraActions={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={downloading}
                onClick={() => void handlePdf()}
              >
                {downloading ? "PDF..." : "Скачать PDF"}
              </Button>
            }
          />

          <CallHistoryTimeline calls={item.calls} />
        </div>
      </div>
    </div>
  );
}
