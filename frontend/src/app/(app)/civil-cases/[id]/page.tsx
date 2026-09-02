"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  BackLink,
  Badge,
  Button,
  Card,
  FormField,
  Input,
  LoadingState,
  PageHeader,
  PhoneInput,
  SectionTitle,
  Select,
  Toast,
} from "@/components/ui";
import { ApiRequestError, civilCasesApi } from "@/lib/api-client";
import { civilCaseStageLabel, formatDate, formatDateTime, formatMoney, todayIsoDate } from "@/lib/format";
import { canCreateCivilCase, canUploadCivilClientDocuments, canUploadCivilPreparedDocuments, canUseCivilCases, civilExecutorGroups } from "@/lib/organization-features";
import { PHONE_PREFIX } from "@/lib/phone";
import {
  collectErrors,
  filterDecimalInput,
  filterPersonName,
  hasErrors,
  validateDocumentFile,
  validateFullName,
  validatePhone,
  validatePositiveAmount,
  validateRequiredDate,
} from "@/lib/validation";
import type { CivilCase, CivilCaseDocument, CivilCaseDocumentKind, CivilCaseExecutorOption, CivilCaseStage } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

function stageTone(stage: CivilCaseStage): "default" | "success" | "warning" | "danger" {
  if (stage === "completed") return "success";
  if (stage === "submitted" || stage === "documents") return "warning";
  return "default";
}

const DOCUMENT_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,application/pdf,image/jpeg,image/png,image/webp";

