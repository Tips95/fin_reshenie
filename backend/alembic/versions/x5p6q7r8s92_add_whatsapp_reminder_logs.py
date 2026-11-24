"""add whatsapp reminder logs

Revision ID: x5p6q7r8s92
Revises: w4n5o6p7q91
Create Date: 2026-03-24

Журнал массовых WhatsApp-напоминаний о платежах (Green API).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "x5p6q7r8s92"
down_revision: Union[str, None] = "w4n5o6p7q91"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "whatsapp_reminder_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("client_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("period_month", sa.String(length=7), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("id_message", sa.String(length=128), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("batch_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_whatsapp_reminder_logs_organization_id",
        "whatsapp_reminder_logs",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        "ix_whatsapp_reminder_logs_batch_id",
        "whatsapp_reminder_logs",
        ["batch_id"],
        unique=False,
    )
    op.create_index(
        "ix_wa_reminder_logs_org_month",
        "whatsapp_reminder_logs",
        ["organization_id", "period_month"],
        unique=False,
    )
    op.create_index(
        "ix_wa_reminder_logs_client_month",
        "whatsapp_reminder_logs",
        ["client_id", "period_month"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_wa_reminder_logs_client_month", table_name="whatsapp_reminder_logs")
    op.drop_index("ix_wa_reminder_logs_org_month", table_name="whatsapp_reminder_logs")
    op.drop_index("ix_whatsapp_reminder_logs_batch_id", table_name="whatsapp_reminder_logs")
    op.drop_index("ix_whatsapp_reminder_logs_organization_id", table_name="whatsapp_reminder_logs")
    op.drop_table("whatsapp_reminder_logs")
