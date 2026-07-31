import os
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.models.enums import OrganizationType, UserRole
from app.models.organization import Organization
from app.models.user import User
from app.services.organization_defaults import seed_all_bankruptcy_organization_defaults
from app.services.retail_seed import _upsert_owner, seed_retail_organization


def _initial_admin_organization(db: Session, email: str) -> Organization | None:
    """Компания начального администратора: та, где он уже есть.

    После появления самостоятельной регистрации компаний в базе несколько, и
    «первая подходящая» больше не годится — админа нельзя случайно завести
    в компанию клиента. Если такого пользователя ещё нет, берём самую старую
    компанию: это компания владельца установки.
    """
    existing = db.scalar(
        select(User)
        .join(Organization, Organization.id == User.organization_id)
        .where(
            Organization.organization_type == OrganizationType.BANKRUPTCY,
            User.email == email,
        )
        .limit(1)
    )
    if existing is not None:
        return db.get(Organization, existing.organization_id)

    return db.scalar(
        select(Organization)
        .where(Organization.organization_type == OrganizationType.BANKRUPTCY)
        .order_by(Organization.created_at.asc())
        .limit(1)
    )


def upsert_initial_admin(db: Session) -> bool:
    email = os.environ.get("INITIAL_ADMIN_EMAIL", "").strip()
    password = os.environ.get("INITIAL_ADMIN_PASSWORD", "").strip()
    full_name = os.environ.get("INITIAL_ADMIN_NAME", "Администратор").strip() or "Администратор"

    if not email or not password:
        return False

    organization = _initial_admin_organization(db, email)
    if organization is None:
        organization = Organization(
            id=uuid.uuid4(),
            name="Решение Финансы",
            organization_type=OrganizationType.BANKRUPTCY,
        )
        db.add(organization)
        db.flush()

    _upsert_owner(
        db,
        organization=organization,
        email=email,
        password=password,
        full_name=full_name,
    )

    db.commit()
    print(f"Owner ready for legal workspace: {email} (organization: {organization.name})")
    return True


def seed_demo_user(db: Session) -> None:
    """Создаёт организации и пользователей при первом запуске."""
    if upsert_initial_admin(db):
        seed_retail_organization(db)
    elif db.scalar(select(User).limit(1)) is not None:
        org = db.scalar(select(Organization).limit(1))
        if org is not None and getattr(org, "organization_type", None) is None:
            org.organization_type = OrganizationType.BANKRUPTCY
        seed_retail_organization(db)
    else:
        organization = Organization(
            id=uuid.uuid4(),
            name="Решение Финансы",
            organization_type=OrganizationType.BANKRUPTCY,
        )
        db.add(organization)
        db.flush()

        user = User(
            id=uuid.uuid4(),
            organization_id=organization.id,
            full_name="Администратор",
            email="admin@reshenie.local",
            phone="+79990000000",
            password_hash=get_password_hash("admin123"),
            role=UserRole.OWNER,
            is_active=True,
        )
        db.add(user)
        db.commit()
        seed_retail_organization(db)

    seed_all_bankruptcy_organization_defaults(db)
    db.commit()


def main() -> None:
    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        seed_demo_user(db)
        if os.environ.get("INITIAL_ADMIN_EMAIL"):
            print("Seed completed with INITIAL_ADMIN_EMAIL")
        else:
            print("Seed completed: admin@reshenie.local / admin123")
    finally:
        db.close()


if __name__ == "__main__":
    main()
