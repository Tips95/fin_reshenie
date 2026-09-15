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
        message: error instanceof ApiRequestError ? error.message : "Не удалось сохранить лид",
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
        title="Новый лид"
        subtitle="Заведите карточку прямо во время звонка — достаточно телефона, остальное допишете потом"
        back={<BackLink href="/questionnaires">К списку лидов</BackLink>}
      />
      <QuestionnaireForm
        value={form}
        onChange={setForm}
        onSubmit={() => void handleSubmit()}
        saving={saving}
        submitLabel="Сохранить лид"
      />
    </div>
  );
}
