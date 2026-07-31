"""Ежемесячные статьи расходов — нейтральный стартовый шаблон.

Имен сотрудников и сумм конкретной компании здесь нет: у каждой организации
свой список в разделе «Расходы». Существующие данные на проде не меняются —
шаблон применяется только при создании новой компании или если расходов ещё нет.
"""

from decimal import Decimal

from app.models.enums import ExpenseCategory, ExpenseGroup

DEFAULT_OPERATING_EXPENSES: list[dict] = [
    {
        "name": "Аренда помещения",
        "category": ExpenseCategory.RENT,
        "expense_group": ExpenseGroup.PRODUCTION,
        "amount": Decimal("0.00"),
        "sort_order": 1,
    },
    {
        "name": "Коммунальные услуги",
        "category": ExpenseCategory.UTILITIES,
        "expense_group": ExpenseGroup.PRODUCTION,
        "amount": Decimal("0.00"),
        "sort_order": 2,
    },
    {
        "name": "Связь и интернет",
        "category": ExpenseCategory.UTILITIES,
        "expense_group": ExpenseGroup.PRODUCTION,
        "amount": Decimal("0.00"),
        "sort_order": 3,
    },
    {
        "name": "ФОТ / зарплаты",
        "category": ExpenseCategory.SALARY,
        "expense_group": ExpenseGroup.SALARY_PROJECT,
        "amount": Decimal("0.00"),
        "pay_day": 10,
        "sort_order": 4,
    },
    {
        "name": "Маркетинг",
        "category": ExpenseCategory.MARKETING,
        "expense_group": ExpenseGroup.PRODUCTION,
        "amount": Decimal("0.00"),
        "sort_order": 5,
    },
    {
        "name": "Прочие расходы",
        "category": ExpenseCategory.OTHER,
        "expense_group": ExpenseGroup.PRODUCTION,
        "amount": Decimal("0.00"),
        "sort_order": 6,
    },
]
