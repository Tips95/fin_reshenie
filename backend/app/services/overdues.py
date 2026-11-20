"""Очередь просрочек, журнал звонков и уведомления по обещанной оплате."""

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.client import Client
from app.models.collection_event import CollectionEvent
from app.models.enums import AuditAction, ClientStatus, CollectionCallResult, UserRole
from app.models.installment_plan import InstallmentPlan
from app.models.payment_schedule import PaymentSchedule
from app.models.user import User
from app.schemas.overdue import (
    CollectionEventResponse,
    CollectionUpdate,
    OverdueQueueItem,
    OverdueQueueResponse,
)
from app.schemas.payment_schedule import PaymentScheduleResponse
from app.services.access import apply_client_visibility_filter, ensure_client_read_access
from app.services.audit import log_audit
from app.services.notifications import notify
from app.services.schedule_dates import (
    effective_due_date,
    is_schedule_overdue,
    schedule_overdue_days,
    schedule_remainder,
)

# Как в clients_overdue_map: отменённые и завершённые не входят в просрочку.
_INACTIVE_OVERDUE_STATUSES = {ClientStatus.CANCELLED, ClientStatus.COMPLETED}

OVERDUE_STAFF_ROLES = {
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.HEAD_MANAGER,
    UserRole.COLLECTOR,
}


def _aware_timestamp(value: datetime | None) -> float:
    """SQLite часто отдаёт naive datetime — нельзя сравнивать с aware."""
    if value is None:
        return float("-inf")
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.timestamp()


def _event_response(event: CollectionEvent) -> CollectionEventResponse:
    return CollectionEventResponse(
        id=event.id,
        client_id=event.client_id,
        payment_schedule_id=event.payment_schedule_id,
        author_id=event.author_id,
        author_name=event.author.full_name if event.author is not None else None,
        result=event.result,
        promised_pay_date=event.promised_pay_date,
        body=event.body,
        created_at=event.created_at,
    )


def schedule_to_response(
    schedule: PaymentSchedule,
    *,
    events: list[CollectionEvent] | None = None,
    events_limit: int = 5,
) -> PaymentScheduleResponse:
    source = events if events is not None else list(schedule.collection_events or [])
    recent = source[:events_limit]
    return PaymentScheduleResponse(
        id=schedule.id,
        installment_plan_id=schedule.installment_plan_id,
        month_number=schedule.month_number,
        due_date=schedule.due_date,
        planned_amount=schedule.planned_amount,
        paid_amount=schedule.paid_amount,
        paid_date=schedule.paid_date,
        status=schedule.status,
        deferred_until=schedule.deferred_until,
        deferral_comment=schedule.deferral_comment,
        manager_note=schedule.manager_note,
        overdue_waived=schedule.overdue_waived,
        last_call_result=schedule.last_call_result,
        last_call_at=schedule.last_call_at,
        promised_pay_date=schedule.promised_pay_date,
        collection_events=[_event_response(item) for item in recent],
    )


def clients_overdue_summaries(
    db: Session,
    client_ids: list[UUID],
    *,
    today: date | None = None,
) -> dict[UUID, dict]:
    """Сводка просрочки по клиентам: сумма, дни, обещание, звонок, заметка.

    Единый источник для /overdues, дашборда владельца и дашборда коллектора.
    """
    if not client_ids:
        return {}

    check_date = today or date.today()
    inactive_ids = {
        row_id
        for row_id, row_status in db.execute(
            select(Client.id, Client.status).where(Client.id.in_(client_ids))
        )
        if row_status in _INACTIVE_OVERDUE_STATUSES
    }

    schedules_by_client: dict[UUID, list[PaymentSchedule]] = {cid: [] for cid in client_ids}
    rows = db.execute(
        select(InstallmentPlan.client_id, PaymentSchedule)
        .join(PaymentSchedule, PaymentSchedule.installment_plan_id == InstallmentPlan.id)
        .where(InstallmentPlan.client_id.in_(client_ids))
    )
    for client_id, schedule in rows:
        schedules_by_client.setdefault(client_id, []).append(schedule)

    summaries: dict[UUID, dict] = {}
    for client_id, schedules in schedules_by_client.items():
        if client_id in inactive_ids:
            continue
        overdue_items = [item for item in schedules if is_schedule_overdue(item, check_date)]
        if not overdue_items:
            continue
        overdue_items.sort(key=lambda item: effective_due_date(item))
        oldest = overdue_items[0]
        amount = sum((schedule_remainder(item) for item in overdue_items), Decimal("0.00"))
        # Звонок — с самого свежего контакта; обещание — ближайшая дата среди просроченных.
        called = [item for item in overdue_items if item.last_call_at is not None]
        contact = (
            max(called, key=lambda item: _aware_timestamp(item.last_call_at))
            if called
            else oldest
        )
        promised_items = [item for item in overdue_items if item.promised_pay_date is not None]
        promised = (
            min(promised_items, key=lambda item: item.promised_pay_date or date.max)
            if promised_items
            else None
        )
        note_item = next(
            (item for item in reversed(overdue_items) if (item.manager_note or "").strip()),
            oldest,
        )
        summaries[client_id] = {
            "overdue_amount": amount,
            "overdue_days": schedule_overdue_days(oldest, check_date),
            "oldest_due_date": effective_due_date(oldest),
            "payment_schedule_id": oldest.id,
            "month_number": oldest.month_number,
            "manager_note": note_item.manager_note,
            "last_call_result": contact.last_call_result,
            "last_call_at": contact.last_call_at,
            "promised_pay_date": promised.promised_pay_date if promised is not None else None,
        }
    return summaries


