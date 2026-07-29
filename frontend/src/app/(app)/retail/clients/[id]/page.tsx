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
  FormField,
  Input,
  LoadingState,
  PageHeader,
  SectionTitle,
  Select,
} from "@/components/ui";
import { PdfDocumentField } from "@/components/PdfDocumentField";
import { ApiRequestError, retailApi } from "@/lib/api-client";
import { formatDate, formatMoney, formatShortName } from "@/lib/format";
import {
  collectErrors,
  filterDecimalInput,
  hasErrors,
  validatePositiveAmount,
  validateRequiredDate,
} from "@/lib/validation";
import type { RetailClient, RetailContractBrief, RetailTermRate, User } from "@/lib/types";
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
  const [investors, setInvestors] = useState<User[]>([]);
  const [rates, setRates] = useState<RetailTermRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState<"client" | "guarantor" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showContractForm, setShowContractForm] = useState(false);
  const [creatingContract, setCreatingContract] = useState(false);
  const [contractFormErrors, setContractFormErrors] = useState<Record<string, string>>({});
  const [contractForm, setContractForm] = useState({
    investor_id: "",
    product_name: "",
    product_price: "",
    term_months: "6",
    down_payment: "",
    contract_date: new Date().toISOString().slice(0, 10),
  });

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

  useEffect(() => {
    if (!isOwner) return;
    void (async () => {
      try {
        const [investorsData, ratesData] = await Promise.all([
          retailApi.listInvestors(),
          retailApi.termRates(),
        ]);
        setInvestors(investorsData);
        setRates(ratesData);
        if (ratesData.length > 0) {
          setContractForm((current) => ({
            ...current,
            term_months: String(ratesData[0].term_months),
          }));
        }
      } catch {
        setInvestors([]);
        setRates([]);
      }
    })();
  }, [isOwner]);

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

  async function handleCreateContract(event: React.FormEvent) {
    event.preventDefault();
    if (!client) return;
    setError(null);
    const errors = collectErrors({
      investor_id: contractForm.investor_id ? null : "Выберите инвестора",
      product_name: contractForm.product_name.trim() ? null : "Укажите название товара",
      product_price: validatePositiveAmount(contractForm.product_price, { label: "Цена товара" }),
      down_payment: validatePositiveAmount(contractForm.down_payment, {
        allowZero: true,
        label: "Первоначальный взнос",
      }),
      contract_date: validateRequiredDate(contractForm.contract_date),
    });
    if (hasErrors(errors)) {
      setContractFormErrors(errors);
      return;
    }
    setContractFormErrors({});
    setCreatingContract(true);
    try {
      const created = await retailApi.createContract({
        retail_client_id: client.id,
        investor_id: contractForm.investor_id,
        product_name: contractForm.product_name.trim(),
        product_price: contractForm.product_price,
        term_months: contractForm.term_months,
        down_payment: contractForm.down_payment,
        contract_date: contractForm.contract_date,
      });
      router.push(`/retail/contracts/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось создать договор");
    } finally {
      setCreatingContract(false);
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
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => setShowContractForm((value) => !value)}>
                {showContractForm ? "Скрыть договор" : "Новый договор"}
              </Button>
              <Button variant="danger" disabled={deleting} onClick={handleDeleteClient}>
                {deleting ? "Удаление..." : "Удалить клиента"}
              </Button>
            </div>
          ) : undefined
        }
      />

      {error ? <p className="alert-danger">{error}</p> : null}

      {isOwner && showContractForm && (
        <Card>
          <SectionTitle
            title="Создать договор"
            description={`Клиент: ${client.full_name}. Назначьте инвестора — взнос пойдёт в его кассу.`}
          />
          <form onSubmit={handleCreateContract} className="grid gap-2 md:grid-cols-2">
            <FormField label="Инвестор" error={contractFormErrors.investor_id}>
              <Select
                value={contractForm.investor_id}
                onChange={(event) =>
                  setContractForm({ ...contractForm, investor_id: event.target.value })
                }
                required
              >
                <option value="">Выберите инвестора</option>
                {investors.map((investor) => (
                  <option key={investor.id} value={investor.id}>
                    {investor.full_name} (вклад {formatMoney(investor.investment_amount ?? "0")})
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Название товара" error={contractFormErrors.product_name}>
              <Input
                placeholder="Название товара"
                value={contractForm.product_name}
                onChange={(event) =>
                  setContractForm({ ...contractForm, product_name: event.target.value })
                }
                required
              />
            </FormField>
            <FormField label="Цена товара" error={contractFormErrors.product_price}>
              <Input
                inputMode="decimal"
                placeholder="50000"
                value={contractForm.product_price}
                onChange={(event) =>
                  setContractForm({
                    ...contractForm,
                    product_price: filterDecimalInput(event.target.value),
                  })
                }
                required
              />
            </FormField>
            <FormField label="Срок">
              <Select
                value={contractForm.term_months}
                onChange={(event) =>
                  setContractForm({ ...contractForm, term_months: event.target.value })
                }
              >
                {rates.map((rate) => (
                  <option key={rate.id} value={rate.term_months}>
                    {rate.term_months} мес. ({rate.markup_percent}%)
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Первоначальный взнос" error={contractFormErrors.down_payment}>
              <Input
                inputMode="decimal"
                placeholder="0"
                value={contractForm.down_payment}
                onChange={(event) =>
                  setContractForm({
                    ...contractForm,
                    down_payment: filterDecimalInput(event.target.value),
                  })
                }
                required
              />
            </FormField>
            <FormField label="Дата договора" error={contractFormErrors.contract_date}>
              <Input
                type="date"
                value={contractForm.contract_date}
                onChange={(event) =>
                  setContractForm({ ...contractForm, contract_date: event.target.value })
                }
                required
              />
            </FormField>
            <Button type="submit" className="md:col-span-2" disabled={creatingContract}>
              {creatingContract ? "Создание..." : "Создать и открыть договор"}
            </Button>
          </form>
        </Card>
      )}

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
        <SectionTitle
          title="Договоры"
          description="Все договоры по этому клиенту"
          action={
            isOwner ? (
              <Button type="button" variant="secondary" onClick={() => setShowContractForm(true)}>
                Новый договор
              </Button>
            ) : undefined
          }
        />
        {contracts.length === 0 ? (
          <EmptyState>
            {isOwner ? (
              <div className="space-y-2">
                <p>Договоров пока нет</p>
                <Button type="button" onClick={() => setShowContractForm(true)}>
                  Создать договор
                </Button>
              </div>
            ) : (
              "Договоров пока нет"
            )}
          </EmptyState>
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
