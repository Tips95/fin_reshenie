import uuid
from datetime import date

from sqlalchemy import Date, Enum, ForeignKey, Index, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin
from app.models.enums import CollectionCallResult

# Общий VARCHAR-enum для графика и журнала (без native PG ENUM).
collection_call_result_sa = Enum(
    CollectionCallResult,
    name="collection_call_result",
    native_enum=False,
    values_callable=lambda enum_cls: [item.value for item in enum_cls],
)


class CollectionEvent(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """Журнал звонков и заметок коллектора по месяцу графика."""

    __tablename__ = "collection_events"
    __table_args__ = (
        Index("ix_collection_events_schedule_created", "payment_schedule_id", "created_at"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    payment_schedule_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("payment_schedule.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    result: Mapped[CollectionCallResult | None] = mapped_column(
        collection_call_result_sa,
        nullable=True,
    )
    promised_pay_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)

    author: Mapped["User | None"] = relationship(foreign_keys=[author_id])
    payment_schedule: Mapped["PaymentSchedule"] = relationship(
        back_populates="collection_events"
    )
