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
    passport: Mapped[str] = mapped_column(String(64), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    guarantor_full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    guarantor_phone: Mapped[str] = mapped_column(String(32), nullable=False)
    guarantor_passport: Mapped[str] = mapped_column(String(64), nullable=False)
    is_deleted: Mapped[bool] = mapped_column(default=False, nullable=False)

    organization: Mapped["Organization"] = relationship(back_populates="retail_clients")
    contracts: Mapped[list["RetailContract"]] = relationship(back_populates="client")
