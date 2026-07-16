import uuid

import pytest
from jose import JWTError

from app.core.security import (
    TOKEN_TYPE_ACCESS,
    TOKEN_TYPE_REFRESH,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_password_hash,
    validate_token_type,
    verify_password,
)
from app.models.enums import UserRole


@pytest.fixture
def user_ids():
    user_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    org_id = uuid.UUID("22222222-2222-2222-2222-222222222222")
    return user_id, org_id


def test_password_hash_roundtrip():
    password = "secure-password"
    hashed = get_password_hash(password)

    assert hashed != password
    assert verify_password(password, hashed)
    assert not verify_password("wrong-password", hashed)


def test_access_and_refresh_tokens(user_ids):
    user_id, org_id = user_ids
    role = UserRole.OWNER.value

    access = create_access_token(subject=user_id, organization_id=org_id, role=role)
    refresh = create_refresh_token(subject=user_id, organization_id=org_id, role=role)

    access_payload = decode_token(access)
    refresh_payload = decode_token(refresh)

    assert access_payload["sub"] == str(user_id)
    assert access_payload["org_id"] == str(org_id)
    assert access_payload["role"] == role
    validate_token_type(access_payload, TOKEN_TYPE_ACCESS)

    validate_token_type(refresh_payload, TOKEN_TYPE_REFRESH)

    with pytest.raises(JWTError):
        validate_token_type(access_payload, TOKEN_TYPE_REFRESH)
