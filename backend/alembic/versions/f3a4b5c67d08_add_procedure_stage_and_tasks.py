"""add procedure stage and manager tasks

Revision ID: f3a4b5c67d08
Revises: e1f2a3b45c06
Create Date: 2026-07-16

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f3a4b5c67d08"
down_revision: Union[str, None] = "e1f2a3b45c06"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "clients",
        sa.Column(
            "procedure_stage",
            sa.Enum(
                "contract_signed",
                "deposit",
                "financial_management",
                "court",
                "completed",
                name="procedurestage",
                native_enum=False,
            ),
            nullable=False,
            server_default="contract_signed",
        ),
    )

    op.create_table(
        "manager_tasks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("client_id", sa.Uuid(), nullable=False),
        sa.Column("assigned_manager_id", sa.Uuid(), nullable=True),
        sa.Column("payment_schedule_id", sa.Uuid(), nullable=True),
        sa.Column(
            "task_type",
            sa.Enum(
                "overdue_payment",
                "deferral_review",
                "manual",
                name="tasktype",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("open", "done", "dismissed", name="taskstatus", native_enum=False),
            nullable=False,
            server_default="open",
        ),
        sa.Column(
            "source",
            sa.Enum("auto", "manual", name="tasksource", native_enum=False),
            nullable=False,
            server_default="auto",
        ),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("overdue_days", sa.Integer(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("completed_at", sa.Date(), nullable=True),
        sa.Column("completed_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["assigned_manager_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["completed_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["payment_schedule_id"], ["payment_schedule.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_manager_tasks_organization_id", "manager_tasks", ["organization_id"])
    op.create_index("ix_manager_tasks_client_id", "manager_tasks", ["client_id"])
    op.create_index("ix_manager_tasks_assigned_manager_id", "manager_tasks", ["assigned_manager_id"])
    op.create_index("ix_manager_tasks_payment_schedule_id", "manager_tasks", ["payment_schedule_id"])


def downgrade() -> None:
    op.drop_index("ix_manager_tasks_payment_schedule_id", table_name="manager_tasks")
    op.drop_index("ix_manager_tasks_assigned_manager_id", table_name="manager_tasks")
    op.drop_index("ix_manager_tasks_client_id", table_name="manager_tasks")
    op.drop_index("ix_manager_tasks_organization_id", table_name="manager_tasks")
    op.drop_table("manager_tasks")
    op.drop_column("clients", "procedure_stage")
