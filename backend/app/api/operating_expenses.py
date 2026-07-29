from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_owner
from app.core.database import get_db
from app.models.enums import AuditAction, ExpenseCategory, ExpenseGroup
from app.models.expense_payment import ExpensePayment
from app.models.operating_expense import OperatingExpense
from app.models.user import User
from app.schemas.expense_payment import (
    ExpensePaymentCreate,
    ExpensePaymentListResponse,
    ExpensePaymentResponse,
    ExpensePaymentUpdate,
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
