from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.services.phone import normalize_phone

DUPLICATE_CLIENT_MESSAGE = "Такой клиент уже есть в базе"
INCOMPLETE_PHONE_MESSAGE = "Укажите полный номер телефона"

STAGE_LABELS = {
    "document_collection": "сбор документов",
    "bankruptcy": "договоры",
}


def duplicate_client_payload(client: Client) -> dict[str, str]:
    """Структурированный 409: текст + id для ссылки на карточку."""
    stage = getattr(client.engagement_stage, "value", str(client.engagement_stage))
    where = STAGE_LABELS.get(stage, stage)
    return {
        "code": "duplicate_client",
        "message": (
            f"Такой клиент уже есть в базе: {client.full_name}, {client.phone} "
            f"(раздел «{where}»)."
        ),
        "client_id": str(client.id),
        "full_name": client.full_name,
        "phone": client.phone,
        "engagement_stage": stage,
    }


def duplicate_client_message(client: Client) -> str:
    return duplicate_client_payload(client)["message"]


def norm_name(value: str) -> str:
    return " ".join(value.strip().lower().split())


def phones_equivalent(left: str, right: str) -> bool:
    normalized_left = normalize_phone(left)
    normalized_right = normalize_phone(right)
    if not normalized_left or not normalized_right:
        return False
    if len(normalized_left) >= 10 and len(normalized_right) >= 10:
        return normalized_left[-10:] == normalized_right[-10:]
    return normalized_left == normalized_right


def phone_has_minimum_digits(phone: str, *, minimum: int = 10) -> bool:
    return len(normalize_phone(phone)) >= minimum


def find_existing_client(
    db: Session,
    *,
    organization_id: UUID,
    phone: str,
    full_name: str,
    exclude_client_id: UUID | None = None,
) -> Client | None:
    if not phone_has_minimum_digits(phone):
        return None

    normalized_name = norm_name(full_name)
    stmt = select(Client).where(
        Client.organization_id == organization_id,
        Client.is_deleted.is_(False),
    )
    if exclude_client_id is not None:
        stmt = stmt.where(Client.id != exclude_client_id)

    for client in db.scalars(stmt):
        if phones_equivalent(client.phone, phone):
            return client
        if normalized_name and norm_name(client.full_name) == normalized_name:
            return client
    return None
