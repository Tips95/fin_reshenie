import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class CashBalance(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Остаток кассы («кубышка») на начало месяца — задаётся руководителем вручную.

    Хранится по месяцам, а не выводится из истории: плановые расходы берутся по
    текущему активному списку, поэтому пересчёт задним числом менял бы уже
    зафиксированные остатки при каждой правке статей.
    """

    __tablename__ = "cash_balances"
    __table_args__ = (
        UniqueConstraint("organization_id", "period_month", name="uq_cash_balances_org_month"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    period_month: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    opening_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    organization: Mapped["Organization"] = relationship()
    editor: Mapped["User | None"] = relationship()
