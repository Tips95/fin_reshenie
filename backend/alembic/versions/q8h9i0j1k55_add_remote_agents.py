"""add remote agents

Revision ID: q8h9i0j1k55
Revises: k2b3c4d5e49
Create Date: 2026-11-06

Удалённые менеджеры (role=agent): самостоятельная регистрация с принятием
пользовательского соглашения (фиксируем время и версию), куратор из штата,
открытая регистрация на сайте (включается в одной организации), источник лида и клиента,
отметка о выплате агенту и переписка по лиду. Только добавление колонок
и одной таблицы — существующие данные не меняются.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "q8h9i0j1k55"
down_revision: Union[str, None] = "k2b3c4d5e49"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("telegram", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("curator_id", sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column("inn", sa.String(length=12), nullable=True))
        batch_op.add_column(
            sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.add_column(sa.Column("terms_version", sa.String(length=20), nullable=True))
        batch_op.create_index("ix_users_curator_id", ["curator_id"])
        batch_op.create_foreign_key(
            "fk_users_curator_id_users",
            "users",
            ["curator_id"],
            ["id"],
            ondelete="SET NULL",
        )

    with op.batch_alter_table("organizations") as batch_op:
        batch_op.add_column(
            sa.Column(
                "agent_signup_open",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )

    with op.batch_alter_table("client_questionnaires") as batch_op:
        batch_op.add_column(sa.Column("source_agent_id", sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column("pd_consent_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.create_index("ix_client_questionnaires_source_agent_id", ["source_agent_id"])
        batch_op.create_foreign_key(
            "fk_client_questionnaires_source_agent_id_users",
            "users",
            ["source_agent_id"],
            ["id"],
            ondelete="SET NULL",
        )

    with op.batch_alter_table("clients") as batch_op:
        batch_op.add_column(sa.Column("source_agent_id", sa.Uuid(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "agent_commission_collected",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
        batch_op.add_column(
            sa.Column("agent_commission_collected_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.add_column(sa.Column("agent_commission_collected_by", sa.Uuid(), nullable=True))
        batch_op.create_index("ix_clients_source_agent_id", ["source_agent_id"])
        batch_op.create_foreign_key(
            "fk_clients_source_agent_id_users",
            "users",
            ["source_agent_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_foreign_key(
            "fk_clients_agent_commission_collected_by_users",
            "users",
            ["agent_commission_collected_by"],
            ["id"],
            ondelete="SET NULL",
        )

    op.create_table(
        "questionnaire_comments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("questionnaire_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["questionnaire_id"], ["client_questionnaires.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_questionnaire_comments_organization_id",
        "questionnaire_comments",
        ["organization_id"],
    )
    op.create_index(
        "ix_questionnaire_comments_questionnaire_id",
        "questionnaire_comments",
        ["questionnaire_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_questionnaire_comments_questionnaire_id", table_name="questionnaire_comments")
    op.drop_index("ix_questionnaire_comments_organization_id", table_name="questionnaire_comments")
    op.drop_table("questionnaire_comments")

    with op.batch_alter_table("clients") as batch_op:
        batch_op.drop_constraint("fk_clients_agent_commission_collected_by_users", type_="foreignkey")
        batch_op.drop_constraint("fk_clients_source_agent_id_users", type_="foreignkey")
        batch_op.drop_index("ix_clients_source_agent_id")
        batch_op.drop_column("agent_commission_collected_by")
        batch_op.drop_column("agent_commission_collected_at")
        batch_op.drop_column("agent_commission_collected")
        batch_op.drop_column("source_agent_id")

    with op.batch_alter_table("client_questionnaires") as batch_op:
        batch_op.drop_constraint(
            "fk_client_questionnaires_source_agent_id_users", type_="foreignkey"
        )
        batch_op.drop_index("ix_client_questionnaires_source_agent_id")
        batch_op.drop_column("pd_consent_at")
        batch_op.drop_column("source_agent_id")

    with op.batch_alter_table("organizations") as batch_op:
        batch_op.drop_column("agent_signup_open")

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_constraint("fk_users_curator_id_users", type_="foreignkey")
        batch_op.drop_index("ix_users_curator_id")
        batch_op.drop_column("terms_version")
        batch_op.drop_column("terms_accepted_at")
        batch_op.drop_column("inn")
        batch_op.drop_column("curator_id")
        batch_op.drop_column("telegram")
