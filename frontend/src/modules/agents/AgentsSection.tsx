"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  PageHeader,
  Select,
  StatCard,
} from "@/components/ui";
import { ApiRequestError, agentsApi } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/format";
import { seesAllAgents } from "@/lib/organization-features";
import { formatPhoneDisplay } from "@/lib/phone";
import type { AgentInfo } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

type StatusFilter = "all" | "active" | "disabled";

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.message : fallback;
}

function matchesSearch(agent: AgentInfo, query: string): boolean {
  if (!query) return true;
  const digits = query.replace(/\D/g, "");
  const haystack = [agent.full_name, agent.email, agent.telegram, agent.inn]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (haystack.includes(query)) return true;
  return digits.length >= 3 && (agent.phone ?? "").replace(/\D/g, "").includes(digits);
}

function SignupToggle() {
  const [open, setOpen] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    agentsApi
      .signup()
      .then((data) => setOpen(data.open))
      .catch((err) => setError(errorText(err, "Не удалось узнать статус регистрации")));
  }, []);

  async function toggle() {
    if (open === null) return;
    setBusy(true);
    setError(null);
    try {
      setOpen((await agentsApi.setSignup(!open)).open);
    } catch (err) {
      setError(errorText(err, open ? "Не удалось закрыть регистрацию" : "Не удалось открыть регистрацию"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted p-3">
      <div className="space-y-0.5">
        <p className="text-xs font-semibold text-foreground">
          Регистрация на сайте{" "}
          {open ? <Badge tone="success">открыта</Badge> : <Badge>закрыта</Badge>}
        </p>
        <p className="text-xs text-muted">
          {open
            ? "На странице входа видна кнопка «Стать удалённым менеджером»."
            : "Откройте, чтобы на странице входа появилась кнопка «Стать удалённым менеджером»."}
        </p>
        {error ? <p className="text-xs text-status-danger-text">{error}</p> : null}
      </div>
      <Button
        type="button"
        size="sm"
        variant={open ? "ghost" : "primary"}
        disabled={busy || open === null}
        onClick={() => void toggle()}
      >
        {open ? "Закрыть регистрацию" : "Открыть регистрацию"}
      </Button>
    </div>
  );
}

export function AgentsSection() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const seesAll = seesAllAgents(user);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [curatorId, setCuratorId] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");

  const load = useCallback(async () => {
    try {
      setAgents(await agentsApi.list());
    } catch (err) {
      setError(errorText(err, "Не удалось загрузить удалённых менеджеров"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const curators = useMemo(() => {
    const byId = new Map<string, string>();
    for (const agent of agents) {
      if (agent.curator_id) byId.set(agent.curator_id, agent.curator_name ?? "—");
    }
    return Array.from(byId.entries()).sort((a, b) => a[1].localeCompare(b[1], "ru"));
  }, [agents]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return agents.filter((agent) => {
      if (status === "active" && !agent.is_active) return false;
      if (status === "disabled" && agent.is_active) return false;
      if (curatorId === "none" && agent.curator_id) return false;
      if (curatorId && curatorId !== "none" && agent.curator_id !== curatorId) return false;
      return matchesSearch(agent, query);
    });
  }, [agents, search, curatorId, status]);

  const activeCount = agents.filter((agent) => agent.is_active).length;
  const leadsTotal = agents.reduce((sum, agent) => sum + agent.leads_total, 0);
  const contractsTotal = agents.reduce((sum, agent) => sum + agent.contracts_total, 0);
  const toPay = agents.reduce(
    (sum, agent) => sum + Number(agent.earned_total) - Number(agent.paid_total),
    0,
  );

  return (
    <div className="page-stack">
      <PageHeader
        title="Удалённые менеджеры"
        subtitle={
          seesAll
            ? "Регистрируются сами на сайте и сразу заводят клиентов. 5 000 ₽ агенту и 5 000 ₽ менеджеру — после первого платежа клиента."
            : "Ваши подопечные: их клиенты, вопросы и выплаты"
        }
        action={
          seesAll ? (
            <Link href="/agents/rating">
              <Button type="button" variant="secondary">
                🏆 Рейтинг
              </Button>
            </Link>
          ) : null
        }
      />

      {isOwner ? <SignupToggle /> : null}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Работают" value={`${activeCount} из ${agents.length}`} tone="brand" />
        <StatCard label="Клиентов привели" value={leadsTotal} />
        <StatCard label="Договоров" value={contractsTotal} />
        <StatCard label="К выплате агентам" value={formatMoney(toPay)} tone="warning" />
      </div>

      <Card>
        <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <Input
            value={search}
            placeholder="Поиск: имя, телефон, Telegram, ИНН"
            onChange={(event) => setSearch(event.target.value)}
          />
          {seesAll ? (
            <Select value={curatorId} onChange={(event) => setCuratorId(event.target.value)}>
              <option value="">Все кураторы</option>
              <option value="none">Без куратора</option>
              {curators.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          ) : null}
          <Select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
            <option value="active">Работают</option>
            <option value="disabled">Отключены</option>
            <option value="all">Все</option>
          </Select>
        </div>

        {error ? <p className="alert-danger mb-3">{error}</p> : null}

        {loading ? (
          <LoadingState text="Загрузка..." />
        ) : agents.length === 0 ? (
          <EmptyState>
            {seesAll
              ? "Пока никто не зарегистрировался. Регистрация — кнопкой «Стать удалённым менеджером» на странице входа."
              : "За вами пока не закреплён ни один удалённый менеджер."}
          </EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState>Никого не нашли — измените поиск или фильтры</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table table-cards">
              <thead>
                <tr>
                  <th>Удалённый менеджер</th>
                  {seesAll ? <th>Куратор</th> : null}
                  <th>Клиентов / договоров</th>
                  <th>Заработано / выплачено</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((agent) => (
                  <tr key={agent.id} className={!agent.is_active ? "opacity-70" : undefined}>
                    <td data-label="Удалённый менеджер">
                      <Link href={`/agents/${agent.id}`} className="font-semibold text-brand-700">
                        {agent.full_name}
                      </Link>
                      <p className="text-xs text-muted">
                        {[agent.phone ? formatPhoneDisplay(agent.phone) : null, agent.telegram]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="text-[11px] text-muted">с {formatDate(agent.created_at)}</p>
                    </td>
                    {seesAll ? (
                      <td data-label="Куратор">
                        {agent.curator_name ?? <span className="text-muted">не назначен</span>}
                      </td>
                    ) : null}
                    <td data-label="Клиентов / договоров" className="tabular-nums">
                      {agent.leads_total} / {agent.contracts_total}
                    </td>
                    <td data-label="Заработано / выплачено" className="tabular-nums">
                      {formatMoney(agent.earned_total)} / {formatMoney(agent.paid_total)}
                    </td>
                    <td data-label="Статус">
                      {agent.is_active ? <Badge tone="success">Работает</Badge> : <Badge>Отключён</Badge>}
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
