"""Phone and date helpers."""

import re
from datetime import date

from dateutil.relativedelta import relativedelta


def normalize_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value.strip())
    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    return digits


def month_bounds(month: str) -> tuple[date, date]:
    """YYYY-MM -> [first day, last day] of month."""
    year, month_num = month.split("-")
    start = date(int(year), int(month_num), 1)
    end = start + relativedelta(months=1) - relativedelta(days=1)
    return start, end
