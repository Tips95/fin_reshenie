from __future__ import annotations

from typing import Any


def _as_dict(item: Any) -> dict[str, Any]:
    if item is None:
        return {}
    if hasattr(item, "model_dump"):
        return item.model_dump()
    if isinstance(item, dict):
        return item
    return {}

ASSET_ITEMS: tuple[tuple[str, str], ...] = (
    ("land", "Земельный участок"),
    ("house", "Дом"),
    ("apartment", "Квартира"),
    ("vehicle", "Транспортное средство/Спецтехника"),
    ("weapon", "Оружие"),
    ("land_lease", "Аренда земельного участка"),
)

DOCUMENT_ITEMS: tuple[tuple[str, str], ...] = (
    ("mfc", "Документы МФЦ"),
    ("loan_agreements", "Кредитные договора"),
    ("debt_certificate", "Справка о задолженности"),
    ("accounts_certificate", "Справка о наличии счетов"),
    ("account_statements", "Выписки по счетам"),
    ("family_composition", "Состав семьи"),
    ("employment_ndfl", "Трудовая книжка/2-НДФЛ"),
    ("inn_snils", "ИНН/СНИЛС"),
    ("marriage_divorce", "Св-во о заключении/расторжении/справка №15"),
    ("children_birth", "Св-во о рождении детей"),
    ("passports", "Паспорта"),
)

EMPTY_DEBT_ROW: dict[str, Any] = {
    "creditor": "",
    "origin_date": None,
    "monthly_payment": "",
    "overdue_start_date": None,
    "debt_amount": "",
}


def empty_debts(rows: int = 4) -> list[dict[str, Any]]:
    return [dict(EMPTY_DEBT_ROW) for _ in range(rows)]


def empty_assets() -> list[dict[str, Any]]:
    return [
        {"key": key, "label": label, "debtor": None, "spouse": None}
        for key, label in ASSET_ITEMS
    ]


def empty_documents() -> list[dict[str, Any]]:
    return [
        {"key": key, "label": label, "collected": False, "extra_info": ""}
        for key, label in DOCUMENT_ITEMS
    ]


def merge_assets(payload: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    by_key = {item.get("key"): item for item in (_as_dict(row) for row in payload or []) if item.get("key")}
    merged: list[dict[str, Any]] = []
    for key, label in ASSET_ITEMS:
        existing = by_key.get(key) or {}
        merged.append(
            {
                "key": key,
                "label": label,
                "debtor": existing.get("debtor"),
                "spouse": existing.get("spouse"),
            }
        )
    return merged


def merge_documents(payload: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    by_key = {item.get("key"): item for item in (_as_dict(row) for row in payload or []) if item.get("key")}
    merged: list[dict[str, Any]] = []
    for key, label in DOCUMENT_ITEMS:
        existing = by_key.get(key) or {}
        merged.append(
            {
                "key": key,
                "label": label,
                "collected": bool(existing.get("collected")),
                "extra_info": str(existing.get("extra_info") or ""),
            }
        )
    return merged


def normalize_debts(payload: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    rows = payload or []
    normalized: list[dict[str, Any]] = []
    for raw in rows:
        item = _as_dict(raw)
        normalized.append(
            {
                "creditor": str(item.get("creditor") or ""),
                "origin_date": item.get("origin_date") or None,
                "monthly_payment": str(item.get("monthly_payment") or ""),
                "overdue_start_date": item.get("overdue_start_date") or None,
                "debt_amount": str(item.get("debt_amount") or ""),
            }
        )
    while len(normalized) < 4:
        normalized.append(dict(EMPTY_DEBT_ROW))
    return normalized
