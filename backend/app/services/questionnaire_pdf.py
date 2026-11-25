from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from fpdf import FPDF
from sqlalchemy.orm import Session

from app.models.client_questionnaire import ClientQuestionnaire
from app.models.pricing_tier import PricingTier

FONTS_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
FONT_REGULAR = FONTS_DIR / "DejaVuSans.ttf"
FONT_BOLD = FONTS_DIR / "DejaVuSans-Bold.ttf"

MONTHS_RU = (
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
)

ROSSELKHOZ_NOTE = (
    "Внимание: если выплаты поступают на счет в Россельхозбанке, необходимо "
    "в кратчайшие сроки обеспечить перевод зачислений в другой банк."
)


ABSENT = "Отсутствует"
NEGATIVE_FAMILY = {
    "нет",
    "отсутствует",
    "не состоял",
    "не состояла",
    "не был",
    "не была",
}


def _text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, Decimal):
        quantized = value.quantize(Decimal("1")) if value == value.to_integral() else value
        return f"{quantized}"
    return str(value).strip()


def display_or_absent(value: Any) -> str:
    return _text(value) or ABSENT


def _yes_no(value: bool | None) -> str:
    if value is True:
        return "ДА [x] / НЕТ [ ]"
    if value is False:
        return "ДА [ ] / НЕТ [x]"
    return "ДА [ ] / НЕТ [ ]"


def _reset(pdf: QuestionnairePDF) -> None:
    pdf.set_x(pdf.l_margin)


def _wrap(pdf: QuestionnairePDF, text: str, height: float = 5) -> None:
    _reset(pdf)
    pdf.multi_cell(pdf.epw, height, text)


def _format_filled_date(value: date | None) -> str:
    if value is None:
        return "Дата составления «___» __________ 20__ г."
    return f"Дата составления «{value.day}» {MONTHS_RU[value.month - 1]} {value.year} г."


class QuestionnairePDF(FPDF):
    def __init__(self) -> None:
        super().__init__(orientation="P", unit="mm", format="A4")
        if not FONT_REGULAR.exists() or not FONT_BOLD.exists():
            raise FileNotFoundError("Не найдены шрифты DejaVu для PDF анкеты")
        self.add_font("DejaVu", "", str(FONT_REGULAR))
        self.add_font("DejaVu", "B", str(FONT_BOLD))
        self.set_auto_page_break(auto=True, margin=10)
        self.set_margins(12, 8, 12)

    def header(self) -> None:
        if self.page_no() == 1:
            return
        self.set_font("DejaVu", "B", 9)
        self.cell(0, 6, "АНКЕТА КЛИЕНТА", align="C", new_x="LMARGIN", new_y="NEXT")
        self.ln(1)


def _draw_line_field(pdf: QuestionnairePDF, label: str, value: str, width: float) -> None:
    if width >= pdf.epw - 1:
        _reset(pdf)
    pdf.set_font("DejaVu", "B", 8)
    label_width = pdf.get_string_width(f"{label} ") + 1
    pdf.cell(label_width, 6, f"{label} ")
    pdf.set_font("DejaVu", "", 8)
    x = pdf.get_x()
    y = pdf.get_y()
    field_width = max(width - label_width, 8)
    fitted = value
    while fitted and pdf.get_string_width(fitted) > field_width - 1:
        fitted = fitted[:-1]
    pdf.cell(field_width, 6, fitted)
    pdf.line(x, y + 5.2, x + field_width, y + 5.2)


def _section_title(pdf: QuestionnairePDF, title: str) -> None:
    pdf.ln(1.5)
    _reset(pdf)
    pdf.set_font("DejaVu", "B", 9)
    pdf.cell(0, 6, title, new_x="LMARGIN", new_y="NEXT")


def _parse_amount(value: Any) -> Decimal:
    if value is None or value == "":
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    if isinstance(value, (int, float)):
        return Decimal(str(value))
    text = str(value).replace("\u00a0", "").replace(" ", "").replace(",", ".")
    try:
        return Decimal(text)
    except (InvalidOperation, ValueError):
        return Decimal("0")


def _format_money_short(amount: Decimal) -> str:
    quantized = amount.quantize(Decimal("1")) if amount == amount.to_integral() else amount.quantize(
        Decimal("0.01")
    )
    text = f"{quantized:,.2f}".replace(",", " ").replace(".", ",")
    if text.endswith(",00"):
        text = text[:-3]
    return f"{text} р."


def debts_total(item: ClientQuestionnaire) -> Decimal:
    total = Decimal("0")
    for row in item.debts or []:
        if not isinstance(row, dict):
            continue
        total += _parse_amount(row.get("debt_amount"))
    return total


