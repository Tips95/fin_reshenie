import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import LeadCallOutcome, LeadStatus


class ClientQuestionnaire(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "client_questionnaires"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("clients.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    assigned_manager_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    lead_status: Mapped[LeadStatus] = mapped_column(
        Enum(
            LeadStatus,
            name="lead_status",
            native_enum=False,
            values_callable=lambda enum: [item.value for item in enum],
        ),
        nullable=False,
        default=LeadStatus.NEW,
        server_default="new",
        index=True,
    )
    unqualified_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    unqualified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    unqualified_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    converted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    converted_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    next_call_at: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    last_call_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    call_attempts: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    # Клиент обещал подойти — напоминание менеджеру, отдельно от next_call_at.
    appointment_at: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    appointment_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    service_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    phone: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    registration_region: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fake_income_documents: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    bank_accounts: Mapped[str | None] = mapped_column(Text, nullable=True)
    has_guarantee_or_collateral: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    is_married: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    divorce_info: Mapped[str | None] = mapped_column(String(255), nullable=True)
    dependents: Mapped[str | None] = mapped_column(String(255), nullable=True)
    income_debtor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    income_spouse: Mapped[str | None] = mapped_column(String(255), nullable=True)
    income_destination: Mapped[str | None] = mapped_column(Text, nullable=True)
    has_property_encumbrance: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    property_encumbrance_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    has_recent_property_deals: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    recent_property_deals_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    property_debtor: Mapped[str | None] = mapped_column(Text, nullable=True)
    property_spouse: Mapped[str | None] = mapped_column(Text, nullable=True)
    has_weapon: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    weapon_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    filled_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    debts: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    assets: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    documents: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)

    organization: Mapped["Organization"] = relationship()
    client: Mapped["Client | None"] = relationship(back_populates="questionnaires")
    created_by: Mapped["User | None"] = relationship(foreign_keys=[created_by_id])
    assigned_manager: Mapped["User | None"] = relationship(foreign_keys=[assigned_manager_id])
    calls: Mapped[list["QuestionnaireCall"]] = relationship(
        back_populates="questionnaire",
        cascade="all, delete-orphan",
        order_by="QuestionnaireCall.created_at.desc()",
    )


class QuestionnaireCall(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """Одна попытка дозвона: из них складывается дневная статистика менеджера."""

    __tablename__ = "questionnaire_calls"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    questionnaire_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("client_questionnaires.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    outcome: Mapped[LeadCallOutcome] = mapped_column(
        Enum(
            LeadCallOutcome,
            name="lead_call_outcome",
            native_enum=False,
            values_callable=lambda enum: [item.value for item in enum],
        ),
        nullable=False,
    )
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    questionnaire: Mapped["ClientQuestionnaire"] = relationship(back_populates="calls")
    created_by: Mapped["User | None"] = relationship()
