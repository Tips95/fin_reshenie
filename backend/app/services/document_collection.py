from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.document_collection import (
    DOCUMENT_COLLECTION_FEE,
    DOCUMENT_COLLECTION_MANAGER_COMMISSION,
    DOCUMENT_COLLECTION_NOTARY_FEE,
    DOCUMENT_COLLECTION_TOTAL,
    DocumentCollection,
)
from app.models.enums import DocumentCollectionStatus, EngagementStage, ProcedureStage, UserRole
from app.models.installment_plan import InstallmentPlan
from app.models.user import User
from app.schemas.document_collection import (
    DocumentCollectionResponse,
    ManagerCommissionItem,
    ManagerCommissionsOverview,
)
from app.services.mandatory_payments import create_default_mandatory_payments


def create_document_collection(db: Session, client_id: UUID) -> DocumentCollection:
    item = DocumentCollection(
        client_id=client_id,
        total_amount=DOCUMENT_COLLECTION_TOTAL,
        collection_fee=DOCUMENT_COLLECTION_FEE,
        notary_fee=DOCUMENT_COLLECTION_NOTARY_FEE,
        manager_commission=DOCUMENT_COLLECTION_MANAGER_COMMISSION,
        status=DocumentCollectionStatus.PENDING,
    )
    db.add(item)
    db.flush()
    return item


def get_document_collection(db: Session, client_id: UUID) -> DocumentCollection | None:
    return db.scalar(select(DocumentCollection).where(DocumentCollection.client_id == client_id))


def ensure_document_collection(db: Session, client: Client) -> DocumentCollection:
    item = get_document_collection(db, client.id)
    if item is None:
        if client.engagement_stage != EngagementStage.DOCUMENT_COLLECTION:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Сбор документов для клиента не найден",
            )
        item = create_document_collection(db, client.id)
    return item


def update_document_collection_amounts(
    db: Session,
    client: Client,
    *,
    collection_fee: Decimal,
    notary_fee: Decimal,
    manager_commission: Decimal,
) -> DocumentCollection:
    if client.engagement_stage != EngagementStage.DOCUMENT_COLLECTION:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Суммы сбора можно менять только на этапе сбора документов",
        )

    item = ensure_document_collection(db, client)
    if item.status != DocumentCollectionStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Суммы сбора можно менять только до фиксации оплаты",
        )

    total = collection_fee + notary_fee + manager_commission
    if total <= Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Сумма сбора должна быть больше нуля",
        )

    item.collection_fee = collection_fee
    item.notary_fee = notary_fee
    item.manager_commission = manager_commission
    item.total_amount = total
    return item


def record_document_collection_payment(
    db: Session,
    client: Client,
    *,
    payment_date: date,
) -> DocumentCollection:
    if client.engagement_stage != EngagementStage.DOCUMENT_COLLECTION:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Клиент уже переведён на банкротство",
        )

    item = ensure_document_collection(db, client)
    if item.status == DocumentCollectionStatus.PAID:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Оплата сбора документов уже зафиксирована",
        )

    item.status = DocumentCollectionStatus.PAID
    item.paid_date = payment_date
    return item


def convert_client_to_bankruptcy(
    db: Session,
    client: Client,
    *,
    debt_amount: Decimal,
    contract_date: date | None,
) -> Client:
    if client.engagement_stage != EngagementStage.DOCUMENT_COLLECTION:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Клиент уже на этапе банкротства",
        )

    item = ensure_document_collection(db, client)
    if item.status != DocumentCollectionStatus.PAID:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Сначала зафиксируйте оплату сбора документов",
        )

    existing_plan = db.scalar(
        select(InstallmentPlan).where(InstallmentPlan.client_id == client.id).limit(1)
    )
    if existing_plan is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="У клиента уже есть график рассрочки",
        )

    client.debt_amount = debt_amount
    client.contract_date = contract_date or date.today()
    client.engagement_stage = EngagementStage.BANKRUPTCY
    client.procedure_stage = ProcedureStage.CONTRACT_SIGNED

    db.add_all(create_default_mandatory_payments(client.id))
    return client


def get_manager_commissions_overview(
    db: Session,
    user: User,
    *,
    months: int = 6,
) -> ManagerCommissionsOverview:
    today = date.today()
    period_start = date(today.year, today.month, 1)
    for _ in range(months - 1):
        if period_start.month == 1:
            period_start = date(period_start.year - 1, 12, 1)
        else:
            period_start = date(period_start.year, period_start.month - 1, 1)

    stmt = (
        select(DocumentCollection, Client)
        .join(Client, Client.id == DocumentCollection.client_id)
        .where(
            DocumentCollection.status == DocumentCollectionStatus.PAID,
            DocumentCollection.paid_date.is_not(None),
            DocumentCollection.paid_date >= period_start,
            Client.is_deleted.is_(False),
            Client.organization_id == user.organization_id,
        )
        .order_by(DocumentCollection.paid_date.desc())
    )
    if user.role == UserRole.MANAGER:
        stmt = stmt.where(Client.assigned_manager_id == user.id)

    rows = list(db.execute(stmt))
    items: list[ManagerCommissionItem] = []
    total = Decimal("0.00")

    for collection, client in rows:
        manager = client.assigned_manager
        commission = collection.manager_commission
        total += commission
        items.append(
            ManagerCommissionItem(
                manager_id=client.assigned_manager_id,
                manager_name=manager.full_name if manager else "Не назначен",
                client_id=client.id,
                client_name=client.full_name,
                commission_amount=commission,
                paid_date=collection.paid_date,
                document_collection_id=collection.id,
            )
        )

    return ManagerCommissionsOverview(
        total_commission=total,
        paid_count=len(items),
        items=items,
    )


def to_document_collection_response(item: DocumentCollection) -> DocumentCollectionResponse:
    return DocumentCollectionResponse.model_validate(item)
