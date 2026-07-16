import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import ClientStatus, EngagementStage, ProcedureStage


class Client(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "clients"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    assigned_manager_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), nullable=False)
    contract_date: Mapped[date] = mapped_column(Date, nullable=False)
    debt_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    engagement_stage: Mapped[EngagementStage] = mapped_column(
        Enum(
            EngagementStage,
            name="engagement_stage",
            native_enum=False,
            values_callable=lambda enum: [item.value for item in enum],
        ),
        nullable=False,
        default=EngagementStage.DOCUMENT_COLLECTION,
    )
    status: Mapped[ClientStatus] = mapped_column(
        Enum(ClientStatus, name="client_status", native_enum=False),
        nullable=False,
        default=ClientStatus.ACTIVE,
    )
    procedure_stage: Mapped[ProcedureStage] = mapped_column(
        Enum(
            ProcedureStage,
            name="procedure_stage",
            native_enum=False,
            values_callable=lambda enum: [item.value for item in enum],
        ),
        nullable=False,
        default=ProcedureStage.CONTRACT_SIGNED,
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)

    organization: Mapped["Organization"] = relationship(back_populates="clients")
    assigned_manager: Mapped["User | None"] = relationship(back_populates="assigned_clients")
    document_collection: Mapped["DocumentCollection | None"] = relationship(
        back_populates="client",
        uselist=False,
    )
    installment_plans: Mapped[list["InstallmentPlan"]] = relationship(back_populates="client")
    payments: Mapped[list["Payment"]] = relationship(back_populates="client")
    court_deposit_tracking: Mapped[list["CourtDepositTracking"]] = relationship(
        back_populates="client"
    )
    mandatory_payments: Mapped[list["ClientMandatoryPayment"]] = relationship(
        back_populates="client"
    )
    manager_tasks: Mapped[list["ManagerTask"]] = relationship(back_populates="client")
