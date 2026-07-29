"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  LoadingState,
  PageHeader,
  PassportInput,
  PhoneInput,
  SectionTitle,
  Select,
} from "@/components/ui";
import { PdfDocumentField } from "@/components/PdfDocumentField";
import { ApiRequestError, retailApi } from "@/lib/api-client";
import { formatMoney, formatShortName } from "@/lib/format";
import { PHONE_PREFIX } from "@/lib/phone";
import {
  collectErrors,
  filterDecimalInput,
  filterPersonName,
  formatPassport,
  hasErrors,
  validateAddress,
  validateFullName,
  validatePassport,
  validatePdfFile,
  validatePhone,
  validatePositiveAmount,
  validateRequiredDate,
} from "@/lib/validation";
import type { RetailClient, RetailTermRate, User } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

export default function RetailClientsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [clients, setClients] = useState<RetailClient[]>([]);
  const [investors, setInvestors] = useState<User[]>([]);
  const [rates, setRates] = useState<RetailTermRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showClientForm, setShowClientForm] = useState(false);
  const [showContractForm, setShowContractForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientFormErrors, setClientFormErrors] = useState<Record<string, string>>({});
  const [contractFormErrors, setContractFormErrors] = useState<Record<string, string>>({});
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);
  const [creatingClient, setCreatingClient] = useState(false);
  const [clientPassportFile, setClientPassportFile] = useState<File | null>(null);
  const [guarantorPassportFile, setGuarantorPassportFile] = useState<File | null>(null);
  const [clientPassportFileError, setClientPassportFileError] = useState<string | null>(null);
  const [guarantorPassportFileError, setGuarantorPassportFileError] = useState<string | null>(null);
  const [clientForm, setClientForm] = useState({
    full_name: "",
    phone: PHONE_PREFIX,
    passport: "",
    address: "",
    guarantor_full_name: "",
    guarantor_phone: PHONE_PREFIX,
    guarantor_passport: "",
  });
  const [contractForm, setContractForm] = useState({
    retail_client_id: "",
    investor_id: "",
    product_name: "",
    product_price: "",
    term_months: "6",
    down_payment: "",
    contract_date: new Date().toISOString().slice(0, 10),
  });

  useEffect(() => {
    void (async () => {
      try {
        if (isOwner) {
          const [clientsData, investorsData, ratesData] = await Promise.all([
            retailApi.listClients(),
            retailApi.listInvestors(),
            retailApi.termRates(),
          ]);
          setClients(clientsData);
          setInvestors(investorsData);
          setRates(ratesData);
        } else {
          setClients(await retailApi.listClients());
        }
      } catch {
        setClients([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [isOwner]);

  async function handleCreateClient(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const errors = collectErrors({
      full_name: validateFullName(clientForm.full_name),
      phone: validatePhone(clientForm.phone),
      passport: validatePassport(clientForm.passport),
      address: validateAddress(clientForm.address),
      guarantor_full_name: validateFullName(clientForm.guarantor_full_name),
      guarantor_phone: validatePhone(clientForm.guarantor_phone),
      guarantor_passport: validatePassport(clientForm.guarantor_passport),
    });
    if (hasErrors(errors)) {
      setClientFormErrors(errors);
      return;
    }
    setClientFormErrors({});
    setCreatingClient(true);
    let createdId: string | null = null;
    try {
      const created = await retailApi.createClient({
        full_name: clientForm.full_name.trim().replace(/\s+/g, " "),
        guarantor_full_name: clientForm.guarantor_full_name.trim().replace(/\s+/g, " "),
        phone: clientForm.phone.trim(),
        guarantor_phone: clientForm.guarantor_phone.trim(),
        passport: formatPassport(clientForm.passport),
        guarantor_passport: formatPassport(clientForm.guarantor_passport),
        address: clientForm.address.trim(),
      });
      createdId = created.id;

      if (clientPassportFile) {
        await retailApi.uploadClientPassportPdf(created.id, clientPassportFile);
      }
      if (guarantorPassportFile) {
        await retailApi.uploadGuarantorPassportPdf(created.id, guarantorPassportFile);
      }

      setShowClientForm(false);
      setClientPassportFile(null);
      setGuarantorPassportFile(null);
      setClientPassportFileError(null);
      setGuarantorPassportFileError(null);
      router.push(`/retail/clients/${created.id}`);
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.message : "Не удалось создать клиента";
      setError(
        createdId
          ? `${message}. Клиент создан — откройте карточку и загрузите PDF вручную.`
          : message,
      );
      if (createdId) {
        router.push(`/retail/clients/${createdId}`);
      }
    } finally {
      setCreatingClient(false);
    }
  }

  async function handleCreateContract(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const errors = collectErrors({
      retail_client_id: contractForm.retail_client_id ? null : "Выберите клиента",
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
    try {
      const created = await retailApi.createContract(contractForm);
      router.push(`/retail/contracts/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось создать договор");
    }
  }

  async function handleDeleteClient(clientId: string, clientName: string) {
    if (
      !window.confirm(
        `Удалить клиента «${clientName}» и все договоры без возможности восстановления?`,
      )
    ) {
      return;
    }
    if (!window.confirm("Подтвердите окончательное удаление.")) {
      return;
    }

    setDeletingClientId(clientId);
    setError(null);
    try {
      await retailApi.deleteClient(clientId);
      setClients((current) => current.filter((item) => item.id !== clientId));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось удалить клиента");
    } finally {
      setDeletingClientId(null);
    }
  }

  if (loading) return <LoadingState text="Загрузка клиентов..." />;

  return (
    <div className="page-stack">
      <PageHeader
        title={isOwner ? "Клиенты" : "Мои клиенты"}
        subtitle={
          isOwner
            ? "Откройте карточку клиента для документов и договоров"
            : "Клиенты по вашим договорам. Создание — только у администратора"
        }
        action={
          isOwner ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowClientForm((v) => !v)}>
                {showClientForm ? "Скрыть форму" : "Новый клиент"}
              </Button>
              <Button onClick={() => setShowContractForm((v) => !v)}>
                {showContractForm ? "Скрыть договор" : "Новый договор"}
              </Button>
            </div>
          ) : undefined
        }
      />

      {!isOwner && (
        <Card variant="accent">
          <p className="text-sm text-muted">
            Как инвестор вы видите только клиентов по своим договорам. Новых клиентов и договоров
            создаёт администратор и назначает их вам.
          </p>
        </Card>
      )}

      {isOwner && showClientForm && (
        <Card>
          <SectionTitle title="Создать клиента" />
          <form onSubmit={handleCreateClient} className="grid gap-2 md:grid-cols-2">
            <FormField label="ФИО" error={clientFormErrors.full_name}>
              <Input
                placeholder="Иванов Иван"
                value={clientForm.full_name}
                onChange={(e) => setClientForm({ ...clientForm, full_name: filterPersonName(e.target.value) })}
                required
              />
            </FormField>
            <FormField label="Телефон" error={clientFormErrors.phone}>
              <PhoneInput
                value={clientForm.phone}
                onValueChange={(phone) => setClientForm({ ...clientForm, phone })}
                required
              />
            </FormField>
            <FormField label="Паспорт" error={clientFormErrors.passport}>
              <PassportInput
                value={clientForm.passport}
                onValueChange={(passport) => setClientForm({ ...clientForm, passport })}
                required
              />
            </FormField>
            <FormField label="Адрес" error={clientFormErrors.address}>
              <Input
                placeholder="г. Москва, ул. Ленина, 10"
                value={clientForm.address}
                onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
                required
              />
            </FormField>
            <FormField label="Поручитель ФИО" error={clientFormErrors.guarantor_full_name}>
              <Input
                placeholder="Петров Пётр"
                value={clientForm.guarantor_full_name}
                onChange={(e) =>
                  setClientForm({ ...clientForm, guarantor_full_name: filterPersonName(e.target.value) })
                }
                required
              />
            </FormField>
            <FormField label="Поручитель телефон" error={clientFormErrors.guarantor_phone}>
              <PhoneInput
                value={clientForm.guarantor_phone}
                onValueChange={(guarantor_phone) => setClientForm({ ...clientForm, guarantor_phone })}
                required
              />
            </FormField>
            <div className="md:col-span-2">
              <FormField label="Поручитель паспорт" error={clientFormErrors.guarantor_passport}>
                <PassportInput
                  value={clientForm.guarantor_passport}
                  onValueChange={(guarantor_passport) =>
                    setClientForm({ ...clientForm, guarantor_passport })
                  }
                  required
                />
              </FormField>
            </div>
            <div>
              <PdfDocumentField
                label="Скан паспорта клиента"
                hasFile={Boolean(clientPassportFile)}
                filename={clientPassportFile?.name}
                uploading={creatingClient}
                canUpload={!creatingClient}
                canDelete={Boolean(clientPassportFile) && !creatingClient}
                showDownload={false}
                uploadLabel="Добавить скан"
                replaceLabel="Заменить скан"
                emptyLabel="Скан не выбран"
                onUpload={(file) => {
                  const pdfError = validatePdfFile(file);
                  if (pdfError) {
                    setClientPassportFileError(pdfError);
                    return;
                  }
                  setClientPassportFile(file);
                  setClientPassportFileError(null);
                }}
                onDelete={() => {
                  setClientPassportFile(null);
                  setClientPassportFileError(null);
                }}
              />
              {clientPassportFileError ? (
                <p className="mt-1 text-xs text-status-danger-text">{clientPassportFileError}</p>
              ) : null}
            </div>
            <div>
              <PdfDocumentField
                label="Скан паспорта поручителя"
                hasFile={Boolean(guarantorPassportFile)}
                filename={guarantorPassportFile?.name}
                uploading={creatingClient}
                canUpload={!creatingClient}
                canDelete={Boolean(guarantorPassportFile) && !creatingClient}
                showDownload={false}
                uploadLabel="Добавить скан"
                replaceLabel="Заменить скан"
                emptyLabel="Скан не выбран"
                onUpload={(file) => {
                  const pdfError = validatePdfFile(file);
                  if (pdfError) {
                    setGuarantorPassportFileError(pdfError);
                    return;
                  }
                  setGuarantorPassportFile(file);
                  setGuarantorPassportFileError(null);
                }}
                onDelete={() => {
                  setGuarantorPassportFile(null);
                  setGuarantorPassportFileError(null);
                }}
              />
              {guarantorPassportFileError ? (
                <p className="mt-1 text-xs text-status-danger-text">{guarantorPassportFileError}</p>
              ) : null}
            </div>
            <Button type="submit" className="md:col-span-2" disabled={creatingClient}>
              {creatingClient ? "Сохранение..." : "Создать клиента"}
            </Button>
          </form>
        </Card>
      )}

      {isOwner && showContractForm && (
        <Card>
          <SectionTitle title="Создать договор" description="Назначьте инвестора — взнос пойдёт в его кассу" />
          <form onSubmit={handleCreateContract} className="grid gap-2 md:grid-cols-2">
            <FormField label="Клиент" error={contractFormErrors.retail_client_id}>
              <Select
                value={contractForm.retail_client_id}
                onChange={(e) => setContractForm({ ...contractForm, retail_client_id: e.target.value })}
                required
              >
                <option value="">Выберите клиента</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.full_name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Инвестор" error={contractFormErrors.investor_id}>
              <Select
                value={contractForm.investor_id}
                onChange={(e) => setContractForm({ ...contractForm, investor_id: e.target.value })}
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
                onChange={(e) => setContractForm({ ...contractForm, product_name: e.target.value })}
                required
              />
            </FormField>
            <FormField label="Цена товара" error={contractFormErrors.product_price}>
              <Input
                inputMode="decimal"
                placeholder="50000"
                value={contractForm.product_price}
                onChange={(e) =>
                  setContractForm({ ...contractForm, product_price: filterDecimalInput(e.target.value) })
                }
                required
              />
            </FormField>
            <FormField label="Срок">
              <Select
                value={contractForm.term_months}
                onChange={(e) => setContractForm({ ...contractForm, term_months: e.target.value })}
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
                onChange={(e) =>
                  setContractForm({ ...contractForm, down_payment: filterDecimalInput(e.target.value) })
                }
                required
              />
            </FormField>
            <FormField label="Дата договора" error={contractFormErrors.contract_date}>
              <Input
                type="date"
                value={contractForm.contract_date}
                onChange={(e) => setContractForm({ ...contractForm, contract_date: e.target.value })}
                required
              />
            </FormField>
            <Button type="submit" className="md:col-span-2">
              Создать договор
            </Button>
          </form>
        </Card>
      )}

      {error && <p className="text-sm text-status-danger-text">{error}</p>}

      <Card>
        {clients.length === 0 ? (
          <EmptyState>
            {isOwner
              ? "Клиентов пока нет. Создайте первого клиента и договор."
              : "Пока нет клиентов по вашим договорам. Администратор создаст договор и назначит его вам."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table table-cards">
              <thead>
                <tr>
                  <th>ФИО</th>
                  <th>Телефон</th>
                  <th>Паспорт</th>
                  <th>Поручитель</th>
                  <th>Документы</th>
                  <th>Договоров</th>
                  {isOwner && <th>Действие</th>}
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td data-label="ФИО">
                      <Link href={`/retail/clients/${client.id}`} className="link-brand font-medium">
                        {formatShortName(client.full_name)}
                      </Link>
                    </td>
                    <td data-label="Телефон">{client.phone}</td>
                    <td data-label="Паспорт" className="whitespace-nowrap">{client.passport}</td>
                    <td data-label="Поручитель">{formatShortName(client.guarantor_full_name)}</td>
                    <td data-label="Документы" className="text-xs text-muted">
                      {client.has_passport_pdf ? "Клиент ✓" : "Клиент —"}
                      {" · "}
                      {client.has_guarantor_passport_pdf ? "Поруч. ✓" : "Поруч. —"}
                    </td>
                    <td data-label="Договоров">{client.contracts_count}</td>
                    {isOwner && (
                      <td data-label="Действие">
                        <Button
                          type="button"
                          variant="danger"
                          disabled={deletingClientId === client.id}
                          onClick={() => handleDeleteClient(client.id, client.full_name)}
                        >
                          {deletingClientId === client.id ? "..." : "Удалить"}
                        </Button>
                      </td>
                    )}
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
