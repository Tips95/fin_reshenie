"""add civil case payments

Revision ID: p7g8h9i0j54
Revises: o6f7g8h9i53
Create Date: 2026-11-05

Доход по гражданке теперь считается по фактическим оплатам, а не по цене дела
на дату обращения. Чтобы касса прошлых месяцев не изменилась, каждое уже
заведённое дело получает одну оплату на полную цену в дату обращения —
лишнее руководитель удалит в карточке дела.
"""

import uuid
from datetime import date
from decimal import Decimal
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "p7g8h9i0j54"
down_revision: Union[str, None] = "o6f7g8h9i53"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BACKFILL_COMMENT = "Перенесено: оплата по цене дела на дату обращения"


def upgrade() -> None:
    op.create_table(
        "civil_case_payments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("civil_case_id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("payment_date", sa.Date(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["civil_case_id"], ["civil_cases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_civil_case_payments_civil_case_id", "civil_case_payments", ["civil_case_id"])
    op.create_index("ix_civil_case_payments_organization_id", "civil_case_payments", ["organization_id"])
    op.create_index("ix_civil_case_payments_payment_date", "civil_case_payments", ["payment_date"])

    bind = op.get_bind()
    cases = bind.execute(
        sa.text(
            "SELECT id, organization_id, price, appeal_date, created_by_id "
            "FROM civil_cases WHERE price > 0"
        )
    ).fetchall()
    if not cases:
        return

    payments = sa.table(
        "civil_case_payments",
        sa.column("id", sa.Uuid()),
        sa.column("civil_case_id", sa.Uuid()),
        sa.column("organization_id", sa.Uuid()),
        sa.column("amount", sa.Numeric(12, 2)),
        sa.column("payment_date", sa.Date()),
        sa.column("comment", sa.Text()),
        sa.column("created_by_id", sa.Uuid()),
    )
    op.bulk_insert(
        payments,
        [
            {
                "id": uuid.uuid4(),
                "civil_case_id": _as_uuid(row.id),
                "organization_id": _as_uuid(row.organization_id),
                "amount": Decimal(str(row.price)),
                "payment_date": _as_date(row.appeal_date),
                "comment": BACKFILL_COMMENT,
                "created_by_id": _as_uuid(row.created_by_id) if row.created_by_id else None,
            }
            for row in cases
        ],
    )


def _as_uuid(value) -> uuid.UUID:
    return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


def _as_date(value) -> date:
    # SQLite отдаёт даты из сырого запроса строкой.
    return value if isinstance(value, date) else date.fromisoformat(str(value)[:10])


def downgrade() -> None:
    op.drop_index("ix_civil_case_payments_payment_date", table_name="civil_case_payments")
    op.drop_index("ix_civil_case_payments_organization_id", table_name="civil_case_payments")
    op.drop_index("ix_civil_case_payments_civil_case_id", table_name="civil_case_payments")
    op.drop_table("civil_case_payments")
