import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import verify_password
from app.models import Base, OperatingExpense, Organization, PricingTier, RetailTermRate, User
from app.models.enums import OrganizationType, UserRole
from app.services.accounts import (
    LOGIN_TAKEN_MESSAGE,
    assert_contacts_available,
    find_user_by_contacts,
    parse_login,
    register_organization,
)


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


class TestParseLogin:
    def test_email_lowercased(self):
        assert parse_login("  Director@Company.RU ") == ("director@company.ru", None)

    def test_phone_with_eight_prefix(self):
        assert parse_login("8 (928) 643-32-30") == (None, "+79286433230")

    def test_phone_without_country_code(self):
        assert parse_login("9286433230") == (None, "+79286433230")

    def test_incomplete_phone_is_rejected(self):
        assert parse_login("928 643") == (None, None)


class TestRegisterOrganization:
    def test_creates_organization_with_owner(self, db):
        owner = register_organization(
            db,
            organization_name="  ООО   Первая  ",
            login="Director@First.ru",
            password="secret123",
            owner_name="Иванов Иван",
        )

        assert owner.role == UserRole.OWNER
        assert owner.is_active is True
        assert owner.email == "director@first.ru"
        assert owner.full_name == "Иванов Иван"
        assert verify_password("secret123", owner.password_hash) is True

        organization = db.get(Organization, owner.organization_id)
        assert organization.name == "ООО Первая"
        assert organization.organization_type == OrganizationType.BANKRUPTCY

    def test_phone_login_is_normalized(self, db):
        owner = register_organization(
            db,
            organization_name="Вторая",
            login="8 928 643-32-30",
            password="secret123",
        )

        assert owner.phone == "+79286433230"
        assert owner.email is None
        assert owner.full_name == "Руководитель"

    def test_seeds_pricing_tiers_for_new_company(self, db):
        owner = register_organization(
            db,
            organization_name="Третья",
            login="third@company.ru",
            password="secret123",
        )

        tiers = db.scalar(
            select(func.count())
            .select_from(PricingTier)
            .where(PricingTier.organization_id == owner.organization_id)
        )
        assert tiers > 0

    def test_rejects_taken_email(self, db):
        register_organization(
            db,
            organization_name="Первая",
            login="same@company.ru",
            password="secret123",
        )

        with pytest.raises(HTTPException) as error:
            register_organization(
                db,
                organization_name="Вторая",
                login="SAME@company.ru",
                password="secret123",
            )

        assert error.value.status_code == 409
        assert error.value.detail == LOGIN_TAKEN_MESSAGE

    def test_rejects_same_phone_in_other_format(self, db):
        register_organization(
            db,
            organization_name="Первая",
            login="+79286433230",
            password="secret123",
        )

        with pytest.raises(HTTPException) as error:
            register_organization(
                db,
                organization_name="Вторая",
                login="89286433230",
                password="secret123",
            )

        assert error.value.status_code == 409

    def test_rolls_back_nothing_on_taken_login(self, db):
        register_organization(
            db,
            organization_name="Первая",
            login="same@company.ru",
            password="secret123",
        )

        with pytest.raises(HTTPException):
            register_organization(
                db,
                organization_name="Вторая",
                login="same@company.ru",
                password="secret123",
            )

        organizations = db.scalar(select(func.count()).select_from(Organization))
        assert organizations == 1

    def test_rejects_short_organization_name(self, db):
        with pytest.raises(HTTPException) as error:
            register_organization(
                db,
                organization_name=" А ",
                login="short@company.ru",
                password="secret123",
            )

        assert error.value.status_code == 422

    def test_rejects_owner_name_with_digits(self, db):
        with pytest.raises(HTTPException) as error:
            register_organization(
                db,
                organization_name="Компания",
                login="digits@company.ru",
                password="secret123",
                owner_name="Иванов 2",
            )

        assert error.value.status_code == 422

    def test_companies_are_independent(self, db):
        first = register_organization(
            db,
            organization_name="Первая",
            login="first@company.ru",
            password="secret123",
        )
        second = register_organization(
            db,
            organization_name="Вторая",
            login="second@company.ru",
            password="secret123",
        )

        assert first.organization_id != second.organization_id

        first_tiers = set(
            db.scalars(
                select(PricingTier.id).where(
                    PricingTier.organization_id == first.organization_id
                )
            )
        )
        second_tiers = set(
            db.scalars(
                select(PricingTier.id).where(
                    PricingTier.organization_id == second.organization_id
                )
            )
        )
        assert first_tiers and second_tiers
        assert first_tiers.isdisjoint(second_tiers)


