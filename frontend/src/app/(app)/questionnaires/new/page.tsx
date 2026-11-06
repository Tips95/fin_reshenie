"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { BackLink, PageHeader, Toast } from "@/components/ui";
import {
  ApiRequestError,
  getDuplicateQuestionnaireId,
  questionnairesApi,
} from "@/lib/api-client";
import { isRemoteAgent } from "@/lib/organization-features";
import { useAuth } from "@/modules/auth/AuthProvider";
import { QuestionnaireForm } from "@/modules/questionnaires/QuestionnaireForm";
import {
  emptyQuestionnaireForm,
  formToPayload,
  type QuestionnaireFormValue,
} from "@/modules/questionnaires/defaults";
import {
  UnsavedChangesGuard,
  questionnaireFormSnapshot,
} from "@/modules/questionnaires/UnsavedChangesGuard";

export default function NewQuestionnairePage() {
  const router = useRouter();
  const { user } = useAuth();
  const agentMode = isRemoteAgent(user);
  const [form, setForm] = useState<QuestionnaireFormValue>(() => emptyQuestionnaireForm());
  const [pdConsent, setPdConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(
    null,
  );
  const baselineRef = useRef(questionnaireFormSnapshot(formToPayload(emptyQuestionnaireForm())));
  const savingLockRef = useRef(false);
  const dirty = useMemo(
    () => questionnaireFormSnapshot(formToPayload(form)) !== baselineRef.current,
    [form],
  );

  async function saveLead() {
    if (savingLockRef.current) return;
    if (agentMode && !pdConsent) {
      setToast({
        message: "Отметьте, что клиент согласен на передачу своих данных компании",
        tone: "error",
      });
      throw new Error("pd consent required");
    }
    savingLockRef.current = true;
    setSaving(true);
    try {
      const created = await questionnairesApi.create({
        ...formToPayload(form),
        pd_consent: pdConsent,
      });
      baselineRef.current = questionnaireFormSnapshot(formToPayload(form));
      try {
        sessionStorage.setItem("lead-saved-flash", "1");
      } catch {
        /* приватный режим — карточка всё равно откроется */
      }
      router.replace(`/questionnaires/${created.id}`);
    } catch (error) {
      const existingId = getDuplicateQuestionnaireId(error);
      if (existingId) {
        setToast({
          message:
            error instanceof ApiRequestError
              ? error.message
              : "Лид с этим телефоном уже есть — открываем карточку",
          tone: "info",
        });
        router.replace(`/questionnaires/${existingId}`);
        return;
      }
      setToast({
        message: error instanceof ApiRequestError ? error.message : "Не удалось сохранить лид",
        tone: "error",
      });
      throw error;
    } finally {
      savingLockRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="page-stack">
      <UnsavedChangesGuard
        dirty={dirty && !saving}
        saving={saving}
        onSave={saveLead}
        title="Сохранить лид перед выходом?"
        description="Карточка ещё не сохранена. Если уйдёте сейчас — данные звонка пропадут."
      />
      {toast ? (
        <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />
      ) : null}
      <PageHeader
        title={agentMode ? "Новый клиент" : "Новый лид"}
        subtitle={
          agentMode
            ? "Заполните анкету вместе с клиентом и запишите его на приём в офис"
            : "Заведите карточку прямо во время звонка — достаточно телефона, остальное допишете потом"
        }
        back={
          <BackLink href={agentMode ? "/agent" : "/questionnaires"}>
            {agentMode ? "В кабинет" : "К списку лидов"}
          </BackLink>
        }
      />
      {agentMode ? (
        <label className="flex items-start gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm shadow-soft">
          <input
            type="checkbox"
            className="mt-1"
            checked={pdConsent}
            onChange={(event) => setPdConsent(event.target.checked)}
          />
          <span>
            Клиент согласен, что его данные будут переданы компании для консультации и
            оформления банкротства
          </span>
        </label>
      ) : null}
      <QuestionnaireForm
        value={form}
        onChange={setForm}
        onSubmit={() => void saveLead().catch(() => undefined)}
        saving={saving}
        dirty={dirty}
        submitLabel="Сохранить лид"
        showAppointmentInContacts
      />
    </div>
  );
}
