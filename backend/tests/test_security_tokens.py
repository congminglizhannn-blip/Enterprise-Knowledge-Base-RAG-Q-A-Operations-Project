from datetime import timedelta

from jose import jwt

from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token, create_token


def test_access_and_refresh_tokens_have_distinct_types() -> None:
    access_token = create_access_token("user-1")
    refresh_token = create_refresh_token("user-1")

    access_payload = jwt.decode(access_token, settings.secret_key, algorithms=[settings.algorithm])
    refresh_payload = jwt.decode(refresh_token, settings.secret_key, algorithms=[settings.algorithm])

    assert access_payload["sub"] == "user-1"
    assert access_payload["type"] == "access"
    assert refresh_payload["sub"] == "user-1"
    assert refresh_payload["type"] == "refresh"


def test_create_token_keeps_extra_claims() -> None:
    token = create_token("user-1", "access", timedelta(minutes=5), {"role": "dept_admin"})

    payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])

    assert payload["role"] == "dept_admin"
