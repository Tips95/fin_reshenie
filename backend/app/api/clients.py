from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

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
    ClientCreate,
    ClientDetailResponse,
    ClientListResponse,
    ClientResponse,
    ClientUpdate,
    ManagerFirstCommissionUpdate,
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
from app.services.client_list import ClientSortField, CollectionViewFilter, SortDirection, paginate_clients, query_clients
from app.schemas.installment_plan import InstallmentPlanResponse
from app.schemas.payment import PaymentAlignResult, PaymentResponse
from app.schemas.payment_schedule import PaymentScheduleResponse
from app.services.installment_schedule import create_payment_schedule_models
from app.services.client_deletion import hard_delete_client
from app.services.client_duplicates import (
    INCOMPLETE_PHONE_MESSAGE,
    duplicate_client_payload,
    find_existing_client,
    phone_has_minimum_digits,
)
from app.services.funnel import try_ensure_first_payment_task_for_manager_client
from app.services.mandatory_payments import build_mandatory_payment_response, create_default_mandatory_payments
from app.services.document_collection import (
    create_document_collection,
    get_document_collection,
    to_document_collection_response,
)
from app.services.default_pricing_tiers import MIN_DEBT_AMOUNT
from app.services.payment_status import refresh_overdue_statuses
from app.services.payment_dates import realign_client_legacy_finances
from app.services.client_finances import get_client_contract_total
from app.services.client_month_stats import compute_due_month_stats

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
            .options(selectinload(ClientMandatoryPayment.payment_records))
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

    base = _to_client_response(
        client,
        db,
        document_collection=document_collection,
        document_collection_loaded=True,
    )
    return ClientDetailResponse(
        **base.model_dump(),
        installment_plan=installment_plan,
        payment_schedule=[
            PaymentScheduleResponse.model_validate(item) for item in payment_schedule
        ],
        matched_tier=matched_tier,
        payments=[PaymentResponse.model_validate(p) for p in payments],
        mandatory_payments=[
            build_mandatory_payment_response(item) for item in mandatory_payments
        ],
        document_collection=doc_collection_response,
    )


def _to_client_response(
    client: Client,
    db: Session,
    document_collection=None,
    *,
    document_collection_loaded: bool = False,
) -> ClientResponse:
    data = ClientResponse.model_validate(client)
    data.has_overdue = client_has_overdue_payments(db, client.id)
    if not document_collection_loaded:
        document_collection = get_document_collection(db, client.id)
    if document_collection is not None:
        data.document_collection_status = document_collection.status
        data.document_collection_paid_date = document_collection.paid_date
    data.contract_total = get_client_contract_total(db, client.id)
    if client.manager_first_commission_collected_by is not None:
        collector = db.get(User, client.manager_first_commission_collected_by)
        if collector is not None:
            data.manager_first_commission_collected_by_name = collector.full_name
    return data


def _apply_month_stats(
    response: ClientResponse,
    month_stats: dict,
) -> ClientResponse:
    stats = month_stats.get(response.id)
    if stats is None:
        return response
    response.month_planned = stats.planned_amount
    response.month_paid = stats.paid_amount
    response.month_remainder = stats.remainder
    response.payments_remaining = stats.payments_remaining
    return response


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


def _create_manual_installment_for_client(
    db: Session,
    *,
    client: Client,
    contract_total: Decimal | None = None,
) -> InstallmentPlan:
    total = contract_total if contract_total is not None else Decimal("0.00")
    plan = InstallmentPlan(
        client_id=client.id,
        pricing_tier_id=None,
        total_amount=total,
        start_date=client.contract_date,
        total_months=0,
    )
    db.add(plan)
    db.flush()
    return plan


