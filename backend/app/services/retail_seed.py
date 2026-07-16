import os
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.models.enums import OrganizationType, UserRole
from app.models.organization import Organization
from app.models.user import User
from app.services.retail_term_rates import sync_default_term_rates


def _upsert_owner(
    db: Session,
    *,
    organization: Organization,
    email: str,
    password: str,
    full_name: str,
) -> User:
    user = db.scalar(
        select(User).where(
            User.organization_id == organization.id,
            User.email == email,
        )
    )
    password_hash = get_password_hash(password)
    if user is None:
        user = User(
            id=uuid.uuid4(),
            organization_id=organization.id,
            full_name=full_name,
            email=email,
            phone=None,
            password_hash=password_hash,
            role=UserRole.OWNER,
            is_active=True,
        )
        db.add(user)
    else:
        user.full_name = full_name
        user.password_hash = password_hash
        user.role = UserRole.OWNER
        user.is_active = True
    return user


def seed_retail_organization(db: Session) -> None:
    initial_email = os.environ.get("INITIAL_ADMIN_EMAIL", "").strip()
    initial_password = os.environ.get("INITIAL_ADMIN_PASSWORD", "").strip()
    initial_name = os.environ.get("INITIAL_ADMIN_NAME", "Администратор").strip() or "Администратор"
    use_initial_admin = bool(initial_email and initial_password)

    organization = db.scalar(
        select(Organization).where(Organization.organization_type == OrganizationType.RETAIL).limit(1)
    )
    is_new_org = organization is None
    if organization is None:
        organization = Organization(
            id=uuid.uuid4(),
            name="Товарная рассрочка",
            organization_type=OrganizationType.RETAIL,
        )
        db.add(organization)
        db.flush()

    if use_initial_admin:
        _upsert_owner(
            db,
            organization=organization,
            email=initial_email,
            password=initial_password,
            full_name=initial_name,
        )
    elif is_new_org:
        db.add(
            User(
                id=uuid.uuid4(),
                organization_id=organization.id,
                full_name="Администратор retail",
                email="admin@retail.local",
                phone="+79990000001",
                password_hash=get_password_hash("admin123"),
                role=UserRole.OWNER,
                is_active=True,
            )
        )

    investors_count = db.scalar(
        select(func.count())
        .select_from(User)
        .where(
            User.organization_id == organization.id,
            User.role == UserRole.INVESTOR,
        )
    )
    if not investors_count:
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

    if use_initial_admin:
        print(f"Owner ready for retail workspace: {initial_email}")
