"""Превью и массовая отправка WhatsApp-напоминаний о платежах."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.client import Client
from app.models.enums import ClientStatus
from app.models.installment_plan import InstallmentPlan
from app.models.payment_schedule import PaymentSchedule
from app.models.user import User
from app.models.whatsapp_reminder_log import WhatsappReminderLog
from app.schemas.payment_reminders import (
    PaymentReminderItem,
    PaymentReminderSendItemResult,
    PaymentRemindersPreview,
    PaymentRemindersSendResponse,
)
from app.services.access import apply_client_visibility_filter
from app.services.dashboard import _resolve_period
from app.services.green_api import (
    GreenApiError,
    GreenApiNotConfiguredError,
    is_green_api_configured,
    phone_to_chat_id,
    send_text_message,
)
from app.services.overdues import clients_overdue_summaries
from app.services.schedule_dates import effective_due_date, schedule_remainder

_INACTIVE = {ClientStatus.CANCELLED, ClientStatus.COMPLETED}

KIND_DUE = "due"
KIND_OVERDUE = "overdue"
STATUS_SENT = "sent"
STATUS_FAILED = "failed"
STATUS_SKIPPED = "skipped"


@dataclass(slots=True)
class _Candidate:
    client: Client
    kind: str
    amount: Decimal
    due_date: date
    message: str
    has_phone: bool
    last_sent_at: datetime | None = None


def _format_money(amount: Decimal) -> str:
    quantized = amount.quantize(Decimal("0.01"))
    text = f"{quantized:,.2f}".replace(",", " ").replace(".", ",")
    return f"{text} ₽"


def _format_date(value: date) -> str:
    return value.strftime("%d.%m.%Y")


def _first_name(full_name: str) -> str:
    parts = full_name.strip().split()
    if len(parts) >= 2:
        return parts[1]
    return parts[0] if parts else "клиент"


def build_due_message(*, full_name: str, amount: Decimal, due_date: date) -> str:
    return (
        f"Здравствуйте, {_first_name(full_name)}!\n\n"
        f"Напоминаем о предстоящем платеже по рассрочке на сумму {_format_money(amount)}. "
        f"Просим оплатить до {_format_date(due_date)}.\n\n"
        f"С уважением, юридическая компания."
    )


def build_overdue_message(*, full_name: str, amount: Decimal, due_date: date) -> str:
    return (
        f"Здравствуйте, {_first_name(full_name)}!\n\n"
        f"У вас имеется просроченная задолженность по рассрочке "
        f"на сумму {_format_money(amount)} (срок платежа {_format_date(due_date)}). "
        f"Просим погасить задолженность в ближайшее время.\n\n"
        f"С уважением, юридическая компания."
    )


def _last_sent_map(
    db: Session,
    *,
    organization_id: UUID,
    period_month: str,
    client_ids: list[UUID],
) -> dict[UUID, datetime]:
    if not client_ids:
        return {}
    rows = db.execute(
        select(
            WhatsappReminderLog.client_id,
            WhatsappReminderLog.created_at,
        )
        .where(
            WhatsappReminderLog.organization_id == organization_id,
            WhatsappReminderLog.period_month == period_month,
            WhatsappReminderLog.status == STATUS_SENT,
            WhatsappReminderLog.client_id.in_(client_ids),
        )
        .order_by(WhatsappReminderLog.created_at.desc())
    ).all()
    result: dict[UUID, datetime] = {}
    for client_id, created_at in rows:
        if client_id not in result:
            result[client_id] = created_at
    return result


def collect_reminder_candidates(
    db: Session,
    user: User,
    *,
    month: str | None = None,
) -> tuple[str, list[_Candidate]]:
    today = date.today()
    period_month, month_start, month_end, _ = _resolve_period(month, today)

    clients = list(
        db.scalars(
            apply_client_visibility_filter(
                select(Client).where(Client.is_deleted.is_(False)),
                user,
            )
        ).all()
    )
    if not clients:
        return period_month, []

    clients_by_id = {client.id: client for client in clients}
    client_ids = list(clients_by_id.keys())

    due_by_client: dict[UUID, tuple[Decimal, date]] = {}
    schedule_rows = db.execute(
        select(InstallmentPlan.client_id, PaymentSchedule)
        .join(PaymentSchedule, PaymentSchedule.installment_plan_id == InstallmentPlan.id)
        .where(InstallmentPlan.client_id.in_(client_ids))
    ).all()

    for client_id, schedule in schedule_rows:
        client = clients_by_id.get(client_id)
        if client is None or client.status in _INACTIVE:
            continue
        remainder = schedule_remainder(schedule)
        if remainder <= Decimal("0.00"):
            continue
        due = effective_due_date(schedule)
        if not (month_start <= due <= month_end):
            continue
        prev = due_by_client.get(client_id)
        if prev is None:
            due_by_client[client_id] = (remainder, due)
        else:
            amount, earliest = prev
            due_by_client[client_id] = (amount + remainder, min(earliest, due))

    overdue_summaries = clients_overdue_summaries(db, client_ids, today=today)
    last_sent = _last_sent_map(
        db,
        organization_id=user.organization_id,
        period_month=period_month,
        client_ids=client_ids,
    )

    merged_ids = set(due_by_client) | set(overdue_summaries)
    candidates: list[_Candidate] = []
    for client_id in merged_ids:
        client = clients_by_id.get(client_id)
        if client is None or client.status in _INACTIVE:
            continue

        overdue = overdue_summaries.get(client_id)
        if overdue is not None:
            kind = KIND_OVERDUE
            amount = overdue["overdue_amount"]
            due_date = overdue["oldest_due_date"]
            message = build_overdue_message(
                full_name=client.full_name,
                amount=amount,
                due_date=due_date,
            )
        else:
            amount, due_date = due_by_client[client_id]
            kind = KIND_DUE
            message = build_due_message(
                full_name=client.full_name,
                amount=amount,
                due_date=due_date,
            )

        has_phone = phone_to_chat_id(client.phone) is not None
        candidates.append(
            _Candidate(
                client=client,
                kind=kind,
                amount=amount,
                due_date=due_date,
                message=message,
                has_phone=has_phone,
                last_sent_at=last_sent.get(client_id),
            )
        )

    candidates.sort(
        key=lambda item: (
            0 if item.kind == KIND_OVERDUE else 1,
            item.due_date,
            item.client.full_name.lower(),
        )
    )
    return period_month, candidates


def preview_payment_reminders(
    db: Session,
    user: User,
    *,
    month: str | None = None,
) -> PaymentRemindersPreview:
    period_month, candidates = collect_reminder_candidates(db, user, month=month)
    items = [
        PaymentReminderItem(
            client_id=item.client.id,
            full_name=item.client.full_name,
            phone=item.client.phone,
            kind=item.kind,
            amount=item.amount,
            due_date=item.due_date,
            message=item.message,
            has_phone=item.has_phone,
            last_sent_at=item.last_sent_at,
        )
        for item in candidates
    ]
    return PaymentRemindersPreview(
        period_month=period_month,
        green_api_configured=is_green_api_configured(),
        total=len(items),
        due_count=sum(1 for item in items if item.kind == KIND_DUE),
        overdue_count=sum(1 for item in items if item.kind == KIND_OVERDUE),
        without_phone_count=sum(1 for item in items if not item.has_phone),
        already_sent_this_month=sum(1 for item in items if item.last_sent_at is not None),
        items=items,
    )


def send_payment_reminders(
    db: Session,
    user: User,
    *,
    month: str | None = None,
    client_ids: list[UUID] | None = None,
) -> PaymentRemindersSendResponse:
    if not is_green_api_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Green API не настроен. Укажите GREEN_API_URL, GREEN_API_ID_INSTANCE и GREEN_API_TOKEN_INSTANCE.",
        )

    period_month, candidates = collect_reminder_candidates(db, user, month=month)
    if client_ids is not None:
        wanted = set(client_ids)
        candidates = [item for item in candidates if item.client.id in wanted]

    batch_id = uuid.uuid4()
    results: list[PaymentReminderSendItemResult] = []
    sent = failed = skipped = 0
    delay = max(0.0, float(settings.GREEN_API_SEND_DELAY_SECONDS))
    seen_clients: set[UUID] = set()

    for index, item in enumerate(candidates):
        client_id = item.client.id
        if client_id in seen_clients:
            continue
        seen_clients.add(client_id)

        if not item.has_phone:
            skipped += 1
            log = WhatsappReminderLog(
                organization_id=user.organization_id,
                client_id=client_id,
                created_by_id=user.id,
                period_month=period_month,
                kind=item.kind,
                status=STATUS_SKIPPED,
                phone=item.client.phone,
                error="Нет валидного телефона для WhatsApp",
                batch_id=batch_id,
            )
            db.add(log)
            results.append(
                PaymentReminderSendItemResult(
                    client_id=client_id,
                    full_name=item.client.full_name,
                    kind=item.kind,
                    status=STATUS_SKIPPED,
                    error="Нет валидного телефона для WhatsApp",
                )
            )
            continue

        try:
            if index > 0 and delay > 0:
                time.sleep(delay)
            send_result = send_text_message(item.client.phone, item.message)
            sent += 1
            log = WhatsappReminderLog(
                organization_id=user.organization_id,
                client_id=client_id,
                created_by_id=user.id,
                period_month=period_month,
                kind=item.kind,
                status=STATUS_SENT,
                phone=item.client.phone,
                id_message=send_result.id_message,
                batch_id=batch_id,
            )
            db.add(log)
            results.append(
                PaymentReminderSendItemResult(
                    client_id=client_id,
                    full_name=item.client.full_name,
                    kind=item.kind,
                    status=STATUS_SENT,
                    id_message=send_result.id_message,
                )
            )
        except (GreenApiError, GreenApiNotConfiguredError) as exc:
            failed += 1
            error_text = str(exc)[:500]
            log = WhatsappReminderLog(
                organization_id=user.organization_id,
                client_id=client_id,
                created_by_id=user.id,
                period_month=period_month,
                kind=item.kind,
                status=STATUS_FAILED,
                phone=item.client.phone,
                error=error_text,
                batch_id=batch_id,
            )
            db.add(log)
            results.append(
                PaymentReminderSendItemResult(
                    client_id=client_id,
                    full_name=item.client.full_name,
                    kind=item.kind,
                    status=STATUS_FAILED,
                    error=error_text,
                )
            )

    db.commit()
    return PaymentRemindersSendResponse(
        period_month=period_month,
        batch_id=batch_id,
        sent=sent,
        failed=failed,
        skipped=skipped,
        items=results,
    )
