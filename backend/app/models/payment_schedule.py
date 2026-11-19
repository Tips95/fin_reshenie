import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPrimaryKeyMixin
from app.models.collection_event import collection_call_result_sa
from app.models.enums import CollectionCallResult, PaymentScheduleStatus


class PaymentSchedule(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "payment_schedule"

    installment_plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("installment_plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    month_number: Mapped[int] = mapped_column(Integer, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
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
    deferred_until: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    deferral_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    manager_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    overdue_waived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_call_result: Mapped[CollectionCallResult | None] = mapped_column(
        collection_call_result_sa,
        nullable=True,
    )
    last_call_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    promised_pay_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    promised_notified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    installment_plan: Mapped["InstallmentPlan"] = relationship(back_populates="payment_schedules")
    payments: Mapped[list["Payment"]] = relationship(back_populates="payment_schedule")
    collection_events: Mapped[list["CollectionEvent"]] = relationship(
        back_populates="payment_schedule",
        order_by="CollectionEvent.created_at.desc()",
    )
