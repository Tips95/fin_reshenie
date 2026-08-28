import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import CivilCaseDocumentKind, CivilCaseStage


class CivilCase(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "civil_cases"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    assigned_executor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    concluding_manager_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    appeal_date: Mapped[date] = mapped_column(Date, nullable=False)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    stage: Mapped[CivilCaseStage] = mapped_column(
        Enum(
            CivilCaseStage,
            name="civil_case_stage",
            native_enum=False,
            values_callable=lambda enum: [item.value for item in enum],
        ),
        nullable=False,
        default=CivilCaseStage.INTAKE,
    )
    documents_prepared_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    documents_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    authority_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    executed_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    execution_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    organization: Mapped["Organization"] = relationship()
    created_by: Mapped["User | None"] = relationship(foreign_keys=[created_by_id])
    executor: Mapped["User | None"] = relationship(foreign_keys=[assigned_executor_id])
    concluding_manager: Mapped["User | None"] = relationship(foreign_keys=[concluding_manager_id])
    movements: Mapped[list["CivilCaseMovement"]] = relationship(
        back_populates="civil_case",
        cascade="all, delete-orphan",
        order_by="CivilCaseMovement.created_at.desc()",
    )
    documents: Mapped[list["CivilCaseDocument"]] = relationship(
        back_populates="civil_case",
        cascade="all, delete-orphan",
        order_by="CivilCaseDocument.created_at.desc()",
    )


class CivilCaseMovement(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    __tablename__ = "civil_case_movements"

    civil_case_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("civil_cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)

    civil_case: Mapped["CivilCase"] = relationship(back_populates="movements")
    created_by: Mapped["User | None"] = relationship()


class CivilCaseDocument(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    __tablename__ = "civil_case_documents"

    civil_case_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("civil_cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
    )
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(128), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    kind: Mapped[CivilCaseDocumentKind] = mapped_column(
        Enum(
            CivilCaseDocumentKind,
            name="civil_case_document_kind",
            native_enum=False,
            values_callable=lambda enum: [item.value for item in enum],
        ),
        nullable=False,
        default=CivilCaseDocumentKind.CLIENT,
        server_default="client",
    )

    civil_case: Mapped["CivilCase"] = relationship(back_populates="documents")
    uploaded_by: Mapped["User | None"] = relationship()
