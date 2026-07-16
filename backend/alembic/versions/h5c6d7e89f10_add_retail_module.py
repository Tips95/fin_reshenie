"""add retail installment module

Revision ID: h5c6d7e89f10
Revises: g4b5c6d78e09
Create Date: 2026-07-16 15:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "h5c6d7e89f10"
down_revision: Union[str, None] = "g4b5c6d78e09"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column(
            "organization_type",
            sa.String(length=32),
            nullable=False,
            server_default="bankruptcy",
        ),
    )

    op.create_table(
        "retail_term_rates",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("term_months", sa.Integer(), nullable=False),
        sa.Column("markup_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "term_months", name="uq_retail_term_rates_org_months"),
    )
    op.create_index("ix_retail_term_rates_organization_id", "retail_term_rates", ["organization_id"])

    op.create_table(
        "retail_clients",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=32), nullable=False),
        sa.Column("passport", sa.String(length=64), nullable=False),
        sa.Column("address", sa.Text(), nullable=False),
        sa.Column("guarantor_full_name", sa.String(length=255), nullable=False),
        sa.Column("guarantor_phone", sa.String(length=32), nullable=False),
        sa.Column("guarantor_passport", sa.String(length=64), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_retail_clients_organization_id", "retail_clients", ["organization_id"])

    op.create_table(
        "retail_contracts",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("retail_client_id", sa.Uuid(), nullable=False),
        sa.Column("investor_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("product_name", sa.String(length=255), nullable=False),
        sa.Column("product_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("term_months", sa.Integer(), nullable=False),
        sa.Column("markup_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("down_payment", sa.Numeric(12, 2), nullable=False),
        sa.Column("financed_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("monthly_payment", sa.Numeric(12, 2), nullable=False),
        sa.Column("contract_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["investor_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["retail_client_id"], ["retail_clients.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_retail_contracts_organization_id", "retail_contracts", ["organization_id"])
    op.create_index("ix_retail_contracts_retail_client_id", "retail_contracts", ["retail_client_id"])
    op.create_index("ix_retail_contracts_investor_id", "retail_contracts", ["investor_id"])

    op.create_table(
        "retail_payment_schedule",
        sa.Column("retail_contract_id", sa.Uuid(), nullable=False),
        sa.Column("month_number", sa.Integer(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("planned_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("paid_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("paid_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["retail_contract_id"], ["retail_contracts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_retail_payment_schedule_retail_contract_id", "retail_payment_schedule", ["retail_contract_id"])

    op.create_table(
        "retail_payments",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("retail_contract_id", sa.Uuid(), nullable=False),
        sa.Column("payment_schedule_id", sa.Uuid(), nullable=True),
        sa.Column("payment_type", sa.String(length=32), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("payment_date", sa.Date(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["payment_schedule_id"], ["retail_payment_schedule.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["retail_contract_id"], ["retail_contracts.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_retail_payments_organization_id", "retail_payments", ["organization_id"])
    op.create_index("ix_retail_payments_retail_contract_id", "retail_payments", ["retail_contract_id"])

    op.create_table(
        "retail_overdue_logs",
        sa.Column("retail_contract_id", sa.Uuid(), nullable=False),
        sa.Column("action_date", sa.Date(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False),
        sa.Column("promised_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="in_progress"),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["retail_contract_id"], ["retail_contracts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_retail_overdue_logs_retail_contract_id", "retail_overdue_logs", ["retail_contract_id"])


def downgrade() -> None:
    op.drop_index("ix_retail_overdue_logs_retail_contract_id", table_name="retail_overdue_logs")
    op.drop_table("retail_overdue_logs")
    op.drop_index("ix_retail_payments_retail_contract_id", table_name="retail_payments")
    op.drop_index("ix_retail_payments_organization_id", table_name="retail_payments")
    op.drop_table("retail_payments")
    op.drop_index("ix_retail_payment_schedule_retail_contract_id", table_name="retail_payment_schedule")
    op.drop_table("retail_payment_schedule")
    op.drop_index("ix_retail_contracts_investor_id", table_name="retail_contracts")
    op.drop_index("ix_retail_contracts_retail_client_id", table_name="retail_contracts")
    op.drop_index("ix_retail_contracts_organization_id", table_name="retail_contracts")
    op.drop_table("retail_contracts")
    op.drop_index("ix_retail_clients_organization_id", table_name="retail_clients")
    op.drop_table("retail_clients")
    op.drop_index("ix_retail_term_rates_organization_id", table_name="retail_term_rates")
    op.drop_table("retail_term_rates")
    op.drop_column("organizations", "organization_type")
