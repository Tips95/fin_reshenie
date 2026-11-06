"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageHeader,
  SectionTitle,
  StatCard,
} from "@/components/ui";
import { ApiRequestError, agentsApi } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/format";
import { formatPhoneDisplay, phoneToTelHref } from "@/lib/phone";
import type { AgentLeadStage, AgentOverview } from "@/lib/types";

const STAGES: Record<AgentLeadStage, { label: string; tone: "default" | "success" | "warning" | "danger" }> = {
  new: { label: "В работе у офиса", tone: "default" },
  appointment: { label: "Записан в офис", tone: "warning" },
  unqualified: { label: "Не подошёл", tone: "danger" },
  visited: { label: "Пришёл, собирает документы", tone: "warning" },
  contract: { label: "Договор, ждём первый платёж", tone: "warning" },
  earned: { label: "Платёж внесён — к выплате", tone: "success" },
  paid_out: { label: "Выплачено", tone: "success" },
  cancelled: { label: "Договор расторгнут", tone: "danger" },
};

const STEPS = [
  "Заведите клиента и заполните анкету — с его согласия на передачу данных.",
  "Запишите на приём в офис: куратор увидит лида и подготовится к встрече.",
  "Офис заключает договор. После первого платежа клиента вам начисляется вознаграждение.",
];

function telegramHref(value: string): string {
  return `https://t.me/${value.replace(/^@/, "")}`;
}

export default function AgentCabinetPage() {
  const router = useRouter();
  const [data, setData] = useState<AgentOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setData(await agentsApi.myOverview());
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Не удалось загрузить кабинет");
      }
    })();
  }, []);

  if (error) return <p className="alert-danger">{error}</p>;
  if (!data) return <LoadingState text="Загрузка кабинета..." />;

  const curatorTel = data.curator?.phone ? phoneToTelHref(data.curator.phone) : null;

  return (
    <div className="page-stack">
      <PageHeader
        title="Мой кабинет"
        subtitle={`Вознаграждение — ${formatMoney(data.commission_per_client)} за клиента, который заключил договор и внёс первый платёж`}
        action={
          <Button type="button" onClick={() => router.push("/questionnaires/new")}>
            Новый клиент
          </Button>
        }
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <SectionTitle title="Ваш куратор" description="Задавайте ему вопросы по клиентам и работе" />
          {data.curator ? (
            <div className="space-y-1.5 text-sm">
              <p className="font-semibold text-foreground">{data.curator.full_name}</p>
              {data.curator.phone ? (
                <p>
                  {curatorTel ? (
                    <a href={curatorTel} className="link-brand">
                      {formatPhoneDisplay(data.curator.phone)}
                    </a>
                  ) : (
                    formatPhoneDisplay(data.curator.phone)
                  )}
                </p>
              ) : null}
              {data.curator.telegram ? (
                <p>
                  <a
                    href={telegramHref(data.curator.telegram)}
                    target="_blank"
                    rel="noreferrer"
                    className="link-brand"
                  >
                    Telegram {data.curator.telegram}
                  </a>
                </p>
              ) : null}
              {data.curator.email ? <p className="text-muted">{data.curator.email}</p> : null}
              <p className="pt-1 text-xs text-muted">
                По конкретному клиенту удобнее писать в карточке лида — в блоке «Вопросы куратору».
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">Куратор ещё не назначен — руководитель скоро его закрепит.</p>
          )}
        </Card>

        <Card>
          <SectionTitle title="Как это работает" />
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-foreground">
            {STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Card>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Клиентов приведено" value={data.leads_total} tone="brand" />
        <StatCard label="Записаны в офис" value={data.appointments_total} />
        <StatCard label="Договоров" value={data.contracts_total} />
        <StatCard label="Заработано" value={formatMoney(data.earned_total)} tone="success" />
        <StatCard label="Выплачено" value={formatMoney(data.paid_total)} />
        <StatCard label="К выплате" value={formatMoney(data.to_pay_total)} tone="warning" />
      </div>

      <Card>
        <SectionTitle title="Мои клиенты" description="Статус обновляется по мере работы офиса" />
        {data.leads.length === 0 ? (
          <EmptyState
            action={
              <Button type="button" onClick={() => router.push("/questionnaires/new")}>
                Завести первого клиента
              </Button>
            }
          >
            Вы ещё не привели ни одного клиента
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table table-cards">
              <thead>
                <tr>
                  <th>Клиент</th>
                  <th>Этап</th>
                  <th>Приём</th>
                  <th>Первый платёж</th>
                  <th>Вознаграждение</th>
                </tr>
              </thead>
              <tbody>
                {data.leads.map((row) => {
                  const stage = STAGES[row.stage];
                  return (
                    <tr key={row.questionnaire_id}>
                      <td data-label="Клиент">
                        <Link href={`/questionnaires/${row.questionnaire_id}`} className="font-medium text-brand-700">
                          {row.full_name.trim() || formatPhoneDisplay(row.phone)}
                        </Link>
                        <p className="text-xs text-muted">{formatPhoneDisplay(row.phone)}</p>
                      </td>
                      <td data-label="Этап">
                        <Badge tone={stage.tone}>{stage.label}</Badge>
                      </td>
                      <td data-label="Приём" className="text-muted">
                        {row.appointment_at ? formatDate(row.appointment_at) : "—"}
                      </td>
                      <td data-label="Первый платёж" className="text-muted">
                        {row.first_payment_date ? formatDate(row.first_payment_date) : "—"}
                      </td>
                      <td data-label="Вознаграждение" className="font-semibold tabular-nums">
                        {row.commission_amount ? formatMoney(row.commission_amount) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
