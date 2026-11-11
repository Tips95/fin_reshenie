import Link from "next/link";

import { Badge } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { formatPhoneDisplay } from "@/lib/phone";
import type { AgentLeadRow, AgentLeadStage } from "@/lib/types";

export const AGENT_LEAD_STAGES: Record<
  AgentLeadStage,
  { label: string; tone: "default" | "success" | "warning" | "danger" }
> = {
  new: { label: "В работе у офиса", tone: "default" },
  appointment: { label: "Записан в офис", tone: "warning" },
  unqualified: { label: "Не подошёл", tone: "danger" },
  visited: { label: "Пришёл, собирает документы", tone: "warning" },
  contract: { label: "Договор, ждём первый платёж", tone: "warning" },
  earned: { label: "Платёж внесён — к выплате", tone: "success" },
  paid_out: { label: "Выплачено", tone: "success" },
  cancelled: { label: "Договор расторгнут", tone: "danger" },
};

export function AgentLeadsTable({ leads }: { leads: AgentLeadRow[] }) {
  return (
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
          {leads.map((row) => {
            const stage = AGENT_LEAD_STAGES[row.stage];
            return (
              <tr key={row.questionnaire_id}>
                <td data-label="Клиент">
                  <Link href={`/questionnaires/${row.questionnaire_id}`} className="font-medium text-brand-700">
                    {row.full_name.trim() || formatPhoneDisplay(row.phone)}
                  </Link>
                  <p className="text-xs text-muted">
                    {formatPhoneDisplay(row.phone)} · {formatDate(row.created_at)}
                  </p>
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
  );
}
