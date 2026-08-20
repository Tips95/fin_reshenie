"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BackLink, PageHeader, Toast } from "@/components/ui";
import { ApiRequestError, questionnairesApi } from "@/lib/api-client";
import { QuestionnaireForm } from "@/modules/questionnaires/QuestionnaireForm";
import {
  emptyQuestionnaireForm,
  formToPayload,
  type QuestionnaireFormValue,
} from "@/modules/questionnaires/defaults";

export default function NewQuestionnairePage() {
  const router = useRouter();
  const [form, setForm] = useState<QuestionnaireFormValue>(() => emptyQuestionnaireForm());
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  async function handleSubmit() {
    setSaving(true);
    try {
      const created = await questionnairesApi.create(formToPayload(form));
      router.replace(`/questionnaires/${created.id}`);
    } catch (error) {
      setToast({
        message: error instanceof ApiRequestError ? error.message : "Не удалось сохранить анкету",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-stack">
      {toast ? (
        <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />
      ) : null}
      <PageHeader
        title="Новая анкета"
        subtitle="Сохраняется сразу, даже если клиент ещё не заведён в договоры"
        back={<BackLink href="/questionnaires">К списку анкет</BackLink>}
      />
      <QuestionnaireForm
        value={form}
        onChange={setForm}
        onSubmit={() => void handleSubmit()}
        saving={saving}
        submitLabel="Сохранить анкету"
      />
    </div>
  );
}
