from __future__ import annotations

from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any

from fpdf import FPDF

from app.models.client_questionnaire import ClientQuestionnaire

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


def build_questionnaire_pdf(item: ClientQuestionnaire) -> bytes:
    pdf = QuestionnairePDF()
    pdf.add_page()
    pdf.set_font("DejaVu", "B", 13)
    pdf.cell(0, 8, "АНКЕТА КЛИЕНТА", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    usable = pdf.epw
    _draw_line_field(pdf, "ФИО:", _text(item.full_name), usable)
    pdf.ln(6)
    left = usable * 0.48
    right = usable - left
    start_x = pdf.get_x()
    start_y = pdf.get_y()
    _draw_line_field(pdf, "Стоимость:", _text(item.service_cost), left)
    pdf.set_xy(start_x + left + 2, start_y)
    _draw_line_field(pdf, "Номер телефона:", _text(item.phone), right - 2)
    pdf.ln(6)
    _draw_line_field(pdf, "Регион регистрации:", _text(item.registration_region), usable)
    pdf.ln(7)

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
    return bytes(pdf.output())
