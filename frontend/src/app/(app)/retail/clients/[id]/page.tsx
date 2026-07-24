"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import {
  BackLink,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageHeader,
  SectionTitle,
} from "@/components/ui";
import { PdfDocumentField } from "@/components/PdfDocumentField";
import { ApiRequestError, retailApi } from "@/lib/api-client";
import { formatDate, formatMoney, formatShortName } from "@/lib/format";
import type { RetailClient, RetailContractBrief } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

function contractStatusTone(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "completed") return "success";
  if (status === "overdue") return "danger";
  if (status === "active") return "warning";
  return "default";
}

function contractStatusText(status: string): string {
  if (status === "completed") return "Завершён";
  if (status === "overdue") return "Просрочен";
  if (status === "active") return "Активен";
  if (status === "cancelled") return "Отменён";
  return status;
}

export default function RetailClientDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [client, setClient] = useState<RetailClient | null>(null);
  const [contracts, setContracts] = useState<RetailContractBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState<"client" | "guarantor" | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const clientData = await retailApi.getClient(params.id);
      setClient(clientData);
      try {
        setContracts(await retailApi.listContracts(undefined, params.id));
      } catch {
        setContracts([]);
      }
    } catch (err) {
      setClient(null);
      setContracts([]);
      setError(err instanceof ApiRequestError ? err.message : "Клиент не найден");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUploadClientPassport(file: File) {
    if (!client) return;
    setUploadingDoc("client");
    setError(null);
    try {
      setClient(await retailApi.uploadClientPassportPdf(client.id, file));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось загрузить PDF");
    } finally {
      setUploadingDoc(null);
    }
  }

  async function handleUploadGuarantorPassport(file: File) {
    if (!client) return;
    setUploadingDoc("guarantor");
    setError(null);
    try {
      setClient(await retailApi.uploadGuarantorPassportPdf(client.id, file));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось загрузить PDF поручителя");
    } finally {
      setUploadingDoc(null);
    }
  }

  async function handleDeleteClient() {
    if (!client) return;
    if (
      !window.confirm(
        `Удалить клиента «${client.full_name}» и все договоры без возможности восстановления?`,
      )
    ) {
      return;
    }
    if (!window.confirm("Подтвердите окончательное удаление.")) return;

    setDeleting(true);
    setError(null);
    try {
      await retailApi.deleteClient(client.id);
      router.push("/retail/clients");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось удалить клиента");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <LoadingState text="Загрузка карточки клиента..." />;
  if (!client) return <EmptyState>{error || "Клиент не найден"}</EmptyState>;

  return (
    <div className="page-stack">
      <PageHeader
        title={client.full_name}
        subtitle={`${client.phone} · ${client.contracts_count} договор(ов)`}
        back={<BackLink href="/retail/clients">К клиентам</BackLink>}
        action={
          isOwner ? (
            <Button variant="danger" disabled={deleting} onClick={handleDeleteClient}>
              {deleting ? "Удаление..." : "Удалить клиента"}
            </Button>
          ) : undefined
        }
      />

      {error ? <p className="alert-danger">{error}</p> : null}

      <div className="grid gap-2 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Клиент" />
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-muted">Телефон</dt>
              <dd className="font-medium">{client.phone}</dd>
            </div>
            <div>
              <dt className="text-muted">Паспорт</dt>
              <dd className="font-medium">{client.passport}</dd>
            </div>
            <div>
              <dt className="text-muted">Адрес</dt>
              <dd>{client.address}</dd>
            </div>
          </dl>
          <div className="mt-3">
            <PdfDocumentField
              label="Скан паспорта клиента (PDF)"
              hasFile={client.has_passport_pdf}
              filename={client.passport_pdf_filename}
              uploading={uploadingDoc === "client"}
              canUpload={isOwner}
              canDelete={isOwner}
              onUpload={handleUploadClientPassport}
              onDownload={() =>
                retailApi.downloadClientPassportPdf(
                  client.id,
                  client.passport_pdf_filename || `passport-${client.full_name}.pdf`,
                )
              }
              onDelete={async () => {
                if (!window.confirm("Удалить PDF паспорта клиента?")) return;
                setUploadingDoc("client");
                try {
                  setClient(await retailApi.deleteClientPassportPdf(client.id));
                } catch (err) {
                  setError(
                    err instanceof ApiRequestError ? err.message : "Не удалось удалить PDF",
                  );
                } finally {
                  setUploadingDoc(null);
                }
              }}
            />
          </div>
        </Card>

        <Card>
          <SectionTitle title="Поручитель" />
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-muted">ФИО</dt>
              <dd className="font-medium">{client.guarantor_full_name}</dd>
            </div>
            <div>
              <dt className="text-muted">Телефон</dt>
              <dd className="font-medium">{client.guarantor_phone}</dd>
            </div>
            <div>
              <dt className="text-muted">Паспорт</dt>
              <dd className="font-medium">{client.guarantor_passport}</dd>
            </div>
          </dl>
          <div className="mt-3">
            <PdfDocumentField
              label="Скан паспорта поручителя (PDF)"
              hasFile={client.has_guarantor_passport_pdf}
              filename={client.guarantor_passport_pdf_filename}
              uploading={uploadingDoc === "guarantor"}
              canUpload={isOwner}
              canDelete={isOwner}
              onUpload={handleUploadGuarantorPassport}
              onDownload={() =>
                retailApi.downloadGuarantorPassportPdf(
                  client.id,
                  client.guarantor_passport_pdf_filename ||
                    `guarantor-passport-${client.guarantor_full_name}.pdf`,
                )
              }
              onDelete={async () => {
                if (!window.confirm("Удалить PDF паспорта поручителя?")) return;
                setUploadingDoc("guarantor");
                try {
                  setClient(await retailApi.deleteGuarantorPassportPdf(client.id));
                } catch (err) {
                  setError(
                    err instanceof ApiRequestError ? err.message : "Не удалось удалить PDF",
                  );
                } finally {
                  setUploadingDoc(null);
                }
              }}
            />
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle title="Договоры" description="Все договоры по этому клиенту" />
        {contracts.length === 0 ? (
          <EmptyState>Договоров пока нет</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Товар</th>
                  <th>Инвестор</th>
                  <th>Дата</th>
                  <th>Итого</th>
                  <th>Остаток</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((contract) => (
                  <tr key={contract.id}>
                    <td>
                      <Link href={`/retail/contracts/${contract.id}`} className="link-brand font-medium">
                        {contract.product_name}
                      </Link>
                    </td>
                    <td>{formatShortName(contract.investor_name)}</td>
                    <td>{formatDate(contract.contract_date)}</td>
                    <td>{formatMoney(contract.total_amount)}</td>
                    <td>{formatMoney(contract.remainder_total)}</td>
                    <td>
                      <Badge tone={contractStatusTone(contract.status)}>
                        {contractStatusText(contract.status)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
