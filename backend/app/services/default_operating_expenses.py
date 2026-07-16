"""Ежемесячные обязательные расходы компании «Решение»."""

from decimal import Decimal

from app.models.enums import ExpenseCategory, ExpenseGroup

DEFAULT_OPERATING_EXPENSES: list[dict] = [
    {"name": "Ииев Ризван", "category": ExpenseCategory.SALARY, "expense_group": ExpenseGroup.SALARY_PROJECT, "amount": Decimal("30000.00"), "pay_day": 10, "sort_order": 1},
    {"name": "Якубов Амарбек", "category": ExpenseCategory.SALARY, "expense_group": ExpenseGroup.SALARY_PROJECT, "amount": Decimal("30000.00"), "pay_day": 10, "sort_order": 2},
    {"name": "Залиха", "category": ExpenseCategory.SALARY, "expense_group": ExpenseGroup.SALARY_PROJECT, "amount": Decimal("20000.00"), "pay_day": 10, "sort_order": 3},
    {"name": "Юнусов Магомед", "category": ExpenseCategory.SALARY, "expense_group": ExpenseGroup.SALARY_PROJECT, "amount": Decimal("50000.00"), "pay_day": 10, "sort_order": 4},
    {"name": "Дербишев Рустам", "category": ExpenseCategory.SALARY, "expense_group": ExpenseGroup.SALARY_PROJECT, "amount": Decimal("30000.00"), "pay_day": 10, "sort_order": 5},
    {"name": "Дербишов Байсангур", "category": ExpenseCategory.SALARY, "expense_group": ExpenseGroup.SALARY_PROJECT, "amount": Decimal("20000.00"), "pay_day": 10, "sort_order": 6},
    {"name": "Селима", "category": ExpenseCategory.SALARY, "expense_group": ExpenseGroup.SALARY_PROJECT, "amount": Decimal("35000.00"), "pay_day": 10, "sort_order": 7},
    {"name": "Ислам", "category": ExpenseCategory.SALARY, "expense_group": ExpenseGroup.SALARY_PROJECT, "amount": Decimal("75000.00"), "pay_day": 10, "sort_order": 8},
    {"name": "Аренда помещения", "category": ExpenseCategory.RENT, "expense_group": ExpenseGroup.PRODUCTION, "amount": Decimal("100000.00"), "sort_order": 9},
    {"name": "Интернет", "category": ExpenseCategory.UTILITIES, "expense_group": ExpenseGroup.PRODUCTION, "amount": Decimal("5000.00"), "sort_order": 10},
    {"name": "ЖКХ", "category": ExpenseCategory.UTILITIES, "expense_group": ExpenseGroup.PRODUCTION, "amount": Decimal("5000.00"), "sort_order": 11},
    {"name": "Уборка", "category": ExpenseCategory.OTHER, "expense_group": ExpenseGroup.PRODUCTION, "amount": Decimal("15000.00"), "sort_order": 12},
    {"name": "Малика (юрист, 20% оклад)", "category": ExpenseCategory.SALARY, "expense_group": ExpenseGroup.SALARY_PROJECT, "amount": Decimal("20000.00"), "pay_day": 10, "sort_order": 13},
]
