"""Учётные записи: самостоятельная регистрация компании и занятость логина.

Вход ищет пользователя по email или телефону внутри контура, поэтому один и тот
же логин в двух компаниях одного контура сломал бы вход обоим. Уникальность
проверяем здесь — до записи в базу. Контуры при этом независимы: один и тот же
email может быть логином и в юрфирме, и в товарной рассрочке.
"""

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.models.enums import OrganizationType, UserRole
from app.models.organization import Organization
from app.models.user import User
from app.services.client_duplicates import phones_equivalent
from app.services.organization_defaults import seed_bankruptcy_organization_defaults
from app.services.phone import normalize_phone
from app.services.retail_term_rates import sync_default_term_rates

LOGIN_TAKEN_MESSAGE = "Этот логин уже используется"
LOGIN_REQUIRED_MESSAGE = "Укажите email или телефон"
ORGANIZATION_NAME_MESSAGE = "Укажите название компании"
OWNER_NAME_MESSAGE = "Укажите имя руководителя без цифр"

DEFAULT_OWNER_NAME = "Руководитель"


def normalize_organization_name(value: str) -> str:
    name = " ".join(value.strip().split())
    if len(name) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=ORGANIZATION_NAME_MESSAGE,
        )
    return name


def normalize_owner_name(value: str | None) -> str:
    if value is None or not value.strip():
        return DEFAULT_OWNER_NAME
    name = " ".join(value.strip().split())
    if len(name) < 2 or any(char.isdigit() for char in name):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=OWNER_NAME_MESSAGE,
        )
    return name


def parse_login(login: str) -> tuple[str | None, str | None]:
    """Логин — email или телефон. Возвращает (email, phone) в виде для базы."""
    value = login.strip()
    if "@" in value:
        return value.lower(), None

    digits = normalize_phone(value)
    if len(digits) == 10:
        digits = f"7{digits}"
    if len(digits) != 11 or not digits.startswith("7"):
        return None, None
    return None, f"+{digits}"


def find_user_by_contacts(
    db: Session,
    *,
    organization_type: OrganizationType,
    email: str | None = None,
    phone: str | None = None,
    exclude_user_id: uuid.UUID | None = None,
) -> User | None:
    """Ищет пользователя контура с таким же email или телефоном.

    Сравнение идёт как при входе: email без учёта регистра, телефон по цифрам,
    чтобы +7 и 8 считались одним номером. Пользователей в организации немного,
    поэтому сверяем в Python — так правила совпадают с проверкой входа.
    """
    normalized_email = email.strip().lower() if email and email.strip() else None
    normalized_phone = phone.strip() if phone and phone.strip() else None
    if normalized_email is None and normalized_phone is None:
        return None

    stmt = (
        select(User)
        .join(Organization, Organization.id == User.organization_id)
        .where(Organization.organization_type == organization_type)
    )
    if exclude_user_id is not None:
        stmt = stmt.where(User.id != exclude_user_id)

    for user in db.scalars(stmt):
        if normalized_email and user.email and user.email.strip().lower() == normalized_email:
            return user
        if normalized_phone and user.phone and phones_equivalent(user.phone, normalized_phone):
            return user
    return None


def assert_contacts_available(
    db: Session,
    *,
    organization_type: OrganizationType,
    email: str | None = None,
    phone: str | None = None,
    exclude_user_id: uuid.UUID | None = None,
) -> None:
    existing = find_user_by_contacts(
        db,
        organization_type=organization_type,
        email=email,
        phone=phone,
        exclude_user_id=exclude_user_id,
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=LOGIN_TAKEN_MESSAGE)


def seed_new_organization_defaults(
    db: Session,
    organization_id: uuid.UUID,
    organization_type: OrganizationType,
) -> None:
    """Стартовые тарифы: без них компания не оформит ни одного договора.

    Это шаблон, а не жёсткие правила — компания правит его под себя в «Тарифах».
    """
    if organization_type == OrganizationType.RETAIL:
        sync_default_term_rates(db, organization_id)
        return
    seed_bankruptcy_organization_defaults(db, organization_id)


def register_organization(
    db: Session,
    *,
    organization_name: str,
    login: str,
    password: str,
    owner_name: str | None = None,
    organization_type: OrganizationType = OrganizationType.BANKRUPTCY,
) -> User:
    """Создаёт компанию и её руководителя. Возвращает руководителя."""
    name = normalize_organization_name(organization_name)
    full_name = normalize_owner_name(owner_name)

    email, phone = parse_login(login)
    if email is None and phone is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=LOGIN_REQUIRED_MESSAGE,
        )

    assert_contacts_available(
        db,
        organization_type=organization_type,
        email=email,
        phone=phone,
    )

    organization = Organization(
        id=uuid.uuid4(),
        name=name,
        organization_type=organization_type,
    )
    db.add(organization)
    db.flush()

    owner = User(
        id=uuid.uuid4(),
        organization_id=organization.id,
        full_name=full_name,
        email=email,
        phone=phone,
        password_hash=get_password_hash(password),
        role=UserRole.OWNER,
        is_active=True,
    )
    db.add(owner)

    seed_new_organization_defaults(db, organization.id, organization_type)

    db.commit()
    db.refresh(owner)
    return owner