def total_overdue_amount(summaries: dict[UUID, dict]) -> Decimal:
    return sum((item["overdue_amount"] for item in summaries.values()), Decimal("0.00"))


def list_overdue_queue(db: Session, user: User) -> OverdueQueueResponse:
    today = date.today()
    stmt = apply_client_visibility_filter(select(Client), user)
    clients = list(db.scalars(stmt).all())
    if not clients:
        return OverdueQueueResponse(
            items=[],
            total=0,
            total_overdue_amount=Decimal("0.00"),
        )

    summaries = clients_overdue_summaries(db, [client.id for client in clients], today=today)
    items: list[OverdueQueueItem] = []
    for client in clients:
        summary = summaries.get(client.id)
        if summary is None:
            continue
        items.append(
            OverdueQueueItem(
                client_id=client.id,
                full_name=client.full_name,
                phone=client.phone,
                status=client.status,
                overdue_amount=summary["overdue_amount"],
                overdue_days=summary["overdue_days"],
                oldest_due_date=summary["oldest_due_date"],
                payment_schedule_id=summary["payment_schedule_id"],
                month_number=summary["month_number"],
                manager_note=summary["manager_note"],
                last_call_result=summary["last_call_result"],
                last_call_at=summary["last_call_at"],
                promised_pay_date=summary["promised_pay_date"],
            )
        )

    items.sort(key=lambda item: (-item.overdue_days, item.full_name.lower()))
    return OverdueQueueResponse(
        items=items,
        total=len(items),
        total_overdue_amount=total_overdue_amount(summaries),
    )


