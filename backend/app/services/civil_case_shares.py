"""Доли по гражданским делам: 40% себе или 20% + 20% исполнителю."""

from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.civil_case import CivilCase
from app.models.enums import AuditAction
from app.models.user import User
from app.schemas.civil_shares import (
    CivilShareBulkUpdate,
    CivilShareLine,
    CivilSharePayeeRow,
    CivilSharesOverview,
    ShareRole,
)
from app.services.audit import log_audit
from app.services.phone import month_bounds

MANAGER_RATE = Decimal("0.20")
SELF_RATE = Decimal("0.40")


def _money(value: Decimal) -> Decimal:
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _same_person(case: CivilCase) -> bool:
    return (
        case.concluding_manager_id is not None
        and case.concluding_manager_id == case.assigned_executor_id
    )


def share_lines(case: CivilCase) -> list[CivilShareLine]:
    price = case.price or Decimal("0")
    if price <= 0:
        return []

    if _same_person(case):
        manager = case.concluding_manager
        return [
            CivilShareLine(
                case_id=case.id,
                client_name=case.full_name,
                appeal_date=case.appeal_date,
                price=price,
                role="both",
                share_label="40%",
                amount=_money(price * SELF_RATE),
                collected=bool(case.manager_share_paid),
            )
        ]

    lines: list[CivilShareLine] = []
    if case.concluding_manager_id is not None:
        lines.append(
            CivilShareLine(
                case_id=case.id,
                client_name=case.full_name,
                appeal_date=case.appeal_date,
                price=price,
                role="manager",
                share_label="20%",
                amount=_money(price * MANAGER_RATE),
                collected=bool(case.manager_share_paid),
            )
        )
    if case.assigned_executor_id is not None:
        lines.append(
            CivilShareLine(
                case_id=case.id,
                client_name=case.full_name,
                appeal_date=case.appeal_date,
                price=price,
                role="executor",
                share_label="20%",
                amount=_money(price * MANAGER_RATE),
                collected=bool(case.executor_share_paid),
            )
        )
    return lines


def _payee(case: CivilCase, role: ShareRole) -> tuple[UUID, str] | None:
    if role == "executor":
        user = case.executor
        user_id = case.assigned_executor_id
    else:
        user = case.concluding_manager
        user_id = case.concluding_manager_id
    if user_id is None:
        return None
    name = user.full_name if user is not None else "Сотрудник"
    return user_id, name


def _sum_lines(lines: list[CivilShareLine]) -> tuple[Decimal, Decimal, Decimal]:
    total = Decimal("0.00")
    paid = Decimal("0.00")
    for line in lines:
        total += line.amount
        if line.collected:
            paid += line.amount
    return total, total - paid, paid


def _group_payees(cases: list[CivilCase]) -> list[CivilSharePayeeRow]:
    grouped: dict[UUID, list[CivilShareLine]] = {}
    names: dict[UUID, str] = {}
    for case in cases:
        for line in share_lines(case):
            payee = _payee(case, line.role)
            if payee is None:
                continue
            payee_id, payee_name = payee
            names[payee_id] = payee_name
            grouped.setdefault(payee_id, []).append(line)

    rows: list[CivilSharePayeeRow] = []
    for payee_id, lines in grouped.items():
        lines.sort(key=lambda item: (item.appeal_date, item.client_name.casefold()), reverse=True)
        total, to_pay, paid = _sum_lines(lines)
        rows.append(
            CivilSharePayeeRow(
                payee_id=payee_id,
                payee_name=names.get(payee_id, "Сотрудник"),
                lines_count=len(lines),
                total_amount=total,
                to_pay_amount=to_pay,
                paid_amount=paid,
                lines=lines,
            )
        )
    rows.sort(key=lambda row: (-row.to_pay_amount, row.payee_name.casefold()))
    return rows


def _load_cases(
    db: Session,
    user: User,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[CivilCase]:
    stmt = (
        select(CivilCase)
        .options(
            joinedload(CivilCase.concluding_manager),
            joinedload(CivilCase.executor),
        )
        .where(CivilCase.organization_id == user.organization_id)
        .order_by(CivilCase.appeal_date.desc(), CivilCase.full_name.asc())
    )
    if date_from is not None:
        stmt = stmt.where(CivilCase.appeal_date >= date_from)
    if date_to is not None:
        stmt = stmt.where(CivilCase.appeal_date <= date_to)
    return list(db.scalars(stmt).unique())


def get_civil_shares_overview(db: Session, user: User, *, month: str) -> CivilSharesOverview:
    start, end = month_bounds(month)
    month_cases = _load_cases(db, user, date_from=start, date_to=end)
    all_cases = _load_cases(db, user)
    payees = _group_payees(month_cases)
    total, to_pay, paid = _sum_lines([line for row in payees for line in row.lines])
    outstanding_lines = [line for case in all_cases for line in share_lines(case) if not line.collected]
    outstanding = sum((line.amount for line in outstanding_lines), Decimal("0.00"))
    case_ids = {line.case_id for row in payees for line in row.lines}
    return CivilSharesOverview(
        month=month,
        cases_count=len(case_ids),
        total_amount=total,
        to_pay_amount=to_pay,
        paid_amount=paid,
        outstanding_to_pay_amount=outstanding,
        payees=payees,
    )


def apply_civil_share_collected(case: CivilCase, role: ShareRole, collected: bool) -> bool:
    same = _same_person(case)
    now = datetime.now(timezone.utc)
    if role == "both":
        if not same:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="40% отмечается, когда заключивший и исполнитель — один человек",
            )
        if case.manager_share_paid == collected and case.executor_share_paid == collected:
            return False
        case.manager_share_paid = collected
        case.executor_share_paid = collected
        case.manager_share_paid_at = now if collected else None
        case.executor_share_paid_at = now if collected else None
        return True

    if role == "manager":
        if case.concluding_manager_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="У дела нет менеджера, который его заключил",
            )
        if same:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Этот человек сделал дело сам — отмечайте долю 40%",
            )
        if case.manager_share_paid == collected:
            return False
        case.manager_share_paid = collected
        case.manager_share_paid_at = now if collected else None
        return True

    if case.assigned_executor_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Исполнитель не назначен",
        )
    if same:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Этот человек сделал дело сам — отмечайте долю 40%",
        )
    if case.executor_share_paid == collected:
        return False
    case.executor_share_paid = collected
    case.executor_share_paid_at = now if collected else None
    return True


def mark_civil_shares(db: Session, user: User, payload: CivilShareBulkUpdate) -> int:
    updated = 0
    for mark in payload.marks:
        case = db.scalar(
            select(CivilCase)
            .options(
                joinedload(CivilCase.concluding_manager),
                joinedload(CivilCase.executor),
            )
            .where(
                CivilCase.id == mark.case_id,
                CivilCase.organization_id == user.organization_id,
            )
        )
        if case is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Дело не найдено")
        if not apply_civil_share_collected(case, mark.role, payload.collected):
            continue
        log_audit(
            db,
            user=user,
            entity_type="civil_case",
            entity_id=case.id,
            action=AuditAction.UPDATE,
            field_name=f"share_{mark.role}",
            old_value=not payload.collected,
            new_value=payload.collected,
        )
        updated += 1
    db.commit()
    return updated
