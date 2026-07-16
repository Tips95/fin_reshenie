import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, ForeignKey, Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPrimaryKeyMixin


class PricingTier(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "pricing_tiers"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    min_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    max_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    total_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    first_month_payment: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    second_month_payment: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    remaining_months_count: Mapped[int] = mapped_column(Integer, nullable=False)
    remaining_month_payment: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    total_months: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)

    organization: Mapped["Organization"] = relationship(back_populates="pricing_tiers")
    installment_plans: Mapped[list["InstallmentPlan"]] = relationship(back_populates="pricing_tier")