function CivilDocumentSlot({
  title,
  description,
  emptyText,
  documents,
  canUpload,
  canDelete,
  uploading,
  downloadingId,
  onUpload,
  onDownload,
  onDelete,
}: {
  title: string;
  description: string;
  emptyText: string;
  documents: CivilCaseDocument[];
  canUpload: boolean;
  canDelete: boolean;
  uploading: boolean;
  downloadingId: string | null;
  onUpload: (file: File) => void;
  onDownload: (doc: CivilCaseDocument) => void;
  onDelete: (documentId: string) => void;
}) {
  return (
    <Card>
      <SectionTitle title={title} description={description} />
      {canUpload ? (
        <label className="interactive inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground shadow-soft hover:border-border-strong hover:bg-surface-muted">
          <input
            type="file"
            accept={DOCUMENT_ACCEPT}
            className="hidden"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.target.value = "";
            }}
          />
          {uploading ? "Загрузка..." : "Загрузить"}
        </label>
      ) : (
        <p className="text-[11px] text-muted">Только просмотр и скачивание</p>
      )}
      {documents.length === 0 ? (
        <p className="mt-3 text-xs text-muted">{emptyText}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-muted px-2 py-1.5 text-xs"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{doc.filename}</p>
                <p className="text-[11px] text-muted">
                  {doc.uploaded_by_name || "сотрудник"} · {formatDateTime(doc.created_at)}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={downloadingId === doc.id}
                  onClick={() => onDownload(doc)}
                >
                  {downloadingId === doc.id ? "Скачивание..." : "Скачать"}
                </Button>
                {canDelete ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={uploading}
                    onClick={() => onDelete(doc.id)}
                  >
                    Удалить
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function CivilCaseDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const canView = canUseCivilCases(user);
  const canManageIntake = canCreateCivilCase(user);
  const canUploadClientDocs = canUploadCivilClientDocuments(user);
  const [item, setItem] = useState<CivilCase | null>(null);
  const [executors, setExecutors] = useState<CivilCaseExecutorOption[]>([]);
  const [managers, setManagers] = useState<CivilCaseExecutorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [movement, setMovement] = useState("");
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [intake, setIntake] = useState({
    full_name: "",
    phone: PHONE_PREFIX,
    price: "",
    appeal_date: "",
    subject: "",
    assigned_executor_id: "",
    concluding_manager_id: "",
  });
  const [work, setWork] = useState({
    documents_prepared: false,
    documents_prepared_at: "",
    documents_note: "",
    submitted: false,
    submitted_at: "",
    authority_name: "",
    executed: false,
    executed_at: "",
    execution_note: "",
  });

  useEffect(() => {
    if (!canView && user) {
      router.replace("/");
    }
  }, [canView, user, router]);

  async function loadCase() {
    const data = await civilCasesApi.get(params.id);
    setItem(data);
    setIntake({
      full_name: data.full_name,
      phone: data.phone || PHONE_PREFIX,
      price: data.price ?? "",
      appeal_date: data.appeal_date,
      subject: data.subject,
      assigned_executor_id: data.assigned_executor_id ?? "",
      concluding_manager_id: data.concluding_manager_id ?? "",
    });
    setWork({
      documents_prepared: Boolean(data.documents_prepared_at),
      documents_prepared_at: data.documents_prepared_at ?? todayIsoDate(),
      documents_note: data.documents_note ?? "",
      submitted: Boolean(data.submitted_at),
      submitted_at: data.submitted_at ?? todayIsoDate(),
      authority_name: data.authority_name ?? "",
      executed: Boolean(data.executed_at),
      executed_at: data.executed_at ?? todayIsoDate(),
      execution_note: data.execution_note ?? "",
    });
  }

  useEffect(() => {
    if (!canView) return;
    void (async () => {
      setLoading(true);
      try {
        await loadCase();
        if (canManageIntake) {
          try {
            const [executorRows, managerRows] = await Promise.all([
              civilCasesApi.executors(),
              civilCasesApi.managers(),
            ]);
            setExecutors(executorRows);
            setManagers(managerRows);
          } catch {
            setExecutors([]);
            setManagers([]);
          }
        }
      } catch (err) {
        setToast({
          message: err instanceof ApiRequestError ? err.message : "Дело не найдено",
          tone: "error",
        });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, params.id, canManageIntake]);

  async function saveIntake() {
    const errors = collectErrors({
      full_name: validateFullName(intake.full_name),
      phone: validatePhone(intake.phone),
      price: validatePositiveAmount(intake.price, { label: "Цена" }),
      appeal_date: validateRequiredDate(intake.appeal_date),
      subject: intake.subject.trim().length < 3 ? "Укажите предмет обращения" : null,
      concluding_manager_id: intake.concluding_manager_id ? null : "Укажите, кто заключил клиента",
    });
    if (hasErrors(errors)) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    setSaving(true);
    try {
      const updated = await civilCasesApi.update(params.id, {
        full_name: intake.full_name.trim().replace(/\s+/g, " "),
        phone: intake.phone.trim(),
        price: intake.price.trim(),
        appeal_date: intake.appeal_date,
        subject: intake.subject.trim(),
        assigned_executor_id: intake.assigned_executor_id || null,
        concluding_manager_id: intake.concluding_manager_id || null,
      });
      setItem(updated);
      setToast({ message: "Данные клиента сохранены", tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof ApiRequestError ? err.message : "Не удалось сохранить",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveWork() {
    setSaving(true);
    try {
      const updated = await civilCasesApi.update(params.id, {
        documents_prepared_at: work.documents_prepared ? work.documents_prepared_at || todayIsoDate() : null,
        documents_note: work.documents_note.trim() || null,
        submitted_at: work.submitted ? work.submitted_at || todayIsoDate() : null,
        authority_name: work.authority_name.trim() || null,
        executed_at: work.executed ? work.executed_at || todayIsoDate() : null,
        execution_note: work.execution_note.trim() || null,
      });
      setItem(updated);
      setToast({ message: "Этапы обновлены", tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof ApiRequestError ? err.message : "Не удалось сохранить этапы",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleMovement(event: React.FormEvent) {
    event.preventDefault();
    if (!movement.trim()) return;
    setSaving(true);
    try {
      const updated = await civilCasesApi.addMovement(params.id, movement.trim());
      setItem(updated);
      setMovement("");
      setToast({ message: "Запись добавлена", tone: "success" });
    } catch (err) {
      setToast({
        message: err instanceof ApiRequestError ? err.message : "Не удалось добавить запись",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(file: File, kind: CivilCaseDocumentKind) {
    const fileError = validateDocumentFile(file);
    if (fileError) {
      setToast({ message: fileError, tone: "error" });
      return;
    }
    setUploading(true);
    try {
      const updated = await civilCasesApi.uploadDocument(params.id, file, kind);
      setItem(updated);
      setToast({
        message: kind === "client" ? "Документ клиента загружен" : "Подготовленный документ загружен",
        tone: "success",
      });
    } catch (err) {
      setToast({
        message: err instanceof ApiRequestError ? err.message : "Не удалось загрузить документ",
        tone: "error",
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleDownloadDocument(doc: CivilCaseDocument) {
    setDownloadingId(doc.id);
    try {
      await civilCasesApi.downloadDocument(params.id, doc.id, doc.filename);
    } catch (err) {
      setToast({
        message: err instanceof ApiRequestError ? err.message : "Не удалось скачать документ",
        tone: "error",
      });
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDeleteDocument(documentId: string) {
    setUploading(true);
    try {
      const updated = await civilCasesApi.deleteDocument(params.id, documentId);
      setItem(updated);
    } catch (err) {
      setToast({
        message: err instanceof ApiRequestError ? err.message : "Не удалось удалить документ",
        tone: "error",
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteCase() {
    if (!window.confirm("Удалить это гражданское дело?")) return;
    setDeleting(true);
    try {
      await civilCasesApi.remove(params.id);
      router.replace("/civil-cases");
    } catch (err) {
      setToast({
        message: err instanceof ApiRequestError ? err.message : "Не удалось удалить дело",
        tone: "error",
      });
      setDeleting(false);
    }
  }

  if (!canView || loading) {
    return <LoadingState text="Загрузка дела..." />;
  }

  if (!item) {
    return (
      <div className="page-stack">
        <PageHeader title="Дело не найдено" back={<BackLink href="/civil-cases">К списку дел</BackLink>} />
      </div>
    );
  }

  const executorGroups = civilExecutorGroups(executors);
  const canUploadPreparedDocs = canUploadCivilPreparedDocuments(user, item.assigned_executor_id);

  return (
    <div className="page-stack">
      {toast ? (
        <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />
      ) : null}
      <PageHeader
        title={item.full_name}
        subtitle={`Обращение ${formatDate(item.appeal_date)}`}
        back={<BackLink href="/civil-cases">К списку дел</BackLink>}
        action={<Badge tone={stageTone(item.stage)}>{civilCaseStageLabel(item.stage)}</Badge>}
      />

      {canManageIntake ? (
        <Card>
          <SectionTitle title="Клиент" description="ФИО, телефон, цена, кто заключил и кто ведёт дело" />
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="ФИО клиента" error={formErrors.full_name}>
              <Input
                value={intake.full_name}
                onChange={(event) =>
                  setIntake({ ...intake, full_name: filterPersonName(event.target.value) })
                }
              />
            </FormField>
            <FormField label="Телефон" error={formErrors.phone}>
              <PhoneInput
                value={intake.phone}
                onValueChange={(phone) => setIntake({ ...intake, phone })}
              />
            </FormField>
            <FormField label="Цена" error={formErrors.price}>
              <Input
                inputMode="decimal"
                value={intake.price}
                onChange={(event) =>
                  setIntake({ ...intake, price: filterDecimalInput(event.target.value) })
                }
              />
            </FormField>
            <FormField label="Дата обращения" error={formErrors.appeal_date}>
              <Input
                type="date"
                value={intake.appeal_date}
                onChange={(event) => setIntake({ ...intake, appeal_date: event.target.value })}
              />
            </FormField>
            <div className="md:col-span-2">
              <FormField label="Предмет обращения" error={formErrors.subject}>
                <textarea
                  value={intake.subject}
                  onChange={(event) => setIntake({ ...intake, subject: event.target.value })}
                  className="interactive min-h-[72px] w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-soft outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
                />
              </FormField>
            </div>
            <FormField label="Кто заключил" error={formErrors.concluding_manager_id}>
              <Select
                value={intake.concluding_manager_id}
                onChange={(event) =>
                  setIntake({ ...intake, concluding_manager_id: event.target.value })
                }
              >
                {managers.length === 0 ? <option value="">Выберите менеджера</option> : null}
                {managers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.full_name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Исполнитель">
              <Select
                value={intake.assigned_executor_id}
                onChange={(event) =>
                  setIntake({ ...intake, assigned_executor_id: event.target.value })
                }
              >
                <option value="">Не назначен</option>
                {executorGroups.dedicated.length > 0 ? (
                  <optgroup label="Исполнители">
                    {executorGroups.dedicated.map((executor) => (
                      <option key={executor.id} value={executor.id}>
                        {executor.full_name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {executorGroups.self.length > 0 ? (
                  <optgroup label="Сделал сам">
                    {executorGroups.self.map((executor) => (
                      <option key={executor.id} value={executor.id}>
                        {executor.full_name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </Select>
              <p className="mt-1 text-[11px] text-muted">
                Если вели дело сами — выберите себя в группе «Сделал сам».
              </p>
            </FormField>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button type="button" disabled={saving} onClick={() => void saveIntake()}>
                {saving ? "Сохранение..." : "Сохранить"}
              </Button>
              <Button type="button" variant="danger" disabled={deleting} onClick={() => void handleDeleteCase()}>
                {deleting ? "Удаление..." : "Удалить дело"}
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <SectionTitle title="Клиент" />
          <dl className="grid gap-2 text-xs md:grid-cols-2">
            <div>
              <dt className="text-muted">ФИО</dt>
              <dd className="font-medium">{item.full_name}</dd>
            </div>
            <div>
              <dt className="text-muted">Дата обращения</dt>
              <dd>{formatDate(item.appeal_date)}</dd>
            </div>
            <div>
              <dt className="text-muted">Телефон</dt>
              <dd>{item.phone || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Цена</dt>
              <dd>{formatMoney(item.price)}</dd>
            </div>
            <div>
              <dt className="text-muted">Кто заключил</dt>
              <dd>{item.concluding_manager_name || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Исполнитель</dt>
              <dd>{item.assigned_executor_name || "не назначен"}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-muted">Предмет обращения</dt>
              <dd className="whitespace-pre-wrap">{item.subject}</dd>
            </div>
          </dl>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <CivilDocumentSlot
          title="Документы клиента"
          description="Менеджер загружает исходники: паспорт, доверенность, материалы обращения"
          emptyText="Документы клиента ещё не загружены"
          documents={item.documents.filter((doc) => doc.kind !== "prepared")}
          canUpload={canUploadClientDocs}
          canDelete={canManageIntake}
          uploading={uploading}
          downloadingId={downloadingId}
          onUpload={(file) => void handleUpload(file, "client")}
          onDownload={(doc) => void handleDownloadDocument(doc)}
          onDelete={(documentId) => void handleDeleteDocument(documentId)}
        />
        <CivilDocumentSlot
          title="Подготовленные документы"
          description="Исполнитель загружает то, что подготовил: иск, жалобу, приложения"
          emptyText="Подготовленный пакет ещё не загружен"
          documents={item.documents.filter((doc) => doc.kind === "prepared")}
          canUpload={canUploadPreparedDocs}
          canDelete={canManageIntake || canUploadPreparedDocs}
          uploading={uploading}
          downloadingId={downloadingId}
          onUpload={(file) => void handleUpload(file, "prepared")}
          onDownload={(doc) => void handleDownloadDocument(doc)}
          onDelete={(documentId) => void handleDeleteDocument(documentId)}
        />
      </div>

      <Card>
        <SectionTitle title="Этапы" description="Исполнитель отмечает подготовку, подачу и исполнение" />
        <div className="space-y-3">
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={work.documents_prepared}
              onChange={(event) =>
                setWork({ ...work, documents_prepared: event.target.checked })
              }
            />
            <span>
              <span className="font-medium">Подготовка документов</span>
              <span className="mt-1 block text-muted">
                Загрузите пакет в «Подготовленные документы» и отметьте, когда готов
              </span>
            </span>
          </label>
          {work.documents_prepared ? (
            <div className="grid gap-2 pl-6 md:grid-cols-2">
              <FormField label="Дата">
                <Input
                  type="date"
                  value={work.documents_prepared_at}
                  onChange={(event) =>
                    setWork({ ...work, documents_prepared_at: event.target.value })
                  }
                />
              </FormField>
              <FormField label="Комментарий">
                <Input
                  value={work.documents_note}
                  onChange={(event) => setWork({ ...work, documents_note: event.target.value })}
                  placeholder="Что подготовлено"
                />
              </FormField>
            </div>
          ) : null}

          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={work.submitted}
              onChange={(event) => setWork({ ...work, submitted: event.target.checked })}
            />
            <span>
              <span className="font-medium">Подано в орган власти</span>
              <span className="mt-1 block text-muted">Суд, администрация, прокуратура и т.д.</span>
            </span>
          </label>
          {work.submitted ? (
            <div className="grid gap-2 pl-6 md:grid-cols-2">
              <FormField label="Дата подачи">
                <Input
                  type="date"
                  value={work.submitted_at}
                  onChange={(event) => setWork({ ...work, submitted_at: event.target.value })}
                />
              </FormField>
              <FormField label="Орган">
                <Input
                  value={work.authority_name}
                  onChange={(event) => setWork({ ...work, authority_name: event.target.value })}
                  placeholder="Куда подано"
                />
              </FormField>
            </div>
          ) : null}

          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={work.executed}
              onChange={(event) => setWork({ ...work, executed: event.target.checked })}
            />
            <span>
              <span className="font-medium">Отметка об исполнении</span>
              <span className="mt-1 block text-muted">Дело закрыто, результат получен</span>
            </span>
          </label>
          {work.executed ? (
            <div className="grid gap-2 pl-6 md:grid-cols-2">
              <FormField label="Дата исполнения">
                <Input
                  type="date"
                  value={work.executed_at}
                  onChange={(event) => setWork({ ...work, executed_at: event.target.value })}
                />
              </FormField>
              <FormField label="Отметка">
                <Input
                  value={work.execution_note}
                  onChange={(event) => setWork({ ...work, execution_note: event.target.value })}
                  placeholder="Результат"
                />
              </FormField>
            </div>
          ) : null}

          <Button type="button" disabled={saving} onClick={() => void saveWork()}>
            {saving ? "Сохранение..." : "Сохранить этапы"}
          </Button>
        </div>
      </Card>

      <Card>
        <SectionTitle title="Движение по делу" />
        <form onSubmit={(event) => void handleMovement(event)} className="space-y-2">
          <textarea
            value={movement}
            onChange={(event) => setMovement(event.target.value)}
            className="interactive min-h-[64px] w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-soft outline-none placeholder:text-muted focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
            placeholder="Что произошло: запрос, ответ органа, заседание..."
          />
          <Button type="submit" disabled={saving || !movement.trim()}>
            Добавить запись
          </Button>
        </form>
        {item.movements.length === 0 ? (
          <p className="mt-3 text-xs text-muted">Записей пока нет</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {item.movements.map((entry) => (
              <li key={entry.id} className="rounded-md border border-border bg-surface-muted px-2 py-1.5 text-xs">
                <p className="whitespace-pre-wrap">{entry.body}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {entry.created_by_name || "сотрудник"} · {formatDateTime(entry.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