def schedule_amounts_from_tier(tier: PricingTier) -> list[Decimal]:
    remaining = [tier.remaining_month_payment] * int(tier.remaining_months_count or 0)
    return [tier.first_month_payment, tier.second_month_payment, *remaining]


def _resolve_schedule_tier(
    db: Session,
    item: ClientQuestionnaire,
) -> PricingTier | None:
    """Тариф для графика: по сумме долгов, иначе по стоимости услуги = total_cost тарифа."""
    from app.services.access import find_pricing_tier, list_current_pricing_tiers

    as_of = item.filled_date or date.today()
    debt = debts_total(item)
    if debt > 0:
        tier = find_pricing_tier(
            db,
            organization_id=item.organization_id,
            debt_amount=debt,
            contract_date=as_of,
        )
        if tier is not None:
            return tier

    service_cost = _parse_amount(item.service_cost)
    if service_cost <= 0:
        return None
    for tier in list_current_pricing_tiers(
        db, organization_id=item.organization_id, today=as_of
    ):
        if tier.total_cost == service_cost or tier.total_cost.quantize(
            Decimal("1")
        ) == service_cost.quantize(Decimal("1")):
            return tier
    return None


def _manual_schedule_amounts(item: ClientQuestionnaire) -> list[Decimal]:
    rows = item.installment_schedule or []
    parsed: list[tuple[int, Decimal]] = []
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            continue
        month = int(row.get("month") or index)
        amount = _parse_amount(row.get("amount"))
        if amount < 0:
            continue
        parsed.append((month, amount))
    parsed.sort(key=lambda item: item[0])
    return [amount for _, amount in parsed]


def _resolve_installment_amounts(
    item: ClientQuestionnaire,
    db: Session | None,
) -> tuple[list[Decimal], Decimal, str] | None:
    """Возвращает (суммы по месяцам, итог, подпись режима) или None."""
    mode = (getattr(item, "installment_mode", None) or "auto").strip().lower()
    if mode == "manual":
        amounts = _manual_schedule_amounts(item)
        if amounts:
            return amounts, sum(amounts, Decimal("0")), "вручную"
    if db is None:
        return None
    tier = _resolve_schedule_tier(db, item)
    if tier is None:
        return None
    return schedule_amounts_from_tier(tier), tier.total_cost, "по прайсу"


def _estimate_schedule_height(month_count: int) -> float:
    """Высота блока графика: заголовок + одна или две полосы карточек."""
    cols = min(month_count, 8) if month_count else 1
    rows = 1 if month_count <= 8 else 2
    card_h = 28.0 if month_count <= 10 else 24.0
    return 6.0 + 5.0 + rows * (card_h + 1.5) + 2.0


def _draw_installment_card(
    pdf: QuestionnairePDF,
    *,
    x: float,
    y: float,
    width: float,
    height: float,
    month: int,
    amount: Decimal,
    peak: Decimal,
) -> None:
    """Карточка месяца в стиле PriceQuote: столбик + сумма + «N-й мес.»."""
    pdf.set_draw_color(180, 180, 180)
    pdf.set_fill_color(245, 245, 245)
    pdf.set_line_width(0.2)
    pdf.rect(x, y, width, height, style="DF")

    bar_max = height - 14.0
    ratio = float(amount / peak) if peak > 0 else 0.0
    bar_h = max(3.0, bar_max * max(0.12, min(1.0, ratio)))
    bar_w = min(4.5, width * 0.28)
    bar_x = x + (width - bar_w) / 2
    bar_y = y + 3.0 + (bar_max - bar_h)
    pdf.set_fill_color(209, 16, 29)  # brand-600
    pdf.rect(bar_x, bar_y, bar_w, bar_h, style="F")

    pdf.set_text_color(30, 30, 30)
    pdf.set_font("DejaVu", "B", 7)
    amount_label = _format_money_short(amount)
    while amount_label and pdf.get_string_width(amount_label) > width - 2:
        amount_label = amount_label[:-1]
    pdf.set_xy(x, y + height - 10.5)
    pdf.cell(width, 4, amount_label, align="C")

    pdf.set_font("DejaVu", "", 6)
    pdf.set_text_color(110, 110, 110)
    pdf.set_xy(x, y + height - 6.5)
    pdf.cell(width, 4, f"{month}-й мес.", align="C")
    pdf.set_text_color(0, 0, 0)


