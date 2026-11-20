from datetime import date, datetime, time, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_active_user, require_owner
from app.core.database import get_db
from app.models.audit_log import AuditLog
from app.models.installment_plan import InstallmentPlan
from app.models.payment_schedule import PaymentSchedule
from app.models.user import User
from app.schemas.audit_log import AuditLogResponse
from app.services.access import ensure_client_read_access

router = APIRouter()


def _to_response(
    entry: AuditLog,
    *,
    entity_label: str | None = None,
) -> AuditLogResponse:
    data = AuditLogResponse.model_validate(entry)
    if entry.changed_by_user is not None:
        data.changed_by_name = entry.changed_by_user.full_name
    data.entity_label = entity_label
    return data


def _schedule_month_map(db: Session, schedule_ids: list[UUID]) -> dict[UUID, int]:
    if not schedule_ids:
        return {}
    return {
        row_id: month_number
        for row_id, month_number in db.execute(
            select(PaymentSchedule.id, PaymentSchedule.month_number).where(
                PaymentSchedule.id.in_(schedule_ids)
            )
        )
    }


def _entity_label(
    entry: AuditLog,
    *,
    schedule_months: dict[UUID, int],
) -> str | None:
    if entry.entity_type == "client":
        return "Карточка клиента"
    if entry.entity_type == "installment_plan":
        return "Договор / рассрочка"
    if entry.entity_type == "payment_schedule":
        month = schedule_months.get(entry.entity_id)
        return f"График · месяц {month}" if month is not None else "График платежей"
    if entry.entity_type == "payment":
        return "Платёж"
    return None


def _enrich_entries(db: Session, entries: list[AuditLog]) -> list[AuditLogResponse]:
    schedule_ids = [entry.entity_id for entry in entries if entry.entity_type == "payment_schedule"]
    schedule_months = _schedule_month_map(db, schedule_ids)
    return [
        _to_response(
            entry,
            entity_label=_entity_label(entry, schedule_months=schedule_months),
        )
        for entry in entries
    ]


@router.get("", response_model=list[AuditLogResponse])
def list_audit_logs(
    entity_type: str | None = Query(default=None),
    entity_id: UUID | None = Query(default=None),
    client_id: UUID | None = Query(
        default=None,
        description="Карточка + график + договор этого клиента",
    ),
    changed_by: UUID | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[AuditLogResponse]:
    stmt = (
        select(AuditLog)
        .options(joinedload(AuditLog.changed_by_user))
        .where(AuditLog.organization_id == current_user.organization_id)
        .order_by(AuditLog.changed_at.desc())
        .limit(limit)
    )

    if client_id is not None:
        ensure_client_read_access(db, current_user, client_id)
        schedule_ids = list(
            db.scalars(
                select(PaymentSchedule.id)
                .join(InstallmentPlan, InstallmentPlan.id == PaymentSchedule.installment_plan_id)
                .where(InstallmentPlan.client_id == client_id)
            )
        )
        plan_ids = list(
            db.scalars(select(InstallmentPlan.id).where(InstallmentPlan.client_id == client_id))
        )
        scopes = [
            and_(AuditLog.entity_type == "client", AuditLog.entity_id == client_id),
        ]
        if schedule_ids:
            scopes.append(
                and_(
                    AuditLog.entity_type == "payment_schedule",
                    AuditLog.entity_id.in_(schedule_ids),
                )
            )
        if plan_ids:
            scopes.append(
                and_(
                    AuditLog.entity_type == "installment_plan",
                    AuditLog.entity_id.in_(plan_ids),
                )
            )
        stmt = stmt.where(or_(*scopes))
    else:
        if entity_type:
            stmt = stmt.where(AuditLog.entity_type == entity_type)
        if entity_id:
            stmt = stmt.where(AuditLog.entity_id == entity_id)

    if changed_by:
        stmt = stmt.where(AuditLog.changed_by == changed_by)
    if date_from:
        start = datetime.combine(date_from, time.min, tzinfo=timezone.utc)
        stmt = stmt.where(AuditLog.changed_at >= start)
    if date_to:
        end = datetime.combine(date_to, time.max, tzinfo=timezone.utc)
        stmt = stmt.where(AuditLog.changed_at <= end)

    entries = list(db.scalars(stmt).unique())
    return _enrich_entries(db, entries)


@router.get("/recent", response_model=list[AuditLogResponse])
def list_recent_audit_logs(
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> list[AuditLogResponse]:
    stmt = (
        select(AuditLog)
        .options(joinedload(AuditLog.changed_by_user))
        .where(AuditLog.organization_id == current_user.organization_id)
        .order_by(AuditLog.changed_at.desc())
        .limit(limit)
    )
    entries = list(db.scalars(stmt).unique())
    return _enrich_entries(db, entries)
