from fastapi import APIRouter, Depends, HTTPException
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, create_refresh_token, verify_password
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.auth import LoginRequest, RefreshTokenRequest, RefreshTokenResponse, TokenResponse, UserProfile

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="用户已停用")
    access_token = create_access_token(user.id, {"role": user.role, "department_id": user.department_id})
    refresh_token = create_refresh_token(user.id)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token, user=UserProfile.model_validate(user))


@router.post("/refresh", response_model=RefreshTokenResponse)
def refresh(payload: RefreshTokenRequest, db: Session = Depends(get_db)) -> RefreshTokenResponse:
    credentials_error = HTTPException(status_code=401, detail="刷新登录态失败，请重新登录")
    try:
        decoded = jwt.decode(payload.refresh_token, settings.secret_key, algorithms=[settings.algorithm])
        user_id = decoded.get("sub")
        if not user_id or decoded.get("type") != "refresh":
            raise credentials_error
    except JWTError as exc:
        raise credentials_error from exc

    user = db.scalar(select(User).where(User.id == user_id, User.is_active.is_(True)))
    if not user:
        raise credentials_error

    access_token = create_access_token(user.id, {"role": user.role, "department_id": user.department_id})
    refresh_token = create_refresh_token(user.id)
    return RefreshTokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.get("/me", response_model=UserProfile)
def me(user: User = Depends(get_current_user)) -> User:
    return user
