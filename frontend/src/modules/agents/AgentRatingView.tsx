"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { BackLink, Card, EmptyState, LoadingState, PageHeader, SectionTitle } from "@/components/ui";
import { ApiRequestError, agentsApi } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatMoney, formatMonthLabel, pluralRu } from "@/lib/format";
import type { AgentRanking, RankingPeriod } from "@/lib/types";

const MEDALS = ["🥇", "🥈", "🥉"];

function points(count: number): string {
  return pluralRu(count, ["балл", "балла", "баллов"]);
}

function MyPlace({ data }: { data: AgentRanking }) {
  const me = data.me;
  if (!me) return null;
  const scope = data.period === "month" ? "в этом месяце" : "за всё время";
  return (
    <Card className="flex flex-wrap items-center gap-4">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white">
        {me.place ? (me.place <= 3 ? MEDALS[me.place - 1] : me.place) : "—"}
      </div>
      <div className="min-w-0">
        {me.place ? (
          <>
            <p className="text-lg font-semibold text-foreground">
              Вы на {me.place} месте {scope}
            </p>
            <p className="text-sm text-muted">
              {points(me.points)}
              {me.gap_to_next
                ? ` · до ${me.place - 1} места не хватает ${points(me.gap_to_next)}`
                : " · вы лидер, держите отрыв!"}
            </p>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold text-foreground">Вы пока не в рейтинге {scope}</p>
            <p className="text-sm text-muted">
              Приведите первого клиента в офис — и сразу получите {points(data.points_visit)}.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

/** Рейтинг удалённых менеджеров: агент видит себя и сокращённые имена, офис — ФИО со ссылками. */
export function AgentRatingView({ office = false }: { office?: boolean }) {
  const [period, setPeriod] = useState<RankingPeriod>("month");
  const [data, setData] = useState<AgentRanking | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    agentsApi.ranking(period).then(
      (result) => alive && setData(result),
      (err) => alive && setError(err instanceof ApiRequestError ? err.message : "Не удалось загрузить рейтинг"),
    );
    return () => {
      alive = false;
    };
  }, [period]);

  return (
    <div className="page-stack">
      <PageHeader
        title={office ? "Рейтинг удалённых менеджеров" : "Рейтинг"}
        subtitle="Соревнование удалённых менеджеров. Баллы начисляются только за реальный результат."
        back={office ? <BackLink href="/agents">К удалённым менеджерам</BackLink> : undefined}
      />

      <Card variant="accent">
        <div className="flex flex-wrap items-start gap-4">
          <span aria-hidden className="text-4xl">🏆</span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-lg font-semibold text-foreground">
              Лучший месяца — премия {data ? formatMoney(data.bonus_amount) : "…"} и значок
            </p>
            <ul className="space-y-0.5 text-sm text-muted">
              <li>+{data ? points(data.points_visit) : "…"} — клиент пришёл в офис</li>
              <li>+{data ? points(data.points_contract) : "…"} — клиент заключил договор и внёс первый платёж</li>
              <li>
                Премию получает первое место месяца, если у него есть хотя бы один договор с первым
                платежом. Итоги подводятся 1-го числа.
              </li>
            </ul>
          </div>
        </div>
      </Card>

      <div className="inline-flex w-fit rounded-lg border border-border bg-surface-muted p-0.5">
        {(
          [
            ["month", "Этот месяц"],
            ["all", "За всё время"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setPeriod(value)}
            className={cn(
              "rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
              period === value ? "bg-surface text-foreground shadow-soft" : "text-muted hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="alert-danger">{error}</p> : null}
      {!data && !error ? <LoadingState text="Загрузка рейтинга..." /> : null}

      {data ? (
        <>
          <MyPlace data={data} />

          <Card>
            <SectionTitle
              title={data.period === "month" ? `Рейтинг · ${formatMonthLabel(data.month)}` : "Рейтинг за всё время"}
            />
            {data.entries.length === 0 ? (
              <EmptyState>
                {office
                  ? "Пока никто из удалённых менеджеров не набрал баллов."
                  : "Пока никто не набрал баллов — станьте первым!"}
              </EmptyState>
            ) : (
              <ol className="space-y-1.5">
                {data.entries.map((row) => (
                  <li
                    key={`${row.place}-${row.name}`}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-3 py-2.5",
                      row.is_me ? "border-brand-600 bg-brand-50" : "border-border",
                    )}
                  >
                    <span className="w-8 shrink-0 text-center text-lg font-bold tabular-nums text-foreground">
                      {row.place <= 3 ? MEDALS[row.place - 1] : row.place}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {row.agent_id ? (
                          <Link href={`/agents/${row.agent_id}`} className="link-brand">
                            {row.name}
                          </Link>
                        ) : (
                          row.name
                        )}
                        {row.is_me ? <span className="ml-1.5 text-xs font-medium text-brand-700">это вы</span> : null}
                        {row.wins > 0 ? (
                          <span className="ml-1.5 text-xs" title="Лучший месяца">
                            {"🏆".repeat(Math.min(row.wins, 5))}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted">
                        {pluralRu(row.visits, ["визит", "визита", "визитов"])} ·{" "}
                        {pluralRu(row.contracts, ["договор", "договора", "договоров"])}
                      </p>
                    </div>
                    <span className="shrink-0 text-base font-semibold tabular-nums text-foreground">
                      {points(row.points)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <SectionTitle title="Зал славы" description="Лучшие удалённые менеджеры прошлых месяцев" />
            {data.winners.length === 0 ? (
              <EmptyState>Первый победитель появится после окончания месяца</EmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {data.winners.map((winner) => (
                  <li key={winner.month} className="flex items-center gap-3 py-2 text-sm">
                    <span aria-hidden>🏆</span>
                    <span className="w-36 shrink-0 capitalize text-muted">{formatMonthLabel(winner.month)}</span>
                    <span className={cn("flex-1 font-semibold", winner.is_me ? "text-brand-700" : "text-foreground")}>
                      {winner.name}
                      {winner.is_me ? " (вы)" : ""}
                    </span>
                    <span className="tabular-nums text-muted">{points(winner.points)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
