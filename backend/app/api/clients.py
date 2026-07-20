from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_owner, require_owner_or_manager
from app.core.database import get_db
from app.models.client import Client
from app.models.client_mandatory_payment import ClientMandatoryPayment
from app.models.enums import AuditAction, ClientStatus, EngagementStage, ProcedureStage, UserRole
from app.models.installment_plan import InstallmentPlan
from app.models.payment import Payment
from app.models.payment_schedule import PaymentSchedule
from app.models.pricing_tier import PricingTier
from app.models.user import User
from app.schemas.client import (
    ClientBriefResponse,
    ClientCreate,
    ClientDetailResponse,
    ClientResponse,
    ClientUpdate,
)
from app.services.access import (
    client_has_overdue_payments,
    ensure_client_read_access,
    ensure_client_write_access,
    find_pricing_tier,
    get_organization_client,
    get_organization_user,
    pricing_tier_not_found_message,
)
from app.services.audit import log_audit
from app.services.client_list import ClientSortField, SortDirection, query_clients
from app.schemas.installment_plan import InstallmentPlanResponse
from app.schemas.mandatory_payment import MandatoryPaymentResponse
from app.schemas.payment import PaymentResponse
from app.schemas.payment_schedule import PaymentScheduleResponse
from app.services.installment_schedule import create_payment_schedule_models
from app.services.client_deletion import hard_delete_client
from app.services.mandatory_payments import create_default_mandatory_payments
from app.services.document_collection import (
    create_document_collection,
    get_document_collection,
    to_document_collection_response,
)
from app.services.default_pricing_tiers import MIN_DEBT_AMOUNT
from app.services.payment_status import refresh_overdue_statuses

router = APIRouter()


def _build_client_detail(db: Session, client: Client) -> ClientDetailResponse:
    plan = db.scalar(
        select(InstallmentPlan)
        .where(InstallmentPlan.client_id == client.id)
        .order_by(InstallmentPlan.created_at.desc())
    )

    installment_plan = None
    payment_schedule: list[PaymentSchedule] = []
    matched_tier = None

    if plan is not None:
        refresh_overdue_statuses(db, plan.id)
        db.flush()

        installment_plan = InstallmentPlanResponse.model_validate(plan)
        payment_schedule = list(
            db.scalars(
                select(PaymentSchedule)
                .where(PaymentSchedule.installment_plan_id == plan.id)
                .order_by(PaymentSchedule.month_number)
            )
        )

        if plan.pricing_tier_id is not None:
            tier = db.get(PricingTier, plan.pricing_tier_id)
            if tier is not None:
                matched_tier = {
                    "id": tier.id,
                    "min_amount": tier.min_amount,
                    "max_amount": tier.max_amount,
                    "total_cost": tier.total_cost,
                    "total_months": tier.total_months,
                }

    payments = list(
        db.scalars(
            select(Payment)
            .where(Payment.client_id == client.id, Payment.is_deleted.is_(False))
            .order_by(Payment.payment_date.desc())
        )
    )

    mandatory_payments = list(
        db.scalars(
            select(ClientMandatoryPayment)
            .where(ClientMandatoryPayment.client_id == client.id)
            .order_by(ClientMandatoryPayment.payment_type)
        )
    )

    document_collection = get_document_collection(db, client.id)
    doc_collection_response = (
        to_document_collection_response(document_collection)
        if document_collection is not None
        else None
    )

    base = _to_client_response(client, db)
    return ClientDetailResponse(
        **base.model_dump(),
        installment_plan=installment_plan,
        payment_schedule=[
            PaymentScheduleResponse.model_validate(item) for item in payment_schedule
        ],
        matched_tier=matched_tier,
        payments=[PaymentResponse.model_validate(p) for p in payments],
        mandatory_payments=[
            MandatoryPaymentResponse.model_validate(item) for item in mandatory_payments
        ],
        document_collection=doc_collection_response,
    )


def _to_client_response(client: Client, db: Session) -> ClientResponse:
    data = ClientResponse.model_validate(client)
    data.has_overdue = client_has_overdue_payments(db, client.id)
    return data


def _create_installment_for_client(
    db: Session,
    *,
    client: Client,
    organization_id: UUID,
) -> InstallmentPlan:
    tier = find_pricing_tier(
        db,
        organization_id=organization_id,
        debt_amount=client.debt_amount,
        contract_date=client.contract_date,
    )
    if tier is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=pricing_tier_not_found_message(
                db,
                organization_id=organization_id,
                debt_amount=client.debt_amount,
                contract_date=client.contract_date,
            ),
        )

    plan = InstallmentPlan(
        client_id=client.id,
        pricing_tier_id=tier.id,
        total_amount=tier.total_cost,
        start_date=client.contract_date,
        total_months=tier.total_months,
    )
    db.add(plan)
    db.flush()

    schedules = create_payment_schedule_models(
        pricing_tier=tier,
        start_date=client.contract_date,
        installment_plan_id=plan.id,
    )
    db.add_all(schedules)
    return plan


