import uuid

from sqlalchemy import ForeignKey, Index, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin


class AgentMessage(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """Чат удалённых менеджеров: личная переписка агента с кураторами (`agent_id` — чей тред)
    или общая лента вопросов (`agent_id` пустой)."""

    __tablename__ = "agent_messages"
    __table_args__ = (Index("ix_agent_messages_thread", "organization_id", "agent_id", "created_at"),)

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
    )
    agent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)

    author: Mapped["User | None"] = relationship(foreign_keys=[author_id])