def _draw_installment_schedule_block(
    pdf: QuestionnairePDF,
    *,
    amounts: list[Decimal],
    usable: float,
    total: Decimal,
    mode_label: str,
) -> None:
    """График рассрочки карточками — как на сайте в PriceQuote."""
    if not amounts:
        return
    peak = max(amounts) if amounts else Decimal("1")
    pdf.ln(2)
    _reset(pdf)
    pdf.set_draw_color(200, 200, 200)
    pdf.set_line_width(0.3)
    y0 = pdf.get_y()
    pdf.line(pdf.l_margin, y0, pdf.l_margin + usable, y0)
    pdf.ln(2.5)

    pdf.set_font("DejaVu", "B", 9)
    _reset(pdf)
    pdf.cell(0, 5, f"График рассрочки ({mode_label})", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("DejaVu", "", 7.5)
    pdf.cell(
        0,
        4.5,
        f"Итого {_format_money_short(total)} · {len(amounts)} мес.",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.ln(1)

    gap = 1.6
    # До 8 карточек в ряд; иначе две полосы — как на сайте grid auto-fill.
    per_row = 8 if len(amounts) > 8 else max(len(amounts), 1)
    rows: list[list[tuple[int, Decimal]]] = []
    indexed = list(enumerate(amounts, start=1))
    for start in range(0, len(indexed), per_row):
        rows.append(indexed[start : start + per_row])

    card_h = 28.0 if len(amounts) <= 10 else 24.0
    for row in rows:
        n = len(row)
        card_w = (usable - gap * (n - 1)) / n
        y = pdf.get_y()
        for col, (month, amount) in enumerate(row):
            x = pdf.l_margin + col * (card_w + gap)
            _draw_installment_card(
                pdf,
                x=x,
                y=y,
                width=card_w,
                height=card_h,
                month=month,
                amount=amount,
                peak=peak,
            )
        pdf.set_y(y + card_h + gap)
    pdf.set_draw_color(0, 0, 0)
    pdf.set_line_width(0.2)


def _draw_installment_for_item(
    pdf: QuestionnairePDF,
    item: ClientQuestionnaire,
    *,
    db: Session | None,
    usable: float,
) -> None:
    resolved = _resolve_installment_amounts(item, db)
    if resolved is None:
        return
    amounts, total, mode_label = resolved
    # Внизу листа: не уводим на 2-ю страницу из‑за графика.
    needed = _estimate_schedule_height(len(amounts))
    page_bottom = pdf.h - pdf.b_margin
    remaining = page_bottom - pdf.get_y()
    if remaining > needed + 4:
        # Прижать к низу пустоты, но оставить небольшой зазор.
        pdf.set_y(max(pdf.get_y() + 2, page_bottom - needed - 2))
    pdf.set_auto_page_break(auto=False)
    try:
        _draw_installment_schedule_block(
            pdf,
            amounts=amounts,
            usable=usable,
            total=total,
            mode_label=mode_label,
        )
    finally:
        pdf.set_auto_page_break(auto=True, margin=10)


def build_questionnaire_pdf(
    item: ClientQuestionnaire,
    db: Session | None = None,
) -> bytes:
    pdf = QuestionnairePDF()
    pdf.add_page()
    pdf.set_font("DejaVu", "B", 13)
    pdf.cell(0, 8, "АНКЕТА КЛИЕНТА", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    usable = pdf.epw
    _draw_line_field(pdf, "ФИО:", _text(item.full_name), usable)
    pdf.ln(5)
    left = usable * 0.48
    right = usable - left
    start_x = pdf.get_x()
    start_y = pdf.get_y()
    _draw_line_field(pdf, "Стоимость:", _text(item.service_cost), left)
    pdf.set_xy(start_x + left + 2, start_y)
    _draw_line_field(pdf, "Номер телефона:", _text(item.phone), right - 2)
    pdf.ln(5)

    _draw_line_field(pdf, "Регион регистрации:", _text(item.registration_region), usable)
    pdf.ln(5)

    _section_title(pdf, "Обязательства должника")
    debts = item.debts or []
    headers = ["№", "Кредитор", "Дата возникновения", "Ежемесячный платеж", "Дата начала просрочек", "Долг"]
    col_widths = [8, 48, 32, 32, 38, usable - 8 - 48 - 32 - 32 - 38]
    pdf.set_font("DejaVu", "B", 6.5)
    for header, width in zip(headers, col_widths):
        pdf.cell(width, 6, header, border=1, align="C")
    pdf.ln()
    pdf.set_font("DejaVu", "", 7)
    rows = debts[: max(4, len(debts))]
    if len(rows) < 4:
        rows = rows + [{}] * (4 - len(rows))
    for index, row in enumerate(rows, start=1):
        values = [
            str(index),
            _text(row.get("creditor")),
            _text(row.get("origin_date")),
            _text(row.get("monthly_payment")),
            _text(row.get("overdue_start_date")),
            _text(row.get("debt_amount")),
        ]
        for value, width in zip(values, col_widths):
            pdf.cell(width, 6, value[:42], border=1)
        pdf.ln()

    pdf.ln(2)
    pdf.set_font("DejaVu", "", 8)
    _wrap(
        pdf,
        "Предоставлялись ли поддельные/недостоверные справки о доходах (2-НДФЛ и др.) "
        f"при оформлении кредитов?  {_yes_no(item.fake_income_documents)}",
    )
    _draw_line_field(pdf, "В каких кредитных организациях открыты счета:", _text(item.bank_accounts), usable)
    pdf.ln(6)
    married = item.is_married is True
    divorce_text = _text(item.divorce_info)
    divorced = (not married) and bool(divorce_text) and divorce_text.lower() not in NEGATIVE_FAMILY
    show_spouse_property = married or divorced
    pdf.set_font("DejaVu", "", 8)
    pdf.cell(usable * 0.55, 5, f"Наличие поручительства/залога  {_yes_no(item.has_guarantee_or_collateral)}")
    pdf.cell(0, 5, f"Наличие зарегистрированного брака  {_yes_no(item.is_married)}", new_x="LMARGIN", new_y="NEXT")
    if not married:
        _draw_line_field(pdf, "Расторгнут:", _text(item.divorce_info) or "Нет", usable)
        pdf.ln(6)
    _draw_line_field(pdf, "Дети / иждивенцы:", _text(item.dependents), usable)
    pdf.ln(6)
    if married:
        start_x = pdf.get_x()
        start_y = pdf.get_y()
        _draw_line_field(pdf, "Доходы: Должник", _text(item.income_debtor), left)
        pdf.set_xy(start_x + left + 2, start_y)
        _draw_line_field(pdf, "Супруг(а)", _text(item.income_spouse), right - 2)
        pdf.ln(6)
    else:
        _draw_line_field(pdf, "Доходы: Должник", _text(item.income_debtor), usable)
        pdf.ln(6)
    _draw_line_field(
        pdf,
        "Куда на текущую дату поступают (ЗП, пенсия, пособия):",
        _text(item.income_destination),
        usable,
    )
    pdf.ln(7)
    pdf.set_font("DejaVu", "B", 7.5)
    _wrap(pdf, ROSSELKHOZ_NOTE, 4.2)

    _section_title(pdf, "Имущество в собственности")
    pdf.set_font("DejaVu", "B", 8)
    _reset(pdf)
    pdf.cell(0, 5, "Имущество должника:", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("DejaVu", "", 8)
    _wrap(pdf, display_or_absent(getattr(item, "property_debtor", None)))
    if show_spouse_property:
        pdf.set_font("DejaVu", "B", 8)
        _reset(pdf)
        pdf.cell(
            0,
            5,
            "Имущество бывшего супруга(и):" if divorced else "Имущество супруга(и):",
            new_x="LMARGIN",
            new_y="NEXT",
        )
        pdf.set_font("DejaVu", "", 8)
        _wrap(pdf, display_or_absent(getattr(item, "property_spouse", None)))

    pdf.ln(1.5)
    pdf.set_font("DejaVu", "", 8)
    _wrap(
        pdf,
        f"Обременение в отношении имущества (залог, арест)  {_yes_no(item.has_property_encumbrance)}  "
        f"{_text(item.property_encumbrance_details)}",
    )
    deals_label = (
        "Сделки за последние 3 года с имуществом, включая супруга(и):"
        if show_spouse_property
        else "Сделки за последние 3 года с имуществом:"
    )
    _wrap(
        pdf,
        f"{deals_label}  {_yes_no(item.has_recent_property_deals)}  "
        f"{_text(item.recent_property_deals_details)}",
    )

    _section_title(pdf, "Наличие оружия")
    pdf.set_font("DejaVu", "", 8)
    _wrap(
        pdf,
        f"Наличие оружия  {_yes_no(getattr(item, 'has_weapon', None))}  "
        f"{_text(getattr(item, 'weapon_details', None))}",
    )

    pdf.ln(2)
    pdf.set_font("DejaVu", "B", 8)
    _reset(pdf)
    pdf.cell(0, 5, "Примечание:", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("DejaVu", "", 8)
    notes = _text(item.notes) or " "
    _wrap(pdf, notes)
    pdf.ln(4)
    pdf.set_font("DejaVu", "", 8)
    pdf.cell(usable * 0.62, 6, _format_filled_date(item.filled_date))
    pdf.cell(0, 6, "Подпись клиента _______________", new_x="LMARGIN", new_y="NEXT")

    # График внизу листа — заполняет пустоту под подписью, в стиле карточек на сайте.
    _draw_installment_for_item(pdf, item, db=db, usable=usable)

    return bytes(pdf.output())
