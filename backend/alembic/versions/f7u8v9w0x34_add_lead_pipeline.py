"""add lead pipeline to questionnaires

Revision ID: f7u8v9w0x34
Revises: e6t7u8v9w33
Create Date: 2026-09-15

Анкета становится карточкой лида: статус обзвона, причина отсева, дата
следующего звонка и журнал попыток дозвона для дневной статистики.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f7u8v9w0x34"
down_revision: Union[str, None] = "e6t7u8v9w33"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("client_questionnaires") as batch_op:
        batch_op.add_column(sa.Column("assigned_manager_id", sa.Uuid(), nullable=True))
        batch_op.add_column(
            sa.Column("lead_status", sa.String(length=32), nullable=False, server_default="new")
        )
        batch_op.add_column(sa.Column("unqualified_reason", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("unqualified_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("unqualified_by_id", sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column("converted_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("converted_by_id", sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column("next_call_at", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("last_call_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(
            sa.Column("call_attempts", sa.Integer(), nullable=False, server_default="0")
        )
        batch_op.create_index(
            "ix_client_questionnaires_assigned_manager_id", ["assigned_manager_id"]
        )
        batch_op.create_index("ix_client_questionnaires_lead_status", ["lead_status"])
        batch_op.create_index("ix_client_questionnaires_next_call_at", ["next_call_at"])
        batch_op.create_foreign_key(
            "fk_client_questionnaires_assigned_manager_id_users",
            "users",
            ["assigned_manager_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_foreign_key(
            "fk_client_questionnaires_unqualified_by_id_users",
            "users",
            ["unqualified_by_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_foreign_key(
            "fk_client_questionnaires_converted_by_id_users",
            "users",
            ["converted_by_id"],
            ["id"],
            ondelete="SET NULL",
        )

    op.execute(
        "UPDATE client_questionnaires SET assigned_manager_id = created_by_id "
        "WHERE assigned_manager_id IS NULL"
    )
    op.execute(
        "UPDATE client_questionnaires "
        "SET lead_status = 'converted', converted_at = created_at, converted_by_id = created_by_id "
        "WHERE client_id IS NOT NULL"
    )
    op.execute(
        "UPDATE client_questionnaires SET lead_status = 'in_progress' WHERE client_id IS NULL"
    )

    op.create_table(
        "questionnaire_calls",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("questionnaire_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("outcome", sa.String(length=32), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["questionnaire_id"], ["client_questionnaires.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_questionnaire_calls_organization_id", "questionnaire_calls", ["organization_id"])
    op.create_index("ix_questionnaire_calls_questionnaire_id", "questionnaire_calls", ["questionnaire_id"])
    op.create_index("ix_questionnaire_calls_created_by_id", "questionnaire_calls", ["created_by_id"])
    op.create_index(
        "ix_questionnaire_calls_org_created_at",
        "questionnaire_calls",
        ["organization_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_questionnaire_calls_org_created_at", table_name="questionnaire_calls")
    op.drop_index("ix_questionnaire_calls_created_by_id", table_name="questionnaire_calls")
    op.drop_index("ix_questionnaire_calls_questionnaire_id", table_name="questionnaire_calls")
    op.drop_index("ix_questionnaire_calls_organization_id", table_name="questionnaire_calls")
    op.drop_table("questionnaire_calls")

    with op.batch_alter_table("client_questionnaires") as batch_op:
        batch_op.drop_constraint(
            "fk_client_questionnaires_converted_by_id_users", type_="foreignkey"
        )
        batch_op.drop_constraint(
            "fk_client_questionnaires_unqualified_by_id_users", type_="foreignkey"
        )
        batch_op.drop_constraint(
            "fk_client_questionnaires_assigned_manager_id_users", type_="foreignkey"
        )
        batch_op.drop_index("ix_client_questionnaires_next_call_at")
        batch_op.drop_index("ix_client_questionnaires_lead_status")
        batch_op.drop_index("ix_client_questionnaires_assigned_manager_id")
        batch_op.drop_column("call_attempts")
        batch_op.drop_column("last_call_at")
        batch_op.drop_column("next_call_at")
        batch_op.drop_column("converted_by_id")
        batch_op.drop_column("converted_at")
        batch_op.drop_column("unqualified_by_id")
        batch_op.drop_column("unqualified_at")
        batch_op.drop_column("unqualified_reason")
        batch_op.drop_column("lead_status")
        batch_op.drop_column("assigned_manager_id")
