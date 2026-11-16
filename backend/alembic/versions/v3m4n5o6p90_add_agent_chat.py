"""add agent chat and curator whatsapp group link

Revision ID: v3m4n5o6p90
Revises: u2l3m4n5o89
Create Date: 2026-11-16

Чат удалённых менеджеров (личный с куратором и общая лента) и ссылка куратора
на его группу WhatsApp.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "v3m4n5o6p90"
down_revision: Union[str, None] = "u2l3m4n5o89"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("whatsapp_group_url", sa.String(length=255), nullable=True))

    op.create_table(
        "agent_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("agent_id", sa.Uuid(), nullable=True),
        sa.Column("author_id", sa.Uuid(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["agent_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_agent_messages_thread", "agent_messages", ["organization_id", "agent_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_agent_messages_thread", table_name="agent_messages")
    op.drop_table("agent_messages")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("whatsapp_group_url")
