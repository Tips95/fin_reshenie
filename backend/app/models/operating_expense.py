import uuid
from decimal import Decimal

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import ExpenseCategory, ExpenseGroup


class OperatingExpense(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "operating_expenses"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[ExpenseCategory] = mapped_column(
        Enum(
            ExpenseCategory,
            name="expensecategory",
            values_callable=lambda enum: [item.value for item in enum],
            create_type=False,
        ),
        nullable=False,
    )
    expense_group: Mapped[ExpenseGroup] = mapped_column(
        Enum(
            ExpenseGroup,
            name="expensegroup",
            native_enum=False,
            values_callable=lambda enum: [item.value for item in enum],
        ),
        nullable=False,
        default=ExpenseGroup.PRODUCTION,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    pay_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    organization: Mapped["Organization"] = relationship(back_populates="operating_expenses")
    payments: Mapped[list["ExpensePayment"]] = relationship(back_populates="expense")
