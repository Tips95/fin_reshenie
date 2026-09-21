"""store retail PDF bytes in database

Revision ID: i0x1y2z3a47
Revises: h9w0x1y2z46
Create Date: 2026-09-21

Additive only: nullable BYTEA columns. Existing path/filename columns and
all retail rows stay intact. New uploads also keep a disk cache when possible.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "i0x1y2z3a47"
down_revision: Union[str, None] = "h9w0x1y2z46"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("retail_clients") as batch_op:
        batch_op.add_column(sa.Column("passport_pdf_data", sa.LargeBinary(), nullable=True))
        batch_op.add_column(sa.Column("guarantor_passport_pdf_data", sa.LargeBinary(), nullable=True))

    with op.batch_alter_table("retail_contracts") as batch_op:
        batch_op.add_column(sa.Column("signed_contract_pdf_data", sa.LargeBinary(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("retail_contracts") as batch_op:
        batch_op.drop_column("signed_contract_pdf_data")

    with op.batch_alter_table("retail_clients") as batch_op:
        batch_op.drop_column("guarantor_passport_pdf_data")
        batch_op.drop_column("passport_pdf_data")
