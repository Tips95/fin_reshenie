"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { BackLink, PageHeader, Toast } from "@/components/ui";
import {
  ApiRequestError,
  getDuplicateQuestionnaireId,
  questionnairesApi,
} from "@/lib/api-client";
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
  const [form, setForm] = useState<QuestionnaireFormValue>(() => emptyQuestionnaireForm());
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
    savingLockRef.current = true;
    setSaving(true);
    try {
      const created = await questionnairesApi.create(formToPayload(form));
      baselineRef.current = questionnaireFormSnapshot(formToPayload(form));
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
        title="Новый лид"
        subtitle="Заведите карточку прямо во время звонка — достаточно телефона, остальное допишете потом"
        back={<BackLink href="/questionnaires">К списку лидов</BackLink>}
      />
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
