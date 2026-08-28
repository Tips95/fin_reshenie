"""add civil cases module and executor role

Revision ID: x9m0n1o2p26
Revises: w8l9m0n1o25
Create Date: 2026-08-28

Юридический контур: гражданские дела отдельно от банкротства.
Роль executor пишется в users.role (VARCHAR); CHECK на старых инсталляциях снимаем.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "x9m0n1o2p26"
down_revision: Union[str, None] = "w8l9m0n1o25"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # Старый CHECK мог называться user_role или users_role_check — снимаем любой,
        # данные в users не трогаем. Дальше роль — обычный VARCHAR.
        op.execute(
            """
            DO $$
            DECLARE
                constraint_name text;
            BEGIN
                FOR constraint_name IN
                    SELECT con.conname
                    FROM pg_constraint con
                    JOIN pg_class rel ON rel.oid = con.conrelid
                    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
                    WHERE rel.relname = 'users'
                      AND att.attname = 'role'
                      AND con.contype = 'c'
                LOOP
                    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', constraint_name);
                END LOOP;
            END $$;
            """
        )
        op.execute("ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(32)")

    op.create_table(
        "civil_cases",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("assigned_executor_id", sa.Uuid(), nullable=True),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("appeal_date", sa.Date(), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("stage", sa.String(length=32), nullable=False, server_default="intake"),
        sa.Column("documents_prepared_at", sa.Date(), nullable=True),
        sa.Column("documents_note", sa.Text(), nullable=True),
        sa.Column("submitted_at", sa.Date(), nullable=True),
        sa.Column("authority_name", sa.String(length=255), nullable=True),
        sa.Column("executed_at", sa.Date(), nullable=True),
        sa.Column("execution_note", sa.Text(), nullable=True),
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
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["assigned_executor_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_civil_cases_organization_id", "civil_cases", ["organization_id"])
    op.create_index("ix_civil_cases_assigned_executor_id", "civil_cases", ["assigned_executor_id"])

    op.create_table(
        "civil_case_movements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("civil_case_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["civil_case_id"], ["civil_cases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_civil_case_movements_civil_case_id", "civil_case_movements", ["civil_case_id"])

    op.create_table(
        "civil_case_documents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("civil_case_id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("uploaded_by_id", sa.Uuid(), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=128), nullable=False),
        sa.Column("storage_key", sa.String(length=512), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["civil_case_id"], ["civil_cases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_civil_case_documents_civil_case_id",
        "civil_case_documents",
        ["civil_case_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_civil_case_documents_civil_case_id", table_name="civil_case_documents")
    op.drop_table("civil_case_documents")
    op.drop_index("ix_civil_case_movements_civil_case_id", table_name="civil_case_movements")
    op.drop_table("civil_case_movements")
    op.drop_index("ix_civil_cases_assigned_executor_id", table_name="civil_cases")
    op.drop_index("ix_civil_cases_organization_id", table_name="civil_cases")
    op.drop_table("civil_cases")
