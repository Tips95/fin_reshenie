import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Integer, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPrimaryKeyMixin
from app.models.enums import PaymentScheduleStatus


class PaymentSchedule(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "payment_schedule"

    installment_plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("installment_plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    month_number: Mapped[int] = mapped_column(Integer, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    planned_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    paid_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=Decimal("0.00"),
    )
    paid_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[PaymentScheduleStatus] = mapped_column(
        Enum(PaymentScheduleStatus, name="payment_schedule_status", native_enum=False),
        nullable=False,
        default=PaymentScheduleStatus.PENDING,
    )
    deferred_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    deferral_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    overdue_waived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    installment_plan: Mapped["InstallmentPlan"] = relationship(back_populates="payment_schedules")
    payments: Mapped[list["Payment"]] = relationship(back_populates="payment_schedule")
