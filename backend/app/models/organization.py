from sqlalchemy import Boolean, Enum, String, false
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

    # Модули продукта: руководитель включает/выключает под свою компанию.
    # Значения по умолчанию True — чтобы продакшен с уже работающими разделами
    # не «потерял» меню после миграции.
    feature_document_collection: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    feature_tasks: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    feature_expenses: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    feature_pricing: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    feature_analytics: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Кнопка «Стать удалённым менеджером» на сайте ведёт в эту организацию.
    # Открыта может быть только у одной организации платформы.
    agent_signup_open: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false(), nullable=False
    )

    users: Mapped[list["User"]] = relationship(back_populates="organization")
    clients: Mapped[list["Client"]] = relationship(back_populates="organization")
    pricing_tiers: Mapped[list["PricingTier"]] = relationship(back_populates="organization")
    operating_expenses: Mapped[list["OperatingExpense"]] = relationship(back_populates="organization")
    audit_logs: Mapped[list["AuditLog"]] = relationship(back_populates="organization")
