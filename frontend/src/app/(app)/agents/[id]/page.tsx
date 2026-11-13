"use client";

import { useCallback, useEffect, useState } from "react";
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
  Select,
  StatCard,
} from "@/components/ui";
import { ApiRequestError, agentsApi, usersApi } from "@/lib/api-client";
import { formatDate, formatMoney, statusLabel } from "@/lib/format";
import { canSuperviseLeads } from "@/lib/organization-features";
import { formatPhoneDisplay, phoneToTelHref, telegramHref } from "@/lib/phone";
import type { AgentCuratorOption, AgentDetail } from "@/lib/types";
import { AgentLeadsTable } from "@/modules/agents/AgentLeadsTable";
import { useAuth } from "@/modules/auth/AuthProvider";
import { textareaClass } from "@/modules/questionnaires/form-ui";
import { confirmRemoveUser } from "@/modules/users/UsersPageContent";

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.message : fallback;
}

export default function AgentCardPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = canSuperviseLeads(user);
  const [data, setData] = useState<AgentDetail | null>(null);
  const [curators, setCurators] = useState<AgentCuratorOption[]>([]);
  const [note, setNote] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const detail = await agentsApi.get(id);
      setData(detail);
      setNote(detail.agent.agent_note ?? "");
    } catch (err) {
      setLoadError(errorText(err, "Не удалось загрузить удалённого менеджера"));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isAdmin) return;
    agentsApi
      .curators()
      .then(setCurators)
      .catch(() => setCurators([]));
  }, [isAdmin]);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      return true;
    } catch (err) {
      setError(errorText(err, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="page-stack">
        <BackLink href="/agents">Удалённые менеджеры</BackLink>
        <EmptyState>{loadError}</EmptyState>
      </div>
    );
  }
  if (!data) return <LoadingState text="Загрузка..." />;

  const { agent, overview } = data;
  const tel = agent.phone ? phoneToTelHref(agent.phone) : null;
  const noteChanged = note.trim() !== (agent.agent_note ?? "");

  return (
    <div className="page-stack">
      <PageHeader
        back={<BackLink href="/agents">Удалённые менеджеры</BackLink>}
        title={agent.full_name}
        subtitle={`Зарегистрирован ${formatDate(agent.created_at)}${
          agent.terms_accepted_at ? ` · соглашение принято ${formatDate(agent.terms_accepted_at)}` : ""
        }`}
        action={
          <div className="flex items-center gap-2">
            {agent.is_active ? <Badge tone="success">Работает</Badge> : <Badge>Отключён</Badge>}
            {isAdmin ? (
              <Button
                type="button"
                size="sm"
                variant={agent.is_active ? "ghost" : "secondary"}
                disabled={busy}
                onClick={() => {
                  if (
                    agent.is_active &&
                    !window.confirm(`Отключить «${agent.full_name}»? Войти он больше не сможет.`)
                  )
                    return;
                  void run(
                    () => agentsApi.setActive(agent.id, !agent.is_active),
                    agent.is_active ? "Не удалось отключить" : "Не удалось включить",
                  );
                }}
              >
                {agent.is_active ? "Отключить" : "Включить"}
              </Button>
            ) : null}
            {user?.role === "owner" ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  if (!confirmRemoveUser(agent.full_name)) return;
                  setBusy(true);
                  setError(null);
                  try {
                    await usersApi.remove(agent.id);
                    router.replace("/agents");
                  } catch (err) {
                    setError(errorText(err, "Не удалось удалить"));
                    setBusy(false);
                  }
                }}
              >
                Удалить
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? <p className="alert-danger">{error}</p> : null}

      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <SectionTitle title="Контакты" />
          <div className="space-y-1.5 text-sm">
            {agent.phone ? (
              <p>
                {tel ? (
                  <a href={tel} className="link-brand">
                    {formatPhoneDisplay(agent.phone)}
                  </a>
                ) : (
                  formatPhoneDisplay(agent.phone)
                )}
              </p>
            ) : null}
            {agent.telegram ? (
              <p>
                <a href={telegramHref(agent.telegram)} target="_blank" rel="noreferrer" className="link-brand">
                  Telegram {agent.telegram}
                </a>
              </p>
            ) : null}
            {agent.email ? <p className="text-muted">{agent.email}</p> : null}
            <p className="text-muted">ИНН: {agent.inn || "не указан"}</p>
          </div>
        </Card>

        <Card>
          <SectionTitle title="Куратор" description="Получает уведомления о клиентах и вопросах" />
          {isAdmin ? (
            <Select
              value={agent.curator_id ?? ""}
              disabled={busy}
              onChange={(event) =>
                void run(
                  () => agentsApi.setCurator(agent.id, event.target.value || null),
                  "Не удалось сменить куратора",
                )
              }
            >
              <option value="">Без куратора</option>
              {curators.map((curator) => (
                <option key={curator.id} value={curator.id}>
                  {curator.full_name} · {statusLabel(curator.role)}
                </option>
              ))}
            </Select>
          ) : (
            <p className="text-sm text-foreground">{agent.curator_name ?? "Не назначен"}</p>
          )}
        </Card>

        <Card>
          <SectionTitle title="Заметка" description="Видна только офису" />
          <textarea
            className={textareaClass}
            value={note}
            maxLength={4000}
            placeholder="Например: работает по Грозному, лучше звонить после 18:00"
            onChange={(event) => {
              setNote(event.target.value);
              setNoteSaved(false);
            }}
          />
          <div className="mt-2 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy || !noteChanged}
              onClick={async () => {
                if (await run(() => agentsApi.setNote(agent.id, note), "Не удалось сохранить заметку")) {
                  setNoteSaved(true);
                }
              }}
            >
              Сохранить
            </Button>
            {noteSaved && !noteChanged ? <span className="text-xs text-muted">Сохранено</span> : null}
          </div>
        </Card>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Клиентов привёл" value={overview.leads_total} tone="brand" />
        <StatCard label="Записаны в офис" value={overview.appointments_total} />
        <StatCard label="Договоров" value={overview.contracts_total} />
        <StatCard label="Заработано" value={formatMoney(overview.earned_total)} tone="success" />
        <StatCard label="Выплачено" value={formatMoney(overview.paid_total)} />
        <StatCard label="К выплате" value={formatMoney(overview.to_pay_total)} tone="warning" />
      </div>

      <Card>
        <SectionTitle title="Клиенты" description="Анкеты, которые завёл удалённый менеджер" />
        {overview.leads.length === 0 ? (
          <EmptyState>Пока ни одного клиента</EmptyState>
        ) : (
          <AgentLeadsTable leads={overview.leads} />
        )}
      </Card>
    </div>
  );
}
