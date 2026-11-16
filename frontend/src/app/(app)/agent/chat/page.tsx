"use client";

import { useCallback, useEffect, useState } from "react";

import { Card, PageHeader, SegmentedControl } from "@/components/ui";
import { agentChatApi, agentsApi } from "@/lib/api-client";
import type { AgentOverview } from "@/lib/types";
import { ChatPanel, WhatsAppGroupLink } from "@/modules/agents/AgentChat";

type Tab = "personal" | "shared";

export default function AgentChatPage() {
  const [tab, setTab] = useState<Tab>("personal");
  const [curator, setCurator] = useState<AgentOverview["curator"]>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "shared") setTab("shared");
    agentsApi
      .myOverview()
      .then((overview) => setCurator(overview.curator))
      .catch(() => setCurator(null));
  }, []);

  const loadPersonal = useCallback(() => agentChatApi.personal(), []);
  const sendPersonal = useCallback((body: string) => agentChatApi.sendPersonal(body), []);

  return (
    <div className="page-stack">
      <PageHeader
        title="Чат с куратором"
        subtitle="Личные вопросы — куратору. Общие — в общий чат: ответ увидят все удалённые менеджеры."
      />

      {curator?.whatsapp_group_url ? (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Группа куратора в WhatsApp</p>
            <p className="text-sm text-muted">
              {curator.full_name} публикует там новости, акции и разбирает вопросы.
            </p>
          </div>
          <WhatsAppGroupLink url={curator.whatsapp_group_url} />
        </Card>
      ) : null}

      <SegmentedControl
        options={[
          ["personal", curator ? `Куратор · ${curator.full_name}` : "Мой куратор"],
          ["shared", "Общий чат"],
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "personal" ? (
        <ChatPanel
          key="personal"
          load={loadPersonal}
          send={sendPersonal}
          placeholder="Например: клиент спрашивает, заберут ли машину"
          emptyText="Напишите куратору — ответ придёт сюда и в уведомления."
        />
      ) : (
        <ChatPanel
          key="shared"
          load={agentChatApi.shared}
          send={agentChatApi.sendShared}
          placeholder="Вопрос, который может пригодиться всем"
          emptyText="В общем чате пока тихо — задайте первый вопрос."
        />
      )}
    </div>
  );
}
