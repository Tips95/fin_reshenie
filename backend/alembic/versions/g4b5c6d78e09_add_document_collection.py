"""add document collection module

Revision ID: g4b5c6d78e09
Revises: f3a4b5c67d08
Create Date: 2026-07-16

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "g4b5c6d78e09"
down_revision: Union[str, None] = "f3a4b5c67d08"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "clients",
        sa.Column(
            "engagement_stage",
            sa.Enum(
                "document_collection",
                "bankruptcy",
                name="engagementstage",
                native_enum=False,
            ),
            nullable=False,
            server_default="document_collection",
        ),
    )

    op.create_table(
        "document_collections",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("client_id", sa.Uuid(), nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False, server_default="13000.00"),
        sa.Column("collection_fee", sa.Numeric(12, 2), nullable=False, server_default="10000.00"),
        sa.Column("notary_fee", sa.Numeric(12, 2), nullable=False, server_default="2000.00"),
        sa.Column("manager_commission", sa.Numeric(12, 2), nullable=False, server_default="1000.00"),
        sa.Column(
            "status",
            sa.Enum("pending", "paid", name="documentcollectionstatus", native_enum=False),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("paid_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("client_id"),
    )
    op.create_index("ix_document_collections_client_id", "document_collections", ["client_id"])

    op.execute(
        """
        UPDATE clients
        SET engagement_stage = 'bankruptcy'
        WHERE id IN (SELECT DISTINCT client_id FROM installment_plans)
        """
    )


def downgrade() -> None:
    op.drop_index("ix_document_collections_client_id", table_name="document_collections")
    op.drop_table("document_collections")
    op.drop_column("clients", "engagement_stage")
