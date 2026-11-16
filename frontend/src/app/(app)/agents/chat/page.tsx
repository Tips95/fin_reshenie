"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  BackLink,
  Badge,
  Card,
  CollapsibleCard,
  EmptyState,
  Input,
  LoadingState,
  PageHeader,
  SectionTitle,
  SegmentedControl,
} from "@/components/ui";
import { ApiRequestError, agentChatApi } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { seesAllAgents } from "@/lib/organization-features";
import type { AgentChatThread } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";
import { ChatPanel, WhatsAppGroupEditor } from "@/modules/agents/AgentChat";

type Tab = "personal" | "shared";
const CURATOR_ROLES = ["owner", "head_manager", "manager"];

function PersonalThread({ thread, onSent }: { thread: AgentChatThread; onSent: () => void }) {
  const load = useCallback(() => agentChatApi.personal(thread.agent_id), [thread.agent_id]);
  const send = useCallback(
    async (body: string) => {
      await agentChatApi.sendPersonal(body, thread.agent_id);
      onSent();
    },
    [thread.agent_id, onSent],
  );
  return (
    <ChatPanel
      load={load}
      send={send}
      placeholder={`Ответ для ${thread.agent_name}`}
      emptyText="Переписки пока нет — можно написать первым."
    />
  );
}

export default function AgentsChatPage() {
  const { user } = useAuth();
  const seesAll = seesAllAgents(user);
  const [tab, setTab] = useState<Tab>("personal");
  const [threads, setThreads] = useState<AgentChatThread[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadThreads = useCallback(async () => {
    try {
      setThreads(await agentChatApi.threads());
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось загрузить переписки");
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "shared") setTab("shared");
    setSelectedId(params.get("agent"));
    void loadThreads();
  }, [loadThreads]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (threads ?? []).filter((thread) => !query || thread.agent_name.toLowerCase().includes(query));
  }, [threads, search]);
  const selected = threads?.find((thread) => thread.agent_id === selectedId) ?? null;

  function select(agentId: string | null) {
    setSelectedId(agentId);
    const url = agentId ? `/agents/chat?agent=${agentId}` : "/agents/chat";
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="page-stack">
      <PageHeader
        back={<BackLink href="/agents">Удалённые менеджеры</BackLink>}
        title="Чат с удалёнными менеджерами"
        subtitle="Личные вопросы подопечных и общий чат, где ответ видят все"
      />

      {user && CURATOR_ROLES.includes(user.role) ? (
        <CollapsibleCard
          title="Моя группа в WhatsApp"
          description="Ссылку увидят ваши подопечные в кабинете и в чате"
        >
          <WhatsAppGroupEditor />
        </CollapsibleCard>
      ) : null}

      {seesAll ? (
        <SegmentedControl
          options={[
            ["personal", "Личные"],
            ["shared", "Общий чат"],
          ]}
          value={tab}
          onChange={setTab}
        />
      ) : null}

      {error ? <p className="alert-danger">{error}</p> : null}

      {tab === "shared" && seesAll ? (
        <ChatPanel
          load={agentChatApi.shared}
          send={agentChatApi.sendShared}
          placeholder="Ответ всем удалённым менеджерам"
          emptyText="В общем чате пока нет вопросов."
        />
      ) : threads === null ? (
        <LoadingState text="Загрузка переписок..." />
      ) : threads.length === 0 ? (
        <EmptyState>У вас пока нет подопечных удалённых менеджеров.</EmptyState>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className={cn("p-2", selected && "hidden lg:block")}>
            <div className="p-1.5">
              <Input value={search} placeholder="Поиск по ФИО" onChange={(event) => setSearch(event.target.value)} />
            </div>
            <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
              {visible.map((thread) => (
                <li key={thread.agent_id}>
                  <button
                    type="button"
                    onClick={() => select(thread.agent_id)}
                    className={cn(
                      "interactive w-full rounded-lg px-3 py-2 text-left",
                      thread.agent_id === selectedId ? "bg-brand-50" : "hover:bg-surface-muted",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                        {thread.agent_name}
                      </span>
                      {thread.last_from_agent ? <Badge tone="warning">ждёт ответа</Badge> : null}
                      {!thread.is_active ? <Badge>отключён</Badge> : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {thread.last_body
                        ? `${thread.last_at ? `${formatDateTime(thread.last_at)} · ` : ""}${thread.last_body}`
                        : seesAll && thread.curator_name
                          ? `Куратор: ${thread.curator_name}`
                          : "Сообщений нет"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {selected ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <SectionTitle
                  title={selected.agent_name}
                  description={selected.curator_name ? `Куратор: ${selected.curator_name}` : "Куратор не назначен"}
                />
                <button type="button" className="link-brand text-sm lg:hidden" onClick={() => select(null)}>
                  ← Все
                </button>
              </div>
              <PersonalThread key={selected.agent_id} thread={selected} onSent={() => void loadThreads()} />
            </div>
          ) : (
            <Card className="hidden items-center justify-center text-sm text-muted lg:flex">
              Выберите удалённого менеджера слева
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
