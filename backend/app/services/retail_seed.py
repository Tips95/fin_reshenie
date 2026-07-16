import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.models.enums import OrganizationType, UserRole
from app.models.organization import Organization
from app.models.user import User
from app.services.retail_term_rates import sync_default_term_rates


def seed_retail_organization(db: Session) -> None:
    existing = db.scalar(
        select(Organization).where(Organization.organization_type == OrganizationType.RETAIL).limit(1)
    )
    if existing is not None:
        sync_default_term_rates(db, existing.id)
        db.commit()
        return

    organization = Organization(
        id=uuid.uuid4(),
        name="Товарная рассрочка",
        organization_type=OrganizationType.RETAIL,
    )
    db.add(organization)
    db.flush()

    owner = User(
        id=uuid.uuid4(),
        organization_id=organization.id,
        full_name="Администратор retail",
        email="admin@retail.local",
        phone="+79990000001",
        password_hash=get_password_hash("admin123"),
        role=UserRole.OWNER,
        is_active=True,
    )
    db.add(owner)

    investors = [
        ("Инвестор 1", "investor1@retail.local", "+79991111111"),
        ("Инвестор 2", "investor2@retail.local", "+79992222222"),
        ("Инвестор 3", "investor3@retail.local", "+79993333333"),
    ]
    for full_name, email, phone in investors:
        db.add(
            User(
                id=uuid.uuid4(),
                organization_id=organization.id,
                full_name=full_name,
                email=email,
                phone=phone,
                password_hash=get_password_hash("investor123"),
                role=UserRole.INVESTOR,
                is_active=True,
            )
        )

    sync_default_term_rates(db, organization.id)
    db.commit()
