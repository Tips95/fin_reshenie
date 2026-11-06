"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  SectionTitle,
  Select,
} from "@/components/ui";
import { ApiRequestError, agentsApi, usersApi } from "@/lib/api-client";
import { formatDate, formatMoney, statusLabel } from "@/lib/format";
import { formatPhoneDisplay } from "@/lib/phone";
import type { AgentInfo, User } from "@/lib/types";

const CURATOR_ROLES = new Set(["owner", "head_manager", "manager"]);

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.message : fallback;
}

function Contacts({ agent }: { agent: AgentInfo }) {
  return (
    <div className="space-y-0.5 text-xs text-muted">
      {agent.phone ? <p>{formatPhoneDisplay(agent.phone)}</p> : null}
      {agent.email ? <p>{agent.email}</p> : null}
      {agent.telegram ? <p>{agent.telegram}</p> : null}
      <p>ИНН: {agent.inn || "не указан"}</p>
    </div>
  );
}

export function AgentsSection({ staff }: { staff: User[] }) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [signupOpen, setSignupOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const curators = useMemo(
    () => staff.filter((item) => item.is_active && CURATOR_ROLES.has(item.role)),
    [staff],
  );

  const load = useCallback(async () => {
    try {
      const [items, signup] = await Promise.all([agentsApi.list(), agentsApi.signup()]);
      setAgents(items);
      setSignupOpen(signup.open);
    } catch (err) {
      setError(errorText(err, "Не удалось загрузить удалённых менеджеров"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(id: string, action: () => Promise<unknown>, fallback: string) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(errorText(err, fallback));
    } finally {
      setBusyId(null);
    }
  }

  function curatorSelect(agent: AgentInfo, value: string, onChange: (value: string) => void) {
    return (
      <Select
        value={value}
        disabled={busyId === agent.id}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Без куратора</option>
        {curators.map((curator) => (
          <option key={curator.id} value={curator.id}>
            {curator.full_name} · {statusLabel(curator.role)}
          </option>
        ))}
      </Select>
    );
  }

  return (
    <Card>
      <SectionTitle
        title="Удалённые менеджеры"
        description="Регистрируются сами кнопкой на сайте, принимая пользовательское соглашение, и сразу могут заводить клиентов. Куратор назначается автоматически — наименее загруженный менеджер, его можно сменить. 5 000 ₽ агенту и 5 000 ₽ менеджеру — после первого платежа клиента."
      />

      {error ? <p className="alert-danger mb-3">{error}</p> : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted p-3">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-foreground">
            Регистрация на сайте{" "}
            {signupOpen ? <Badge tone="success">открыта</Badge> : <Badge>закрыта</Badge>}
          </p>
          <p className="text-xs text-muted">
            {signupOpen
              ? "На странице входа видна кнопка «Стать удалённым менеджером»."
              : "Откройте, чтобы на странице входа появилась кнопка «Стать удалённым менеджером»."}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={signupOpen ? "ghost" : "primary"}
          disabled={busyId === "signup"}
          onClick={() =>
            void run(
              "signup",
              () => agentsApi.setSignup(!signupOpen),
              signupOpen ? "Не удалось закрыть регистрацию" : "Не удалось открыть регистрацию",
            )
          }
        >
          {signupOpen ? "Закрыть регистрацию" : "Открыть регистрацию"}
        </Button>
      </div>

      {loading ? (
        <LoadingState text="Загрузка..." />
      ) : (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Работают · {agents.filter((item) => item.is_active).length}
          </p>
          {agents.length === 0 ? (
            <EmptyState>
              Пока никто не зарегистрировался. Регистрация — кнопкой «Стать удалённым менеджером» на
              странице входа.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table table-cards">
                <thead>
                  <tr>
                    <th>Удалённый менеджер</th>
                    <th>Куратор</th>
                    <th>Клиентов / договоров</th>
                    <th>Заработано / выплачено</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => (
                    <tr key={agent.id} className={!agent.is_active ? "opacity-70" : undefined}>
                      <td data-label="Удалённый менеджер">
                        <p className="font-semibold text-foreground">{agent.full_name}</p>
                        <Contacts agent={agent} />
                        <p className="mt-0.5 text-[11px] text-muted">
                          {agent.terms_accepted_at
                            ? `Соглашение принято ${formatDate(agent.terms_accepted_at)}${agent.terms_version ? ` · ред. ${formatDate(agent.terms_version)}` : ""}`
                            : "Соглашение не принято"}
                        </p>
                      </td>
                      <td data-label="Куратор" className="min-w-[12rem]">
                        {curatorSelect(
                          agent,
                          agent.curator_id ?? "",
                          (value) =>
                            void run(
                              agent.id,
                              () => agentsApi.setCurator(agent.id, value || null),
                              "Не удалось сменить куратора",
                            ),
                        )}
                      </td>
                      <td data-label="Клиентов / договоров" className="tabular-nums">
                        {agent.leads_total} / {agent.contracts_total}
                      </td>
                      <td data-label="Заработано / выплачено" className="tabular-nums">
                        {formatMoney(agent.earned_total)} / {formatMoney(agent.paid_total)}
                      </td>
                      <td data-label="Статус">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {agent.is_active ? (
                            <>
                              <Badge tone="success">Работает</Badge>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={busyId === agent.id}
                                onClick={() => {
                                  if (
                                    !window.confirm(
                                      `Отключить «${agent.full_name}»? Войти он больше не сможет.`,
                                    )
                                  )
                                    return;
                                  void run(
                                    agent.id,
                                    () => usersApi.deactivate(agent.id),
                                    "Не удалось отключить",
                                  );
                                }}
                              >
                                Отключить
                              </Button>
                            </>
                          ) : (
                            <>
                              <Badge>Отключён</Badge>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={busyId === agent.id}
                                onClick={() =>
                                  void run(
                                    agent.id,
                                    () => usersApi.update(agent.id, { is_active: true }),
                                    "Не удалось включить",
                                  )
                                }
                              >
                                Включить
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
