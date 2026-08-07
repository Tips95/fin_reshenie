"""retail purchase_price and optional client fields

Revision ID: t5i6j7k8l22
Revises: s4h5i6j7k21
Create Date: 2026-08-07

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "t5i6j7k8l22"
down_revision: Union[str, None] = "s4h5i6j7k21"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "retail_contracts",
        sa.Column("purchase_price", sa.Numeric(precision=12, scale=2), nullable=True),
    )
    op.alter_column("retail_clients", "passport", existing_type=sa.String(length=64), nullable=True)
    op.alter_column("retail_clients", "address", existing_type=sa.Text(), nullable=True)
    op.alter_column(
        "retail_clients",
        "guarantor_full_name",
        existing_type=sa.String(length=255),
        nullable=True,
    )
    op.alter_column(
        "retail_clients",
        "guarantor_phone",
        existing_type=sa.String(length=32),
        nullable=True,
    )
    op.alter_column(
        "retail_clients",
        "guarantor_passport",
        existing_type=sa.String(length=64),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "retail_clients",
        "guarantor_passport",
        existing_type=sa.String(length=64),
        nullable=False,
    )
    op.alter_column(
        "retail_clients",
        "guarantor_phone",
        existing_type=sa.String(length=32),
        nullable=False,
    )
    op.alter_column(
        "retail_clients",
        "guarantor_full_name",
        existing_type=sa.String(length=255),
        nullable=False,
    )
    op.alter_column("retail_clients", "address", existing_type=sa.Text(), nullable=False)
    op.alter_column("retail_clients", "passport", existing_type=sa.String(length=64), nullable=False)
    op.drop_column("retail_contracts", "purchase_price")
