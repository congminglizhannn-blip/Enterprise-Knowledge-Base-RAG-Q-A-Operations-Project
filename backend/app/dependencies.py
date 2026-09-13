from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.enums import UserRole
from app.models.user import User


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证登录状态",
        headers={"WWW-Authenticate": "Bearer"},
    )
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


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="仅超级管理员可操作")
    return user


def require_department_admin(user: User = Depends(get_current_user)) -> User:
    if user.role not in {UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN}:
        raise HTTPException(status_code=403, detail="仅管理员可操作")
    return user
