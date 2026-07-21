import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Numeric, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import MandatoryPaymentStatus, MandatoryPaymentType

DEPOSIT_AMOUNT = Decimal("25000.00")


class ClientMandatoryPayment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "client_mandatory_payments"
    __table_args__ = (
        UniqueConstraint("client_id", "payment_type", name="uq_client_mandatory_payment_type"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    payment_type: Mapped[MandatoryPaymentType] = mapped_column(
        Enum(
            MandatoryPaymentType,
            name="mandatorypaymenttype",
            values_callable=lambda enum: [item.value for item in enum],
            create_type=False,
        ),
        nullable=False,
    )
    planned_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    paid_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[MandatoryPaymentStatus] = mapped_column(
        Enum(
            MandatoryPaymentStatus,
            name="mandatorypaymentstatus",
            values_callable=lambda enum: [item.value for item in enum],
            create_type=False,
        ),
        nullable=False,
        default=MandatoryPaymentStatus.PENDING,
    )
    is_applicable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    client: Mapped["Client"] = relationship(back_populates="mandatory_payments")
    payment_records: Mapped[list["ClientMandatoryPaymentRecord"]] = relationship(
        back_populates="mandatory_payment",
        cascade="all, delete-orphan",
    )
