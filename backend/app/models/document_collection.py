import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, Enum, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import DocumentCollectionStatus

DOCUMENT_COLLECTION_TOTAL = Decimal("13000.00")
DOCUMENT_COLLECTION_FEE = Decimal("10000.00")
DOCUMENT_COLLECTION_NOTARY_FEE = Decimal("2000.00")
DOCUMENT_COLLECTION_MANAGER_COMMISSION = Decimal("1000.00")


class DocumentCollection(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "document_collections"

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=DOCUMENT_COLLECTION_TOTAL,
    )
    collection_fee: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=DOCUMENT_COLLECTION_FEE,
    )
    notary_fee: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=DOCUMENT_COLLECTION_NOTARY_FEE,
    )
    manager_commission: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=DOCUMENT_COLLECTION_MANAGER_COMMISSION,
    )
    status: Mapped[DocumentCollectionStatus] = mapped_column(
        Enum(
            DocumentCollectionStatus,
            name="document_collection_status",
            native_enum=False,
            values_callable=lambda enum: [item.value for item in enum],
        ),
        nullable=False,
        default=DocumentCollectionStatus.PENDING,
    )
    paid_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    client: Mapped["Client"] = relationship(back_populates="document_collection")
