from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_owner
from app.core.database import get_db
from app.models.enums import AuditAction, ExpenseCategory, ExpenseGroup
from app.models.expense_payment import ExpensePayment
from app.models.one_time_expense import OneTimeExpense
from app.models.operating_expense import OperatingExpense
from app.models.user import User
from app.schemas.expense_payment import (
    ExpensePaymentCreate,
    ExpensePaymentListResponse,
    ExpensePaymentResponse,
    ExpensePaymentUpdate,
)
from app.schemas.one_time_expense import (
    OneTimeExpenseCreate,
    OneTimeExpenseListResponse,
    OneTimeExpenseResponse,
    OneTimeExpenseUpdate,
)
from app.schemas.operating_expense import (
    OperatingExpenseCreate,
    OperatingExpenseResponse,
    OperatingExpenseUpdate,
)
from app.services.audit import log_audit
from app.services.phone import month_bounds

router = APIRouter()


def get_organization_expense(
    db: Session,
    *,
    expense_id: UUID,
    organization_id: UUID,
) -> OperatingExpense:
    expense = db.get(OperatingExpense, expense_id)
    if expense is None or expense.organization_id != organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Расход не найден")
    return expense


def get_organization_payment(
    db: Session,
    *,
    payment_id: UUID,
    organization_id: UUID,
) -> ExpensePayment:
    stmt = (
        select(ExpensePayment)
        .join(OperatingExpense, OperatingExpense.id == ExpensePayment.expense_id)
        .where(
            ExpensePayment.id == payment_id,
            OperatingExpense.organization_id == organization_id,
        )
    )
    payment = db.scalar(stmt)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Выплата не найдена")
    return payment


def _default_expense_group(category: ExpenseCategory) -> ExpenseGroup:
    if category == ExpenseCategory.SALARY:
        return ExpenseGroup.SALARY_PROJECT
    return ExpenseGroup.PRODUCTION


def get_organization_one_time_expense(
    db: Session,
    *,
    expense_id: UUID,
    organization_id: UUID,
) -> OneTimeExpense:
    expense = db.get(OneTimeExpense, expense_id)
    if expense is None or expense.organization_id != organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Разовый расход не найден")
    return expense


def _normalize_period_month(value: date) -> date:
    return value.replace(day=1)


