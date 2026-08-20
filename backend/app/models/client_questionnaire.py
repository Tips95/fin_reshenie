import uuid
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import JSON, Boolean, Date, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


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
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
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
    created_by: Mapped["User | None"] = relationship()
