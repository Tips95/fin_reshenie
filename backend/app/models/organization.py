from sqlalchemy import Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin
from app.models.enums import OrganizationType


class Organization(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    organization_type: Mapped[OrganizationType] = mapped_column(
        Enum(
            OrganizationType,
            name="organization_type",
            native_enum=False,
            values_callable=lambda enum: [item.value for item in enum],
        ),
        nullable=False,
        default=OrganizationType.BANKRUPTCY,
    )

    users: Mapped[list["User"]] = relationship(back_populates="organization")
    clients: Mapped[list["Client"]] = relationship(back_populates="organization")
    pricing_tiers: Mapped[list["PricingTier"]] = relationship(back_populates="organization")
    operating_expenses: Mapped[list["OperatingExpense"]] = relationship(back_populates="organization")
    audit_logs: Mapped[list["AuditLog"]] = relationship(back_populates="organization")
    retail_clients: Mapped[list["RetailClient"]] = relationship(back_populates="organization")
    retail_contracts: Mapped[list["RetailContract"]] = relationship(back_populates="organization")
    retail_term_rates: Mapped[list["RetailTermRate"]] = relationship(back_populates="organization")
