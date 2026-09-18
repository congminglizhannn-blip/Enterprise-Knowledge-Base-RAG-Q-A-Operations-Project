from datetime import UTC, datetime, timedelta
import hashlib
import secrets
from typing import Any

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_token(subject: str, token_type: str, expires_delta: timedelta, extra: dict[str, Any] | None = None) -> str:
    expire = datetime.now(UTC) + expires_delta
    payload: dict[str, Any] = {"sub": subject, "type": token_type, "exp": expire}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_access_token(subject: str, extra: dict[str, Any] | None = None) -> str:
    return create_token(
        subject,
        "access",
        timedelta(minutes=settings.access_token_expire_minutes),
        extra,
    )


def create_refresh_token(subject: str) -> str:
    return create_token(
        subject,
        "refresh",
        timedelta(minutes=settings.refresh_token_expire_minutes),
    )


def create_secure_token() -> str:
    return secrets.token_urlsafe(32)


def create_invite_code() -> str:
    return secrets.token_urlsafe(16)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
