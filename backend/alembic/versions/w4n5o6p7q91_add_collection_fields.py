"""add collection call fields and collection_events

Revision ID: w4n5o6p7q91
Revises: v3m4n5o6p90
Create Date: 2026-11-19

Поля звонка/обещания на месяце графика и журнал collection_events.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "w4n5o6p7q91"
down_revision: Union[str, None] = "v3m4n5o6p90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("payment_schedule") as batch:
        batch.add_column(sa.Column("last_call_result", sa.String(length=32), nullable=True))
        batch.add_column(sa.Column("last_call_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("promised_pay_date", sa.Date(), nullable=True))
        batch.add_column(
            sa.Column("promised_notified_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch.create_index("ix_payment_schedule_promised_pay_date", ["promised_pay_date"])

    op.create_table(
        "collection_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("client_id", sa.Uuid(), nullable=False),
        sa.Column("payment_schedule_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=True),
        sa.Column("result", sa.String(length=32), nullable=True),
        sa.Column("promised_pay_date", sa.Date(), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["payment_schedule_id"], ["payment_schedule.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_collection_events_schedule_created",
        "collection_events",
        ["payment_schedule_id", "created_at"],
    )
    op.create_index("ix_collection_events_client_id", "collection_events", ["client_id"])


def downgrade() -> None:
    op.drop_index("ix_collection_events_client_id", table_name="collection_events")
    op.drop_index("ix_collection_events_schedule_created", table_name="collection_events")
    op.drop_table("collection_events")

    with op.batch_alter_table("payment_schedule") as batch:
        batch.drop_index("ix_payment_schedule_promised_pay_date")
        batch.drop_column("promised_notified_at")
        batch.drop_column("promised_pay_date")
        batch.drop_column("last_call_at")
        batch.drop_column("last_call_result")
