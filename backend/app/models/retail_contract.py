import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import PaymentScheduleStatus, RetailContractStatus


class RetailContract(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "retail_contracts"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    retail_client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("retail_clients.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    investor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    product_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    term_months: Mapped[int] = mapped_column(Integer, nullable=False)
    markup_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    down_payment: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    financed_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    monthly_payment: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    contract_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[RetailContractStatus] = mapped_column(
        Enum(
            RetailContractStatus,
            name="retail_contract_status",
            native_enum=False,
            values_callable=lambda enum: [item.value for item in enum],
        ),
        nullable=False,
        default=RetailContractStatus.ACTIVE,
    )
    is_deleted: Mapped[bool] = mapped_column(default=False, nullable=False)

    organization: Mapped["Organization"] = relationship(back_populates="retail_contracts")
    client: Mapped["RetailClient"] = relationship(back_populates="contracts")
    investor: Mapped["User"] = relationship(foreign_keys=[investor_id])
    created_by: Mapped["User"] = relationship(foreign_keys=[created_by_id])
    payment_schedule: Mapped[list["RetailPaymentSchedule"]] = relationship(
        back_populates="contract",
        order_by="RetailPaymentSchedule.month_number",
    )
    payments: Mapped[list["RetailPayment"]] = relationship(back_populates="contract")
    overdue_logs: Mapped[list["RetailOverdueLog"]] = relationship(back_populates="contract")


class RetailPaymentSchedule(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "retail_payment_schedule"

    retail_contract_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("retail_contracts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    month_number: Mapped[int] = mapped_column(Integer, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    planned_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    paid_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[PaymentScheduleStatus] = mapped_column(
        Enum(
            PaymentScheduleStatus,
            name="retail_payment_schedule_status",
            native_enum=False,
            values_callable=lambda enum: [item.value for item in enum],
        ),
        nullable=False,
        default=PaymentScheduleStatus.PENDING,
    )

    contract: Mapped["RetailContract"] = relationship(back_populates="payment_schedule")
    payments: Mapped[list["RetailPayment"]] = relationship(back_populates="payment_schedule")
