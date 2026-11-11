"""add notifications and agent note

Revision ID: r9i0j1k2l56
Revises: q8h9i0j1k55
Create Date: 2026-11-11

Колокольчик в приложении (события по удалённым менеджерам), заметка куратора
об удалённом менеджере и отметка «куратор удалённых менеджеров». Отметку сразу
получают кураторы, утверждённые руководителем (поиск по фамилии и имени).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "r9i0j1k2l56"
down_revision: Union[str, None] = "q8h9i0j1k55"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

AGENT_CURATORS = ({"ииев", "ризван"}, {"юнусов", "магомед"}, {"дербишев", "рустам"})
CURATOR_ROLES = ("owner", "head_manager", "manager")


def _is_listed_curator(full_name: str) -> bool:
    words = set(full_name.lower().replace("ё", "е").split())
    return any(names <= words for names in AGENT_CURATORS)


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("agent_note", sa.Text(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "is_agent_curator",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )

    bind = op.get_bind()
    users = sa.table(
        "users",
        sa.column("id", sa.Uuid()),
        sa.column("full_name", sa.String()),
        sa.column("role", sa.String()),
        sa.column("is_agent_curator", sa.Boolean()),
    )
    curator_ids = [
        row.id
        for row in bind.execute(sa.select(users.c.id, users.c.full_name, users.c.role))
        if (row.role or "").lower() in CURATOR_ROLES and _is_listed_curator(row.full_name or "")
    ]
    if curator_ids:
        bind.execute(
            users.update().where(users.c.id.in_(curator_ids)).values(is_agent_curator=True)
        )

    op.create_table(
        "notifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("recipient_id", sa.Uuid(), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=True),
        sa.Column("questionnaire_id", sa.Uuid(), nullable=True),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("link", sa.String(length=255), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["recipient_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["questionnaire_id"], ["client_questionnaires.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notifications_organization_id", "notifications", ["organization_id"])
    op.create_index("ix_notifications_questionnaire_id", "notifications", ["questionnaire_id"])
    op.create_index(
        "ix_notifications_recipient_read", "notifications", ["recipient_id", "read_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_notifications_recipient_read", table_name="notifications")
    op.drop_index("ix_notifications_questionnaire_id", table_name="notifications")
    op.drop_index("ix_notifications_organization_id", table_name="notifications")
    op.drop_table("notifications")

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("is_agent_curator")
        batch_op.drop_column("agent_note")
