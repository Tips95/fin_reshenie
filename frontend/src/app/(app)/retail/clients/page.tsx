"use client";

import { useEffect, useState } from "react";

import { Button, Card, EmptyState, FormField, Input, LoadingState, PageHeader, SectionTitle } from "@/components/ui";
import { ApiRequestError, retailApi } from "@/lib/api-client";
import { formatShortName } from "@/lib/format";
import type { RetailClient, RetailTermRate, User } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

export default function RetailClientsPage() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [clients, setClients] = useState<RetailClient[]>([]);
  const [investors, setInvestors] = useState<User[]>([]);
  const [rates, setRates] = useState<RetailTermRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showClientForm, setShowClientForm] = useState(false);
  const [showContractForm, setShowContractForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientForm, setClientForm] = useState({
    full_name: "",
    phone: "",
    passport: "",
    address: "",
    guarantor_full_name: "",
    guarantor_phone: "",
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
    try {
      const created = await retailApi.createClient(clientForm);
      setClients((current) => [...current, created]);
      setContractForm({ ...contractForm, retail_client_id: created.id });
      setShowClientForm(false);
      setShowContractForm(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось создать клиента");
    }
  }

  async function handleCreateContract(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const created = await retailApi.createContract(contractForm);
      window.location.href = `/retail/contracts/${created.id}`;
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось создать договор");
    }
  }

  if (loading) return <LoadingState text="Загрузка клиентов..." />;

  return (
    <div className="space-y-8">
      <PageHeader
        title={isOwner ? "Клиенты" : "Мои клиенты"}
        subtitle={
          isOwner
            ? "Паспорт, адрес и поручитель обязательны"
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
          <p className="text-sm text-slate-600">
            Как инвестор вы видите только клиентов по своим договорам. Новых клиентов и договоров
            создаёт администратор и назначает их вам.
          </p>
        </Card>
      )}

      {isOwner && showClientForm && (
        <Card>
          <SectionTitle title="Создать клиента" />
          <form onSubmit={handleCreateClient} className="grid gap-4 md:grid-cols-2">
            <Input placeholder="ФИО" value={clientForm.full_name} onChange={(e) => setClientForm({ ...clientForm, full_name: e.target.value })} required />
            <Input placeholder="Телефон" value={clientForm.phone} onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })} required />
            <Input placeholder="Паспорт" value={clientForm.passport} onChange={(e) => setClientForm({ ...clientForm, passport: e.target.value })} required />
            <Input placeholder="Адрес" value={clientForm.address} onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })} required />
            <Input placeholder="Поручитель ФИО" value={clientForm.guarantor_full_name} onChange={(e) => setClientForm({ ...clientForm, guarantor_full_name: e.target.value })} required />
            <Input placeholder="Поручитель телефон" value={clientForm.guarantor_phone} onChange={(e) => setClientForm({ ...clientForm, guarantor_phone: e.target.value })} required />
            <Input placeholder="Поручитель паспорт" value={clientForm.guarantor_passport} onChange={(e) => setClientForm({ ...clientForm, guarantor_passport: e.target.value })} required className="md:col-span-2" />
            <Button type="submit" className="md:col-span-2">Создать клиента</Button>
          </form>
        </Card>
      )}

      {isOwner && showContractForm && (
        <Card>
          <SectionTitle title="Создать договор" description="Назначьте инвестора — взнос пойдёт в его кассу" />
          <form onSubmit={handleCreateContract} className="grid gap-4 md:grid-cols-2">
            <FormField label="Клиент">
              <select
                value={contractForm.retail_client_id}
                onChange={(e) => setContractForm({ ...contractForm, retail_client_id: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                required
              >
                <option value="">Выберите клиента</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.full_name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Инвестор">
              <select
                value={contractForm.investor_id}
                onChange={(e) => setContractForm({ ...contractForm, investor_id: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                required
              >
                <option value="">Выберите инвестора</option>
                {investors.map((investor) => (
                  <option key={investor.id} value={investor.id}>{investor.full_name}</option>
                ))}
              </select>
            </FormField>
            <Input placeholder="Название товара" value={contractForm.product_name} onChange={(e) => setContractForm({ ...contractForm, product_name: e.target.value })} required />
            <Input type="number" placeholder="Цена товара" value={contractForm.product_price} onChange={(e) => setContractForm({ ...contractForm, product_price: e.target.value })} required />
            <FormField label="Срок">
              <select
                value={contractForm.term_months}
                onChange={(e) => setContractForm({ ...contractForm, term_months: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
              >
                {rates.map((rate) => (
                  <option key={rate.id} value={rate.term_months}>
                    {rate.term_months} мес. ({rate.markup_percent}%)
                  </option>
                ))}
              </select>
            </FormField>
            <Input type="number" placeholder="Первоначальный взнос" value={contractForm.down_payment} onChange={(e) => setContractForm({ ...contractForm, down_payment: e.target.value })} required />
            <Input type="date" value={contractForm.contract_date} onChange={(e) => setContractForm({ ...contractForm, contract_date: e.target.value })} required />
            <Button type="submit" className="md:col-span-2">Создать договор</Button>
          </form>
        </Card>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <Card>
        {clients.length === 0 ? (
          <EmptyState>
            {isOwner
              ? "Клиентов пока нет. Создайте первого клиента и договор."
              : "Пока нет клиентов по вашим договорам. Администратор создаст договор и назначит его вам."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ФИО</th>
                  <th>Телефон</th>
                  <th>Паспорт</th>
                  <th>Поручитель</th>
                  <th>Договоров</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td className="font-medium text-slate-900">{formatShortName(client.full_name)}</td>
                    <td>{client.phone}</td>
                    <td>{client.passport}</td>
                    <td>{formatShortName(client.guarantor_full_name)}</td>
                    <td>{client.contracts_count}</td>
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
