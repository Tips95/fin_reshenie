from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.document_collection import DocumentCollection
from app.models.enums import DocumentCollectionStatus, EngagementStage


@dataclass(frozen=True)
class DocumentCollectionTotals:
    collection_cash: Decimal
    notary_fee: Decimal
    manager_commission: Decimal
    paid_count: int

    @property
    def total(self) -> Decimal:
        return self.collection_cash + self.notary_fee + self.manager_commission


def _paid_collections_stmt(client_ids: list[UUID]):
    return select(DocumentCollection).where(
        DocumentCollection.client_id.in_(client_ids),
        DocumentCollection.status == DocumentCollectionStatus.PAID,
        DocumentCollection.paid_date.is_not(None),
    )


def get_document_collection_paid_totals(
    db: Session,
    client_ids: list[UUID],
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> DocumentCollectionTotals:
    if not client_ids:
        return DocumentCollectionTotals(
            collection_cash=Decimal("0.00"),
            notary_fee=Decimal("0.00"),
            manager_commission=Decimal("0.00"),
            paid_count=0,
        )

    stmt = _paid_collections_stmt(client_ids)
    if date_from is not None:
        stmt = stmt.where(DocumentCollection.paid_date >= date_from)
    if date_to is not None:
        stmt = stmt.where(DocumentCollection.paid_date <= date_to)

    rows = list(db.scalars(stmt))
    return DocumentCollectionTotals(
        collection_cash=sum((row.collection_fee for row in rows), Decimal("0.00")),
        notary_fee=sum((row.notary_fee for row in rows), Decimal("0.00")),
        manager_commission=sum((row.manager_commission for row in rows), Decimal("0.00")),
        paid_count=len(rows),
    )


def count_contracts_signed_in_period(
    db: Session,
    client_ids: list[UUID],
    *,
    date_from: date,
    date_to: date,
) -> int:
    if not client_ids:
        return 0

    return db.scalar(
        select(func.count())
        .select_from(Client)
        .where(
            Client.id.in_(client_ids),
            Client.engagement_stage == EngagementStage.BANKRUPTCY,
            Client.contract_date >= date_from,
            Client.contract_date <= date_to,
        )
    ) or 0
