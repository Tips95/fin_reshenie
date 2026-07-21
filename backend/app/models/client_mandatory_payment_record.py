import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ClientMandatoryPaymentRecord(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "client_mandatory_payment_records"

    mandatory_payment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("client_mandatory_payments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)

    mandatory_payment: Mapped["ClientMandatoryPayment"] = relationship(
        back_populates="payment_records",
    )
