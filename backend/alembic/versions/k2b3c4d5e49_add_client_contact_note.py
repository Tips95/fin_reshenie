"""add client contact note

Revision ID: k2b3c4d5e49
Revises: n5e6f7g8h52
Create Date: 2026-10-09

Additive only: nullable contact-note columns on clients.
Existing rows and schedule manager_note fields stay intact.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "k2b3c4d5e49"
down_revision: Union[str, None] = "p7g8h9i0j54"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("clients") as batch_op:
        batch_op.add_column(sa.Column("contact_note", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("contact_note_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("contact_note_by", sa.Uuid(), nullable=True))
        batch_op.create_foreign_key(
            "fk_clients_contact_note_by_users",
            "users",
            ["contact_note_by"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("clients") as batch_op:
        batch_op.drop_constraint("fk_clients_contact_note_by_users", type_="foreignkey")
        batch_op.drop_column("contact_note_by")
        batch_op.drop_column("contact_note_at")
        batch_op.drop_column("contact_note")
