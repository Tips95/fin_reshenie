import uuid
from decimal import Decimal

from sqlalchemy import ForeignKey, Integer, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class RetailTermRate(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "retail_term_rates"
    __table_args__ = (
        UniqueConstraint("organization_id", "term_months", name="uq_retail_term_rates_org_months"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    term_months: Mapped[int] = mapped_column(Integer, nullable=False)
    markup_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    organization: Mapped["Organization"] = relationship(back_populates="retail_term_rates")
