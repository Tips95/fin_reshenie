from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base, Organization, User
from app.models.enums import OrganizationType, UserRole, parse_user_role
from app.services.auth import get_user_by_login


def test_parse_user_role_accepts_name_and_value():
    assert parse_user_role("owner") is UserRole.OWNER
    assert parse_user_role("OWNER") is UserRole.OWNER
    assert parse_user_role(UserRole.MANAGER) is UserRole.MANAGER
    assert parse_user_role("call_center") is UserRole.CALL_CENTER
    assert parse_user_role("CALL_CENTER") is UserRole.CALL_CENTER


def test_login_loads_user_when_role_stored_as_enum_name():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    try:
        organization = Organization(name="Решение", organization_type=OrganizationType.BANKRUPTCY)
        db.add(organization)
        db.flush()
        user = User(
            organization_id=organization.id,
            full_name="Администратор",
            email="admin@reshenie.local",
            password_hash="x",
            role=UserRole.OWNER,
            is_active=True,
        )
        db.add(user)
        db.flush()
        db.execute(text("UPDATE users SET role = 'OWNER' WHERE email = 'admin@reshenie.local'"))
        db.commit()
        db.expire_all()

        loaded = get_user_by_login(db, "admin@reshenie.local")
        assert loaded is not None
        assert loaded.role is UserRole.OWNER
    finally:
        db.close()
        engine.dispose()
