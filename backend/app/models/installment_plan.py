import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin


class InstallmentPlan(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    __tablename__ = "installment_plans"

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    pricing_tier_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("pricing_tiers.id", ondelete="SET NULL"),
        nullable=True,
    )
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    total_months: Mapped[int] = mapped_column(Integer, nullable=False)

    client: Mapped["Client"] = relationship(back_populates="installment_plans")
    pricing_tier: Mapped["PricingTier | None"] = relationship(back_populates="installment_plans")
    payment_schedules: Mapped[list["PaymentSchedule"]] = relationship(
        back_populates="installment_plan",
        order_by="PaymentSchedule.month_number",
    )
