import uuid
from datetime import date

from sqlalchemy import Date, Enum, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin
from app.models.enums import RetailOverdueStatus


class RetailOverdueLog(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    __tablename__ = "retail_overdue_logs"

    retail_contract_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("retail_contracts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    action_date: Mapped[date] = mapped_column(Date, nullable=False)
    comment: Mapped[str] = mapped_column(Text, nullable=False)
    promised_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[RetailOverdueStatus] = mapped_column(
        Enum(
            RetailOverdueStatus,
            name="retail_overdue_status",
            native_enum=False,
            values_callable=lambda enum: [item.value for item in enum],
        ),
        nullable=False,
        default=RetailOverdueStatus.IN_PROGRESS,
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    contract: Mapped["RetailContract"] = relationship(back_populates="overdue_logs")
    created_by: Mapped["User"] = relationship()
