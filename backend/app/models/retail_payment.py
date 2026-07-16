import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin
from app.models.enums import RetailPaymentType


class RetailPayment(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    __tablename__ = "retail_payments"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    retail_contract_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("retail_contracts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    payment_schedule_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("retail_payment_schedule.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    payment_type: Mapped[RetailPaymentType] = mapped_column(
        Enum(
            RetailPaymentType,
            name="retail_payment_type",
            native_enum=False,
            values_callable=lambda enum: [item.value for item in enum],
        ),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    contract: Mapped["RetailContract"] = relationship(back_populates="payments")
    payment_schedule: Mapped["RetailPaymentSchedule | None"] = relationship(back_populates="payments")
    created_by: Mapped["User"] = relationship()
