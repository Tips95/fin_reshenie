"""add client_questionnaires table for bankruptcy intake forms

Revision ID: u6j7k8l9m23
Revises: t5i6j7k8l22
Create Date: 2026-08-20

Аддитивная миграция: существующие таблицы клиентов, платежей и графиков
не изменяются. Анкеты живут в отдельной таблице и лишь опционально
ссылаются на клиента (ON DELETE SET NULL).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "u6j7k8l9m23"
down_revision: Union[str, None] = "t5i6j7k8l22"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "client_questionnaires",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("client_id", sa.Uuid(), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("service_cost", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("phone", sa.String(length=32), nullable=False, server_default=""),
        sa.Column("registration_region", sa.String(length=255), nullable=True),
        sa.Column("fake_income_documents", sa.Boolean(), nullable=True),
        sa.Column("bank_accounts", sa.Text(), nullable=True),
        sa.Column("has_guarantee_or_collateral", sa.Boolean(), nullable=True),
        sa.Column("is_married", sa.Boolean(), nullable=True),
        sa.Column("divorce_info", sa.String(length=255), nullable=True),
        sa.Column("dependents", sa.String(length=255), nullable=True),
        sa.Column("income_debtor", sa.String(length=255), nullable=True),
        sa.Column("income_spouse", sa.String(length=255), nullable=True),
        sa.Column("income_destination", sa.Text(), nullable=True),
        sa.Column("has_property_encumbrance", sa.Boolean(), nullable=True),
        sa.Column("property_encumbrance_details", sa.Text(), nullable=True),
        sa.Column("has_recent_property_deals", sa.Boolean(), nullable=True),
        sa.Column("recent_property_deals_details", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("filled_date", sa.Date(), nullable=True),
        sa.Column("debts", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("assets", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("documents", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_client_questionnaires_organization_id",
        "client_questionnaires",
        ["organization_id"],
    )
    op.create_index(
        "ix_client_questionnaires_client_id",
        "client_questionnaires",
        ["client_id"],
    )
    op.create_index(
        "ix_client_questionnaires_created_at",
        "client_questionnaires",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_client_questionnaires_created_at", table_name="client_questionnaires")
    op.drop_index("ix_client_questionnaires_client_id", table_name="client_questionnaires")
    op.drop_index("ix_client_questionnaires_organization_id", table_name="client_questionnaires")
    op.drop_table("client_questionnaires")
