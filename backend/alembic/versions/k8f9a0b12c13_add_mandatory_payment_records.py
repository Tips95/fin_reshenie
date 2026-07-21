"""add client_mandatory_payment_records

Revision ID: k8f9a0b12c13
Revises: j7e8f9a01b12
Create Date: 2026-07-21

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "k8f9a0b12c13"
down_revision: Union[str, None] = "j7e8f9a01b12"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "client_mandatory_payment_records",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("mandatory_payment_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("payment_date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["mandatory_payment_id"],
            ["client_mandatory_payments.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_client_mandatory_payment_records_mandatory_payment_id"),
        "client_mandatory_payment_records",
        ["mandatory_payment_id"],
        unique=False,
    )

    connection = op.get_bind()
    connection.execute(
        sa.text(
            """
            INSERT INTO client_mandatory_payment_records (id, mandatory_payment_id, amount, payment_date, created_at, updated_at)
            SELECT gen_random_uuid(), id, paid_amount, COALESCE(paid_date, CURRENT_DATE), NOW(), NOW()
            FROM client_mandatory_payments
            WHERE paid_amount > 0
            """
        )
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_client_mandatory_payment_records_mandatory_payment_id"),
        table_name="client_mandatory_payment_records",
    )
    op.drop_table("client_mandatory_payment_records")
