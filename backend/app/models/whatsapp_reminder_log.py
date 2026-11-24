import uuid

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin


class WhatsappReminderLog(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """Журнал массовых WhatsApp-напоминаний о платежах."""

    __tablename__ = "whatsapp_reminder_logs"
    __table_args__ = (
        Index("ix_wa_reminder_logs_org_month", "organization_id", "period_month"),
        Index("ix_wa_reminder_logs_client_month", "client_id", "period_month"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    period_month: Mapped[str] = mapped_column(String(7), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    id_message: Mapped[str | None] = mapped_column(String(128), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    batch_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True, index=True)
