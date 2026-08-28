import uuid
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Numeric, String, TypeDecorator
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin
from app.models.enums import UserRole, parse_user_role


class UserRoleType(TypeDecorator):
    """Пишем role.value, читаем и `owner`, и старое `OWNER`."""

    impl = String(32)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return parse_user_role(value).value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return parse_user_role(value)


class User(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    __tablename__ = "users"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(UserRoleType(), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    investment_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    organization: Mapped["Organization"] = relationship(back_populates="users")
    assigned_clients: Mapped[list["Client"]] = relationship(
        back_populates="assigned_manager",
        foreign_keys="Client.assigned_manager_id",
    )
    payments_created: Mapped[list["Payment"]] = relationship(back_populates="created_by_user")
    audit_logs: Mapped[list["AuditLog"]] = relationship(back_populates="changed_by_user")
    assigned_tasks: Mapped[list["ManagerTask"]] = relationship(
        foreign_keys="ManagerTask.assigned_manager_id",
        back_populates="assigned_manager",
    )
