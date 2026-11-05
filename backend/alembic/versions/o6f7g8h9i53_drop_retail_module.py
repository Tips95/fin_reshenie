"""drop retail installment module

Revision ID: o6f7g8h9i53
Revises: n5e6f7g8h52
Create Date: 2026-11-05

Товарная рассрочка больше не используется. Удаляются её таблицы, служебная
компания «Товарная рассрочка» с её пользователями (включая сидовых инвесторов)
и колонки users.investment_amount, organizations.feature_investors.
Данные юридической компании живут в других таблицах и не затрагиваются.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "o6f7g8h9i53"
down_revision: Union[str, None] = "n5e6f7g8h52"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RETAIL_TABLES = (
    "retail_overdue_logs",
    "retail_payments",
    "retail_payment_schedule",
    "retail_contracts",
    "retail_clients",
    "retail_term_rates",
)

RETAIL_ORGS = "SELECT id FROM organizations WHERE organization_type = 'retail'"
RETAIL_USERS = f"SELECT id FROM users WHERE organization_id IN ({RETAIL_ORGS})"

# Порядок важен: сначала строки, которые ссылаются на пользователей и компанию.
RETAIL_ORG_CLEANUP = (
    f"DELETE FROM audit_logs WHERE organization_id IN ({RETAIL_ORGS}) OR changed_by IN ({RETAIL_USERS})",
    "DELETE FROM expense_payments WHERE expense_id IN "
    f"(SELECT id FROM operating_expenses WHERE organization_id IN ({RETAIL_ORGS})) "
    f"OR created_by IN ({RETAIL_USERS})",
    f"DELETE FROM operating_expenses WHERE organization_id IN ({RETAIL_ORGS})",
    f"DELETE FROM one_time_expenses WHERE organization_id IN ({RETAIL_ORGS})",
    f"DELETE FROM pricing_tiers WHERE organization_id IN ({RETAIL_ORGS})",
    f"DELETE FROM cash_balances WHERE organization_id IN ({RETAIL_ORGS})",
    f"DELETE FROM users WHERE organization_id IN ({RETAIL_ORGS})",
    "DELETE FROM organizations WHERE organization_type = 'retail'",
)


def _columns(inspector: sa.Inspector, table: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    for table in RETAIL_TABLES:
        if table in tables:
            op.drop_table(table)

    # Если на компанию неожиданно ссылается что-то ещё, удаление откатывается
    # целиком, а её пользователи просто теряют доступ: деплой не должен падать.
    try:
        with bind.begin_nested():
            for statement in RETAIL_ORG_CLEANUP:
                bind.execute(sa.text(statement))
    except sa.exc.DBAPIError:
        bind.execute(sa.text(f"UPDATE users SET is_active = false WHERE organization_id IN ({RETAIL_ORGS})"))

    if "investment_amount" in _columns(inspector, "users"):
        with op.batch_alter_table("users") as batch_op:
            batch_op.drop_column("investment_amount")
    if "feature_investors" in _columns(inspector, "organizations"):
        with op.batch_alter_table("organizations") as batch_op:
            batch_op.drop_column("feature_investors")


def downgrade() -> None:
    # Данные товарной рассрочки не восстанавливаются; возвращаем только колонки,
    # чтобы старый код мог стартовать.
    with op.batch_alter_table("organizations") as batch_op:
        batch_op.add_column(
            sa.Column("feature_investors", sa.Boolean(), nullable=False, server_default=sa.true())
        )
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("investment_amount", sa.Numeric(12, 2), nullable=True))