class TestRetailRegistration:
    def test_creates_retail_company_with_term_rates(self, db):
        owner = register_organization(
            db,
            organization_name="Магазин",
            login="shop@company.ru",
            password="secret123",
            organization_type=OrganizationType.RETAIL,
        )

        organization = db.get(Organization, owner.organization_id)
        assert organization.organization_type == OrganizationType.RETAIL
        assert owner.role == UserRole.OWNER

        rates = list(
            db.scalars(
                select(RetailTermRate).where(
                    RetailTermRate.organization_id == owner.organization_id
                )
            )
        )
        assert len(rates) > 0
        assert all(rate.is_active for rate in rates)

    def test_retail_company_gets_no_bankruptcy_defaults(self, db):
        owner = register_organization(
            db,
            organization_name="Магазин",
            login="shop@company.ru",
            password="secret123",
            organization_type=OrganizationType.RETAIL,
        )

        tiers = db.scalar(
            select(func.count())
            .select_from(PricingTier)
            .where(PricingTier.organization_id == owner.organization_id)
        )
        expenses = db.scalar(
            select(func.count())
            .select_from(OperatingExpense)
            .where(OperatingExpense.organization_id == owner.organization_id)
        )
        assert tiers == 0
        assert expenses == 0

    def test_same_login_allowed_in_both_contours(self, db):
        legal = register_organization(
            db,
            organization_name="Юрфирма",
            login="boss@company.ru",
            password="secret123",
        )
        retail = register_organization(
            db,
            organization_name="Магазин",
            login="boss@company.ru",
            password="secret123",
            organization_type=OrganizationType.RETAIL,
        )

        assert legal.organization_id != retail.organization_id
        assert legal.email == retail.email

    def test_rejects_taken_login_inside_retail(self, db):
        register_organization(
            db,
            organization_name="Первый магазин",
            login="+79286433230",
            password="secret123",
            organization_type=OrganizationType.RETAIL,
        )

        with pytest.raises(HTTPException) as error:
            register_organization(
                db,
                organization_name="Второй магазин",
                login="89286433230",
                password="secret123",
                organization_type=OrganizationType.RETAIL,
            )

        assert error.value.status_code == 409

    def test_retail_companies_have_own_term_rates(self, db):
        first = register_organization(
            db,
            organization_name="Первый магазин",
            login="first@shop.ru",
            password="secret123",
            organization_type=OrganizationType.RETAIL,
        )
        second = register_organization(
            db,
            organization_name="Второй магазин",
            login="second@shop.ru",
            password="secret123",
            organization_type=OrganizationType.RETAIL,
        )

        first_rates = set(
            db.scalars(
                select(RetailTermRate.id).where(
                    RetailTermRate.organization_id == first.organization_id
                )
            )
        )
        second_rates = set(
            db.scalars(
                select(RetailTermRate.id).where(
                    RetailTermRate.organization_id == second.organization_id
                )
            )
        )
        assert first_rates and second_rates
        assert first_rates.isdisjoint(second_rates)


class TestContactsAvailability:
    def test_login_of_other_contour_does_not_block(self, db):
        register_organization(
            db,
            organization_name="Юрфирма",
            login="shared@company.ru",
            password="secret123",
        )

        assert (
            find_user_by_contacts(
                db,
                organization_type=OrganizationType.RETAIL,
                email="shared@company.ru",
            )
            is None
        )

    def test_employee_cannot_take_login_of_another_company(self, db):
        register_organization(
            db,
            organization_name="Первая",
            login="owner@first.ru",
            password="secret123",
        )
        second = register_organization(
            db,
            organization_name="Вторая",
            login="owner@second.ru",
            password="secret123",
        )

        with pytest.raises(HTTPException) as error:
            assert_contacts_available(
                db,
                organization_type=OrganizationType.BANKRUPTCY,
                email="owner@first.ru",
                phone=None,
            )

        assert error.value.status_code == 409
        assert second.organization_id is not None

    def test_user_can_keep_own_login_on_update(self, db):
        owner = register_organization(
            db,
            organization_name="Первая",
            login="owner@first.ru",
            password="secret123",
        )

        assert_contacts_available(
            db,
            organization_type=OrganizationType.BANKRUPTCY,
            email="owner@first.ru",
            phone=None,
            exclude_user_id=owner.id,
        )

    def test_unknown_login_is_free(self, db):
        assert (
            find_user_by_contacts(
                db,
                organization_type=OrganizationType.BANKRUPTCY,
                email="nobody@company.ru",
                exclude_user_id=uuid.uuid4(),
            )
            is None
        )


class TestUserRolesAfterRegistration:
    def test_owner_is_only_user_of_new_company(self, db):
        owner = register_organization(
            db,
            organization_name="Первая",
            login="owner@first.ru",
            password="secret123",
        )

        users = list(
            db.scalars(select(User).where(User.organization_id == owner.organization_id))
        )
        assert [user.id for user in users] == [owner.id]
