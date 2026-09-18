from datetime import UTC, datetime, timedelta

from fastapi import Cookie, Depends, HTTPException, Header, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import hash_token
from app.models.auth_session import AuthSession
from app.models.enums import UserRole
from app.models.user import User


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _as_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def get_current_user(
    session_token: str | None = Cookie(default=None),
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证登录状态",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if session_token:
        session = db.scalar(
            select(AuthSession).where(
                AuthSession.token_hash == hash_token(session_token),
                AuthSession.revoked_at.is_(None),
            )
        )
        now = _utc_now()
        if not session or _as_aware(session.expires_at) <= now or _as_aware(session.absolute_expires_at) <= now:
            raise credentials_error
        user = db.scalar(select(User).where(User.id == session.user_id, User.is_active.is_(True)))
        if not user:
            raise credentials_error
        if _as_aware(session.expires_at) - now < timedelta(hours=1):
            session.expires_at = min(now + timedelta(hours=24), _as_aware(session.absolute_expires_at))
            session.updated_at = now
            db.commit()
        return user

    if not token:
        raise credentials_error

    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id = payload.get("sub")
        if not user_id or payload.get("type") != "access":
            raise credentials_error
    except JWTError as exc:
        raise credentials_error from exc
    user = db.scalar(select(User).where(User.id == user_id, User.is_active.is_(True)))
    if not user:
        raise credentials_error
    return user


def require_csrf_token(
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
    session_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> None:
    if not session_token or not x_csrf_token:
        raise HTTPException(status_code=403, detail={"code": "CSRF_INVALID", "message": "安全校验失败"})
    session = db.scalar(
        select(AuthSession).where(
            AuthSession.token_hash == hash_token(session_token),
            AuthSession.revoked_at.is_(None),
        )
    )
    now = _utc_now()
    if (
        not session
        or not session.csrf_token_hash
        or _as_aware(session.expires_at) <= now
        or _as_aware(session.absolute_expires_at) <= now
        or session.csrf_token_hash != hash_token(x_csrf_token)
    ):
        raise HTTPException(status_code=403, detail={"code": "CSRF_INVALID", "message": "安全校验失败"})


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="仅超级管理员可操作")
    return user


def require_department_admin(user: User = Depends(get_current_user)) -> User:
    if user.role not in {UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN}:
        raise HTTPException(status_code=403, detail="仅管理员可操作")
    return user