@router.get("")
def list_clients(
    status_filter: ClientStatus | None = Query(default=None, alias="status"),
    procedure_stage: ProcedureStage | None = Query(default=None),
    engagement_stage: EngagementStage | None = Query(default=None),
    manager_id: UUID | None = Query(default=None),
    overdue: bool | None = Query(default=None),
    phone: str | None = Query(default=None, min_length=3),
    name: str | None = Query(default=None, min_length=2),
    contract_month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    due_month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    sort_by: ClientSortField = Query(default=ClientSortField.CREATED_AT),
    sort_dir: SortDirection = Query(default=SortDirection.DESC),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[ClientResponse] | list[ClientBriefResponse]:
    if manager_id is not None and current_user.role != UserRole.OWNER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Фильтр по менеджеру только для owner")

    clients = query_clients(
        db,
        current_user,
        status_filter=status_filter,
        procedure_stage=procedure_stage,
        engagement_stage=engagement_stage,
        manager_id=manager_id,
        overdue=overdue,
        phone=phone,
        name=name,
        contract_month=contract_month,
        due_month=due_month,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )

    if current_user.role == UserRole.CALL_CENTER:
        return [ClientBriefResponse.model_validate(client) for client in clients]

    return [_to_client_response(client, db) for client in clients]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_client(
    payload: ClientCreate,
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> ClientResponse:
    assigned_manager_id = payload.assigned_manager_id
    if current_user.role == UserRole.MANAGER:
        assigned_manager_id = current_user.id
    elif assigned_manager_id is not None:
        get_organization_user(
            db, user_id=assigned_manager_id, organization_id=current_user.organization_id
        )

    client = Client(
        organization_id=current_user.organization_id,
        assigned_manager_id=assigned_manager_id,
        full_name=payload.full_name,
        phone=payload.phone,
        contract_date=payload.contract_date,
        debt_amount=payload.debt_amount,
        status=payload.status,
        engagement_stage=payload.engagement_stage,
        procedure_stage=payload.procedure_stage,
    )
    db.add(client)
    db.flush()

    log_audit(
        db,
        user=current_user,
        entity_type="client",
        entity_id=client.id,
        action=AuditAction.CREATE,
    )

    try:
        if payload.engagement_stage == EngagementStage.DOCUMENT_COLLECTION:
            create_document_collection(db, client.id)
        if payload.engagement_stage == EngagementStage.BANKRUPTCY:
            db.add_all(create_default_mandatory_payments(client.id))
            if payload.create_installment_plan:
                if payload.debt_amount < MIN_DEBT_AMOUNT:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Для банкротства сумма долга от {MIN_DEBT_AMOUNT} ₽",
                    )
                _create_installment_for_client(
                    db, client=client, organization_id=current_user.organization_id
                )
        db.commit()
    except HTTPException:
        db.rollback()
        raise

    db.refresh(client)
    return _to_client_response(client, db)


@router.get("/{client_id}/detail", response_model=ClientDetailResponse)
def get_client_detail(
    client_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> ClientDetailResponse:
    if current_user.role == UserRole.CALL_CENTER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    client = ensure_client_read_access(db, current_user, client_id)
    detail = _build_client_detail(db, client)
    db.commit()
    return detail


@router.get("/{client_id}")
def get_client(
    client_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> ClientResponse | ClientBriefResponse:
    client = ensure_client_read_access(db, current_user, client_id)
    if current_user.role == UserRole.CALL_CENTER:
        return ClientBriefResponse.model_validate(client)
    return _to_client_response(client, db)


@router.patch("/{client_id}", response_model=ClientResponse)
def update_client(
    client_id: UUID,
    payload: ClientUpdate,
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> ClientResponse:
    client = ensure_client_write_access(db, current_user, client_id)
    updates = payload.model_dump(exclude_unset=True)

    owner_only_fields = {"full_name", "debt_amount"}
    if current_user.role != UserRole.OWNER:
        forbidden = owner_only_fields.intersection(updates.keys())
        if forbidden:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Изменение ФИО и суммы долга доступно только руководителю",
            )

    if "assigned_manager_id" in updates:
        if current_user.role != UserRole.OWNER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Назначение менеджера доступно только руководителю",
            )
        if updates["assigned_manager_id"] is not None:
            get_organization_user(
                db,
                user_id=updates["assigned_manager_id"],
                organization_id=current_user.organization_id,
            )

    for field, value in updates.items():
        old_value = getattr(client, field)
        if old_value != value:
            log_audit(
                db,
                user=current_user,
                entity_type="client",
                entity_id=client.id,
                action=AuditAction.UPDATE,
                field_name=field,
                old_value=old_value,
                new_value=value,
            )
            setattr(client, field, value)

    db.commit()
    db.refresh(client)
    return _to_client_response(client, db)


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(
    client_id: UUID,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> None:
    client = get_organization_client(
        db,
        client_id=client_id,
        organization_id=current_user.organization_id,
        include_deleted=True,
    )
    log_audit(
        db,
        user=current_user,
        entity_type="client",
        entity_id=client.id,
        action=AuditAction.DELETE,
        field_name="hard_delete",
        old_value=client.full_name,
    )
    hard_delete_client(db, client)
    db.commit()