def record_collection(
    db: Session,
    user: User,
    schedule_id: UUID,
    payload: CollectionUpdate,
) -> PaymentScheduleResponse:
    schedule = db.scalar(
        select(PaymentSchedule)
        .options(
            joinedload(PaymentSchedule.installment_plan),
            selectinload(PaymentSchedule.collection_events).joinedload(CollectionEvent.author),
        )
        .where(PaymentSchedule.id == schedule_id)
    )
    if schedule is None:
        raise HTTPException(status_code=404, detail="Платёж в графике не найден")

    client_id = schedule.installment_plan.client_id
    ensure_client_read_access(db, user, client_id)

    note_changed = False
    call_changed = False
    promise_changed = False
    event_body: str | None = None
    event_result: CollectionCallResult | None = None
    event_promise: date | None = None

    if payload.clear_manager_note:
        if schedule.manager_note:
            old_note = schedule.manager_note
            schedule.manager_note = None
            note_changed = True
            log_audit(
                db,
                user=user,
                entity_type="payment_schedule",
                entity_id=schedule.id,
                action=AuditAction.UPDATE,
                field_name="manager_note",
                old_value=old_note,
                new_value=None,
            )
    elif payload.manager_note is not None:
        normalized = payload.manager_note.strip() or None
        if normalized != schedule.manager_note:
            old_note = schedule.manager_note
            schedule.manager_note = normalized
            note_changed = True
            event_body = normalized
            log_audit(
                db,
                user=user,
                entity_type="payment_schedule",
                entity_id=schedule.id,
                action=AuditAction.UPDATE,
                field_name="manager_note",
                old_value=old_note,
                new_value=normalized,
            )

    if payload.call_result is not None:
        schedule.last_call_result = payload.call_result
        schedule.last_call_at = datetime.now(timezone.utc)
        call_changed = True
        event_result = payload.call_result
        log_audit(
            db,
            user=user,
            entity_type="payment_schedule",
            entity_id=schedule.id,
            action=AuditAction.UPDATE,
            field_name="last_call_result",
            old_value=None,
            new_value=payload.call_result.value,
        )

    if payload.clear_promised_pay_date:
        if schedule.promised_pay_date is not None:
            old_date = schedule.promised_pay_date
            schedule.promised_pay_date = None
            schedule.promised_notified_at = None
            promise_changed = True
            log_audit(
                db,
                user=user,
                entity_type="payment_schedule",
                entity_id=schedule.id,
                action=AuditAction.UPDATE,
                field_name="promised_pay_date",
                old_value=old_date,
                new_value=None,
            )
    elif payload.promised_pay_date is not None:
        if payload.promised_pay_date != schedule.promised_pay_date:
            old_date = schedule.promised_pay_date
            schedule.promised_pay_date = payload.promised_pay_date
            schedule.promised_notified_at = None
            promise_changed = True
            event_promise = payload.promised_pay_date
            log_audit(
                db,
                user=user,
                entity_type="payment_schedule",
                entity_id=schedule.id,
                action=AuditAction.UPDATE,
                field_name="promised_pay_date",
                old_value=old_date,
                new_value=payload.promised_pay_date,
            )

    if not (note_changed or call_changed or promise_changed):
        raise HTTPException(
            status_code=422,
            detail="Укажите заметку, результат звонка или дату обещанной оплаты",
        )

    if note_changed or call_changed or promise_changed:
        # При очистке заметки без нового текста всё равно фиксируем событие звонка/даты.
        if event_body is None and note_changed and schedule.manager_note:
            event_body = schedule.manager_note
        db.add(
            CollectionEvent(
                client_id=client_id,
                payment_schedule_id=schedule.id,
                author_id=user.id,
                result=event_result,
                promised_pay_date=event_promise,
                body=event_body,
            )
        )

    db.commit()
    db.refresh(schedule)
    schedule = db.scalar(
        select(PaymentSchedule)
        .options(selectinload(PaymentSchedule.collection_events).joinedload(CollectionEvent.author))
        .where(PaymentSchedule.id == schedule.id)
    )
    assert schedule is not None
    return schedule_to_response(schedule)


def _overdue_staff_ids(db: Session, organization_id: UUID) -> list[UUID]:
    return list(
        db.scalars(
            select(User.id).where(
                User.organization_id == organization_id,
                User.is_active.is_(True),
                User.deleted_at.is_(None),
                User.role.in_(OVERDUE_STAFF_ROLES),
            )
        ).all()
    )


def sync_promised_pay_notifications(
    db: Session,
    *,
    organization_id: UUID | None = None,
    today: date | None = None,
) -> int:
    """Создаёт уведомления на день обещанной оплаты (один раз на дату)."""
    check_date = today or date.today()
    stmt = (
        select(PaymentSchedule, InstallmentPlan.client_id, Client)
        .join(InstallmentPlan, InstallmentPlan.id == PaymentSchedule.installment_plan_id)
        .join(Client, Client.id == InstallmentPlan.client_id)
        .where(
            PaymentSchedule.promised_pay_date.is_not(None),
            PaymentSchedule.promised_pay_date <= check_date,
            PaymentSchedule.promised_notified_at.is_(None),
            Client.is_deleted.is_(False),
        )
    )
    if organization_id is not None:
        stmt = stmt.where(Client.organization_id == organization_id)

    created = 0
    rows = db.execute(stmt).all()
    for schedule, _client_id, client in rows:
        if schedule_remainder(schedule) <= Decimal("0.00"):
            continue
        recipients = _overdue_staff_ids(db, client.organization_id)
        if not recipients:
            continue
        amount = schedule_remainder(schedule)
        notify(
            db,
            recipient_ids=recipients,
            organization_id=client.organization_id,
            kind="promised_pay",
            title=f"Обещал оплатить сегодня · {client.full_name}",
            body=f"{client.phone} · остаток {amount} ₽ · месяц {schedule.month_number}",
            link=f"/clients/{client.id}?tab=payments",
        )
        schedule.promised_notified_at = datetime.now(timezone.utc)
        created += 1

    if created:
        db.commit()
    return created