@router.get("", response_model=list[OperatingExpenseResponse])
def list_operating_expenses(
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> list[OperatingExpense]:
    stmt = (
        select(OperatingExpense)
        .where(OperatingExpense.organization_id == current_user.organization_id)
        .order_by(OperatingExpense.sort_order, OperatingExpense.name)
    )
    return list(db.scalars(stmt))


@router.post("", response_model=OperatingExpenseResponse, status_code=status.HTTP_201_CREATED)
def create_operating_expense(
    payload: OperatingExpenseCreate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> OperatingExpense:
    data = payload.model_dump()
    data["expense_group"] = _default_expense_group(payload.category)
    expense = OperatingExpense(
        organization_id=current_user.organization_id,
        **data,
    )
    db.add(expense)
    db.flush()

    log_audit(
        db,
        user=current_user,
        entity_type="operating_expense",
        entity_id=expense.id,
        action=AuditAction.CREATE,
    )
    db.commit()
    db.refresh(expense)
    return expense


@router.get("/payments", response_model=list[ExpensePaymentListResponse])
def list_expense_payments(
    period_month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    expense_group: ExpenseGroup | None = Query(default=None),
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> list[ExpensePaymentListResponse]:
    stmt = (
        select(
            ExpensePayment,
            OperatingExpense.name,
            OperatingExpense.expense_group,
            User.full_name,
        )
        .join(OperatingExpense, OperatingExpense.id == ExpensePayment.expense_id)
        .join(User, User.id == ExpensePayment.created_by)
        .where(OperatingExpense.organization_id == current_user.organization_id)
        .order_by(ExpensePayment.period_month.desc(), ExpensePayment.payment_date.desc())
    )
    if period_month:
        start, end = month_bounds(period_month)
        stmt = stmt.where(ExpensePayment.period_month >= start, ExpensePayment.period_month <= end)
    if expense_group:
        stmt = stmt.where(OperatingExpense.expense_group == expense_group)

    rows = db.execute(stmt).all()
    return [
        ExpensePaymentListResponse(
            id=payment.id,
            expense_id=payment.expense_id,
            amount=payment.amount,
            payment_date=payment.payment_date,
            period_month=payment.period_month,
            comment=payment.comment,
            created_by=payment.created_by,
            created_at=payment.created_at,
            expense_name=expense_name,
            expense_group=expense_group_value,
            created_by_name=created_by_name,
        )
        for payment, expense_name, expense_group_value, created_by_name in rows
    ]


@router.post(
    "/{expense_id}/payments",
    response_model=ExpensePaymentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_expense_payment(
    expense_id: UUID,
    payload: ExpensePaymentCreate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> ExpensePayment:
    expense = get_organization_expense(
        db, expense_id=expense_id, organization_id=current_user.organization_id
    )
    payment = ExpensePayment(
        expense_id=expense.id,
        amount=payload.amount,
        payment_date=payload.payment_date,
        period_month=payload.period_month,
        comment=payload.comment,
        created_by=current_user.id,
    )
    db.add(payment)
    db.flush()
    log_audit(
        db,
        user=current_user,
        entity_type="expense_payment",
        entity_id=payment.id,
        action=AuditAction.CREATE,
    )
    db.commit()
    db.refresh(payment)
    return payment


@router.patch("/payments/{payment_id}", response_model=ExpensePaymentResponse)
def update_expense_payment(
    payment_id: UUID,
    payload: ExpensePaymentUpdate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> ExpensePayment:
    payment = get_organization_payment(
        db, payment_id=payment_id, organization_id=current_user.organization_id
    )
    updates = payload.model_dump(exclude_unset=True)

    for field, value in updates.items():
        old_value = getattr(payment, field)
        if old_value != value:
            log_audit(
                db,
                user=current_user,
                entity_type="expense_payment",
                entity_id=payment.id,
                action=AuditAction.UPDATE,
                field_name=field,
                old_value=old_value,
                new_value=value,
            )
            setattr(payment, field, value)

    db.commit()
    db.refresh(payment)
    return payment


@router.patch("/{expense_id}", response_model=OperatingExpenseResponse)
def update_operating_expense(
    expense_id: UUID,
    payload: OperatingExpenseUpdate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> OperatingExpense:
    expense = get_organization_expense(
        db, expense_id=expense_id, organization_id=current_user.organization_id
    )
    updates = payload.model_dump(exclude_unset=True)

    for field, value in updates.items():
        old_value = getattr(expense, field)
        if old_value != value:
            log_audit(
                db,
                user=current_user,
                entity_type="operating_expense",
                entity_id=expense.id,
                action=AuditAction.UPDATE,
                field_name=field,
                old_value=old_value,
                new_value=value,
            )
            setattr(expense, field, value)

    db.commit()
    db.refresh(expense)
    return expense


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_operating_expense(
    expense_id: UUID,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> None:
    expense = get_organization_expense(
        db, expense_id=expense_id, organization_id=current_user.organization_id
    )
    expense.is_active = False

    log_audit(
        db,
        user=current_user,
        entity_type="operating_expense",
        entity_id=expense.id,
        action=AuditAction.DELETE,
        field_name="is_active",
        old_value=True,
        new_value=False,
    )
    db.commit()


@router.get("/one-time", response_model=list[OneTimeExpenseListResponse])
def list_one_time_expenses(
    period_month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> list[OneTimeExpenseListResponse]:
    stmt = (
        select(OneTimeExpense, User.full_name)
        .join(User, User.id == OneTimeExpense.created_by)
        .where(OneTimeExpense.organization_id == current_user.organization_id)
        .order_by(OneTimeExpense.period_month.desc(), OneTimeExpense.expense_date.desc())
    )
    if period_month:
        start, end = month_bounds(period_month)
        stmt = stmt.where(
            OneTimeExpense.period_month >= start,
            OneTimeExpense.period_month <= end,
        )

    rows = db.execute(stmt).all()
    return [
        OneTimeExpenseListResponse(
            id=expense.id,
            name=expense.name,
            amount=expense.amount,
            period_month=expense.period_month,
            expense_date=expense.expense_date,
            comment=expense.comment,
            created_by=expense.created_by,
            created_at=expense.created_at,
            created_by_name=created_by_name,
        )
        for expense, created_by_name in rows
    ]


@router.post(
    "/one-time",
    response_model=OneTimeExpenseResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_one_time_expense(
    payload: OneTimeExpenseCreate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> OneTimeExpense:
    expense = OneTimeExpense(
        organization_id=current_user.organization_id,
        name=payload.name.strip(),
        amount=payload.amount,
        period_month=_normalize_period_month(payload.period_month),
        expense_date=payload.expense_date or date.today(),
        comment=payload.comment,
        created_by=current_user.id,
    )
    db.add(expense)
    db.flush()
    log_audit(
        db,
        user=current_user,
        entity_type="one_time_expense",
        entity_id=expense.id,
        action=AuditAction.CREATE,
    )
    db.commit()
    db.refresh(expense)
    return expense


@router.patch("/one-time/{expense_id}", response_model=OneTimeExpenseResponse)
def update_one_time_expense(
    expense_id: UUID,
    payload: OneTimeExpenseUpdate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> OneTimeExpense:
    expense = get_organization_one_time_expense(
        db, expense_id=expense_id, organization_id=current_user.organization_id
    )
    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates and updates["name"] is not None:
        updates["name"] = updates["name"].strip()
    if "period_month" in updates and updates["period_month"] is not None:
        updates["period_month"] = _normalize_period_month(updates["period_month"])

    for field, value in updates.items():
        old_value = getattr(expense, field)
        if old_value != value:
            log_audit(
                db,
                user=current_user,
                entity_type="one_time_expense",
                entity_id=expense.id,
                action=AuditAction.UPDATE,
                field_name=field,
                old_value=old_value,
                new_value=value,
            )
            setattr(expense, field, value)

    db.commit()
    db.refresh(expense)
    return expense


@router.delete("/one-time/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_one_time_expense(
    expense_id: UUID,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> None:
    expense = get_organization_one_time_expense(
        db, expense_id=expense_id, organization_id=current_user.organization_id
    )
    log_audit(
        db,
        user=current_user,
        entity_type="one_time_expense",
        entity_id=expense.id,
        action=AuditAction.DELETE,
    )
    db.delete(expense)
    db.commit()
