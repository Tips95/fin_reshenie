import uuid

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class RetailClient(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "retail_clients"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), nullable=False)
    passport: Mapped[str | None] = mapped_column(String(64), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    guarantor_full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    guarantor_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    guarantor_passport: Mapped[str | None] = mapped_column(String(64), nullable=True)
    passport_pdf_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    passport_pdf_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    guarantor_passport_pdf_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    guarantor_passport_pdf_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(default=False, nullable=False)

    organization: Mapped["Organization"] = relationship(back_populates="retail_clients")
    contracts: Mapped[list["RetailContract"]] = relationship(back_populates="client")
