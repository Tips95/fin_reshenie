import os
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.models.enums import OrganizationType, UserRole
from app.models.organization import Organization
from app.models.user import User
from app.services.retail_seed import seed_retail_organization


def upsert_initial_admin(db: Session) -> bool:
    email = os.environ.get("INITIAL_ADMIN_EMAIL", "").strip()
    password = os.environ.get("INITIAL_ADMIN_PASSWORD", "").strip()
    full_name = os.environ.get("INITIAL_ADMIN_NAME", "Администратор").strip() or "Администратор"

    if not email or not password:
        return False

    organization = db.scalar(
        select(Organization)
        .where(Organization.organization_type == OrganizationType.BANKRUPTCY)
        .limit(1)
    )
    if organization is None:
        organization = Organization(
            id=uuid.uuid4(),
            name="Решение",
            organization_type=OrganizationType.BANKRUPTCY,
        )
        db.add(organization)
        db.flush()

    user = db.scalar(
        select(User).where(
            User.organization_id == organization.id,
            User.email == email,
        )
    )
    if user is None:
        user = User(
            id=uuid.uuid4(),
            organization_id=organization.id,
            full_name=full_name,
            email=email,
            phone=None,
            password_hash=get_password_hash(password),
            role=UserRole.OWNER,
            is_active=True,
        )
        db.add(user)
    else:
        user.full_name = full_name
        user.password_hash = get_password_hash(password)
        user.role = UserRole.OWNER
        user.is_active = True

    db.commit()
    print(f"Owner ready for legal workspace: {email}")
    return True


def seed_demo_user(db: Session) -> None:
    """Создаёт организации и пользователей при первом запуске."""
    if upsert_initial_admin(db):
        seed_retail_organization(db)
        return

    existing = db.scalar(select(User).limit(1))
    if existing is not None:
        org = db.scalar(select(Organization).limit(1))
        if org is not None and getattr(org, "organization_type", None) is None:
            org.organization_type = OrganizationType.BANKRUPTCY
        seed_retail_organization(db)
        return

    organization = Organization(
        id=uuid.uuid4(),
        name="Решение",
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