@router.get("", response_model=ClientListResponse)
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
    collection_view: CollectionViewFilter | None = Query(default=None),
    sort_by: ClientSortField = Query(default=ClientSortField.CREATED_AT),
    sort_dir: SortDirection = Query(default=SortDirection.DESC),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> ClientListResponse:
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
        collection_view=collection_view,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    page_clients, total = paginate_clients(clients, page=page, page_size=page_size)
    total_pages = max(1, (total + page_size - 1) // page_size) if total else 1

    due_month_summary = None
    month_stats_by_client: dict = {}
    if due_month and current_user.role != UserRole.CALL_CENTER:
        due_month_summary, month_stats_by_client = compute_due_month_stats(
            db,
            [client.id for client in clients],
            due_month,
        )

    items = [
        _apply_month_stats(_to_client_response(client, db), month_stats_by_client)
        for client in page_clients
    ]

    return ClientListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        due_month_summary=due_month_summary,
    )


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

    if not phone_has_minimum_digits(payload.phone):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=INCOMPLETE_PHONE_MESSAGE,
        )

    existing = find_existing_client(
        db,
        organization_id=current_user.organization_id,
        phone=payload.phone,
        full_name=payload.full_name,
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=duplicate_client_payload(existing),
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
    try_ensure_first_payment_task_for_manager_client(
        db,
        client=client,
        actor=current_user,
    )
    return _to_client_response(client, db)


@router.get("/{client_id}/detail", response_model=ClientDetailResponse)
def get_client_detail(
    client_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> ClientDetailResponse:
    client = ensure_client_read_access(db, current_user, client_id)
    detail = _build_client_detail(db, client)
    if db.new or db.dirty or db.deleted:
        db.commit()
    return detail


@router.post(
    "/{client_id}/payments/align-schedule-dates",
    response_model=PaymentAlignResult,
)
def align_client_payment_dates_route(
    client_id: UUID,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> PaymentAlignResult:
    client = ensure_client_write_access(db, current_user, client_id)
    schedule_dates_updated, schedule_payments_updated, mandatory_updated = (
        realign_client_legacy_finances(db, client)
    )
    log_audit(
        db,
        user=current_user,
        entity_type="client",
        entity_id=client.id,
        action=AuditAction.UPDATE,
        field_name="payment_dates_aligned",
        new_value=(
            f"schedule_dates={schedule_dates_updated}, "
            f"payments={schedule_payments_updated}, mandatory={mandatory_updated}"
        ),
    )
    db.commit()
    return PaymentAlignResult(
        schedule_dates_updated=schedule_dates_updated,
        schedule_payments_updated=schedule_payments_updated,
        mandatory_records_updated=mandatory_updated,
    )


@router.get("/{client_id}")
def get_client(
    client_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> ClientResponse:
    client = ensure_client_read_access(db, current_user, client_id)
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

    owner_only_fields = {"full_name", "debt_amount", "procedure_stage"}
    if current_user.role != UserRole.OWNER:
        forbidden = owner_only_fields.intersection(updates.keys())
        if forbidden:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Изменение ФИО, суммы долга и этапа процедуры доступно только руководителю",
            )

    if "phone" in updates and updates["phone"] is not None:
        if not phone_has_minimum_digits(updates["phone"]):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=INCOMPLETE_PHONE_MESSAGE,
            )

    duplicate_phone = updates.get("phone", client.phone)
    duplicate_name = updates.get("full_name", client.full_name)
    if "phone" in updates or "full_name" in updates:
        existing = find_existing_client(
            db,
            organization_id=current_user.organization_id,
            phone=duplicate_phone,
            full_name=duplicate_name,
            exclude_client_id=client.id,
        )
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=duplicate_client_payload(existing),
            )

    if "assigned_manager_id" in updates:
        if current_user.role == UserRole.MANAGER:
            new_manager_id = updates["assigned_manager_id"]
            if new_manager_id != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Менеджер может только закрепить клиента за собой",
                )
            if (
                client.assigned_manager_id is not None
                and client.assigned_manager_id != current_user.id
            ):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Клиент уже закреплён за другим менеджером",
                )
        elif updates["assigned_manager_id"] is not None:
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

    if "contract_date" in updates:
        realign_client_legacy_finances(db, client)

    db.commit()
    db.refresh(client)
    return _to_client_response(client, db)


@router.patch("/{client_id}/manager-first-commission", response_model=ClientResponse)
def update_manager_first_commission(
    client_id: UUID,
    payload: ManagerFirstCommissionUpdate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> ClientResponse:
    client = get_organization_client(
        db,
        client_id=client_id,
        organization_id=current_user.organization_id,
    )
    if client.engagement_stage != EngagementStage.BANKRUPTCY:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Менеджерские 10 000 ₽ относятся только к клиентам на этапе банкротства",
        )

    plan = db.scalar(
        select(InstallmentPlan)
        .where(InstallmentPlan.client_id == client.id)
        .order_by(InstallmentPlan.created_at.desc())
    )
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="У клиента нет графика рассрочки",
        )

    first_month = db.scalar(
        select(PaymentSchedule)
        .where(
            PaymentSchedule.installment_plan_id == plan.id,
            PaymentSchedule.month_number == 1,
        )
        .limit(1)
    )
    if first_month is None or first_month.paid_amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Сначала зафиксируйте первый платёж клиента",
        )

    if payload.collected == client.manager_first_commission_collected:
        return _to_client_response(client, db)

    old_value = client.manager_first_commission_collected
    client.manager_first_commission_collected = payload.collected
    if payload.collected:
        client.manager_first_commission_collected_at = datetime.now(timezone.utc)
        client.manager_first_commission_collected_by = current_user.id
    else:
        client.manager_first_commission_collected_at = None
        client.manager_first_commission_collected_by = None

    log_audit(
        db,
        user=current_user,
        entity_type="client",
        entity_id=client.id,
        action=AuditAction.UPDATE,
        field_name="manager_first_commission_collected",
        old_value=old_value,
        new_value=payload.collected,
    )
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
