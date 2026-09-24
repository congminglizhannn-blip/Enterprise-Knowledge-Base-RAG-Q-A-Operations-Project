from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_invite_code,
    create_refresh_token,
    create_secure_token,
    get_password_hash,
    hash_token,
    verify_password,
)
from app.dependencies import get_current_user, require_csrf_token
from app.models.auth_session import AuthSession
from app.models.department import Department
from app.models.enums import UserRole
from app.models.org_invite import OrgInvite
from app.models.organization import Organization
from app.models.user import User
from app.schemas.auth import (
    AuthUserResponse,
    AuthProfileResponse,
    AuthSessionRead,
    ChangePasswordRequest,
    CsrfTokenResponse,
    DepartmentProfile,
    InviteCreateRequest,
    InviteCreateResponse,
    InviteRead,
    InviteValidateResponse,
    LoginRequest,
    OrgProfile,
    RefreshTokenRequest,
    RefreshTokenResponse,
    RegisterRequest,
    UserProfile,
)
from app.services.audit import write_audit_log

router = APIRouter()

SESSION_COOKIE_NAME = "session_token"
SESSION_EXPIRE_DELTA = timedelta(hours=24)
SESSION_ABSOLUTE_EXPIRE_DELTA = timedelta(days=7)
MAX_ACTIVE_SESSIONS = 5


def utc_now() -> datetime:
    return datetime.now(UTC)


def as_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def api_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


def ensure_password_strength(password: str) -> None:
    if len(password) < 8:
        raise api_error(400, "PASSWORD_TOO_WEAK", "密码至少需要 8 位")


def set_session_cookie(response: Response, token: str, expires_at: datetime) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        path="/",
        expires=expires_at,
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/", samesite="lax")


def build_auth_profile(user: User, db: Session) -> AuthProfileResponse:
    org = db.get(Organization, user.org_id)
    department = db.get(Department, user.department_id)
    if not org or not department:
        raise api_error(500, "AUTH_PROFILE_INCOMPLETE", "用户组织或部门信息不完整")
    return AuthProfileResponse(
        user=UserProfile.model_validate(user),
        org=OrgProfile.model_validate(org),
        department=DepartmentProfile.model_validate(department),
    )


def build_auth_response(user: User, access_token: str, refresh_token: str, db: Session) -> AuthUserResponse:
    profile = build_auth_profile(user, db)
    return AuthUserResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=profile.user,
        org=profile.org,
        department=profile.department,
    )


def revoke_extra_sessions(db: Session, user_id: str, keep_session_id: str | None = None) -> None:
    sessions = db.scalars(
        select(AuthSession)
        .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
        .order_by(AuthSession.created_at.desc())
    ).all()
    now = utc_now()
    kept = 0
    for session in sessions:
        if keep_session_id and session.id == keep_session_id:
            continue
        kept += 1
        if kept >= MAX_ACTIVE_SESSIONS:
            session.revoked_at = now


def create_auth_session(db: Session, user: User, request: Request, response: Response) -> AuthSession:
    token = create_secure_token()
    now = utc_now()
    session = AuthSession(
        token_hash=hash_token(token),
        csrf_token_hash=None,
        user_id=user.id,
        org_id=user.org_id,
        expires_at=now + SESSION_EXPIRE_DELTA,
        absolute_expires_at=now + SESSION_ABSOLUTE_EXPIRE_DELTA,
        user_agent=request.headers.get("user-agent"),
        ip=request.client.host if request.client else None,
    )
    db.add(session)
    db.flush()
    revoke_extra_sessions(db, user.id, keep_session_id=session.id)
    set_session_cookie(response, token, session.expires_at)
    return session


def create_legacy_tokens(user: User) -> tuple[str, str]:
    access_token = create_access_token(user.id, {"role": user.role, "department_id": user.department_id, "org_id": user.org_id})
    refresh_token = create_refresh_token(user.id)
    return access_token, refresh_token


def get_current_auth_session(db: Session, session_token: str | None) -> AuthSession:
    if not session_token:
        raise api_error(401, "UNAUTHORIZED", "登录态已失效")
    session = db.scalar(
        select(AuthSession).where(
            AuthSession.token_hash == hash_token(session_token),
            AuthSession.revoked_at.is_(None),
        )
    )
    now = utc_now()
    if not session or as_aware(session.expires_at) <= now or as_aware(session.absolute_expires_at) <= now:
        raise api_error(401, "UNAUTHORIZED", "登录态已失效")
    return session


def get_invite_by_code(db: Session, invite_code: str) -> OrgInvite:
    invite = db.scalar(select(OrgInvite).where(OrgInvite.code_hash == hash_token(invite_code)))
    now = utc_now()
    if not invite:
        raise api_error(400, "INVITE_INVALID", "邀请码无效或已失效")
    if invite.used_at or invite.used_by:
        raise api_error(400, "INVITE_USED", "邀请码无效或已失效")
    if invite.revoked_at:
        raise api_error(400, "INVITE_REVOKED", "邀请码无效或已失效")
    if as_aware(invite.expires_at) <= now:
        raise api_error(400, "INVITE_EXPIRED", "邀请码无效或已失效")
    return invite


@router.post("/register", response_model=AuthUserResponse)
def register(payload: RegisterRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> AuthUserResponse:
    ensure_password_strength(payload.password)
    if db.scalar(select(User).where(User.username == payload.username)):
        raise api_error(409, "USERNAME_TAKEN", "用户名已存在")
    if payload.email and db.scalar(select(User).where(User.email == payload.email)):
        raise api_error(409, "EMAIL_TAKEN", "邮箱已存在")

    invite: OrgInvite | None = None
    if payload.invite_code:
        invite = get_invite_by_code(db, payload.invite_code)
        org = db.get(Organization, invite.org_id)
        department = db.get(Department, invite.department_id)
        role = invite.role
    else:
        if not payload.org_id:
            raise api_error(400, "ORG_ID_REQUIRED", "注册必须选择已有组织或填写邀请码")
        org = db.get(Organization, payload.org_id)
        if not org:
            raise api_error(404, "ORG_NOT_FOUND", "目标组织不存在或不可用")
        department = db.scalar(select(Department).where(Department.org_id == org.id).order_by(Department.created_at.asc()))
        if not department:
            raise api_error(400, "DEPARTMENT_NOT_FOUND", "目标组织没有可用部门，请联系超级管理员")
        role = UserRole.USER

    if not org or not department:
        raise api_error(400, "INVITE_INVALID", "邀请码无效或已失效")

    user = User(
        username=payload.username,
        email=payload.email,
        full_name=payload.full_name,
        role=role,
        org_id=org.id,
        department_id=department.id,
        hashed_password=get_password_hash(payload.password),
        is_active=True,
        must_change_password=False,
    )
    db.add(user)
    db.flush()
    if invite:
        invite.used_by = user.id
        invite.used_at = utc_now()
    create_auth_session(db, user, request, response)
    write_audit_log(
        db,
        "auth.register.success",
        user=user,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        metadata={"via_invite": bool(invite)},
    )
    db.commit()
    access_token, refresh_token = create_legacy_tokens(user)
    return build_auth_response(user, access_token, refresh_token, db)


@router.post("/login", response_model=AuthUserResponse)
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> AuthUserResponse:
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or not verify_password(payload.password, user.hashed_password):
        write_audit_log(
            db,
            "auth.login.failed",
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            metadata={"username": payload.username},
        )
        db.commit()
        raise api_error(401, "UNAUTHORIZED", "用户名或密码错误")
    if not user.is_active:
        raise api_error(403, "USER_DISABLED", "用户已停用")
    if payload.role != user.role:
        write_audit_log(
            db,
            "auth.login.failed",
            user=user,
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            metadata={"reason": "ROLE_MISMATCH", "selected_role": payload.role},
        )
        db.commit()
        raise api_error(403, "ROLE_MISMATCH", "所选角色与账号角色不一致，请选择正确的登录角色")
    create_auth_session(db, user, request, response)
    write_audit_log(
        db,
        "auth.login.success",
        user=user,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    access_token, refresh_token = create_legacy_tokens(user)
    return build_auth_response(user, access_token, refresh_token, db)


@router.post("/refresh", response_model=RefreshTokenResponse)
def refresh(payload: RefreshTokenRequest, db: Session = Depends(get_db)) -> RefreshTokenResponse:
    credentials_error = api_error(401, "UNAUTHORIZED", "刷新登录态失败，请重新登录")
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

    access_token, refresh_token = create_legacy_tokens(user)
    return RefreshTokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/logout")
def logout(response: Response, session_token: str | None = Cookie(default=None), db: Session = Depends(get_db)):
    if session_token:
        session = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(session_token)))
        if session and not session.revoked_at:
            session.revoked_at = utc_now()
            write_audit_log(db, "auth.logout", user=db.get(User, session.user_id), org_id=session.org_id)
            db.commit()
    clear_session_cookie(response)
    return {"success": True}


@router.get("/me", response_model=AuthProfileResponse)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> AuthProfileResponse:
    return build_auth_profile(user, db)


@router.get("/csrf", response_model=CsrfTokenResponse)
def csrf_token(session_token: str | None = Cookie(default=None), db: Session = Depends(get_db)) -> CsrfTokenResponse:
    session = get_current_auth_session(db, session_token)
    csrf = create_secure_token()
    session.csrf_token_hash = hash_token(csrf)
    db.commit()
    return CsrfTokenResponse(csrf_token=csrf)


@router.post("/change-password", response_model=AuthUserResponse, dependencies=[Depends(require_csrf_token)])
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    response: Response,
    session_token: str | None = Cookie(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuthUserResponse:
    ensure_password_strength(payload.new_password)
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise api_error(400, "CURRENT_PASSWORD_INVALID", "当前密码错误")
    current_session = get_current_auth_session(db, session_token)
    current_user.hashed_password = get_password_hash(payload.new_password)
    current_user.must_change_password = False
    current_session.revoked_at = utc_now()
    new_session = create_auth_session(db, current_user, request, response)
    revoke_extra_sessions(db, current_user.id, keep_session_id=new_session.id)
    write_audit_log(
        db,
        "auth.password.changed",
        user=current_user,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    access_token, refresh_token = create_legacy_tokens(current_user)
    return build_auth_response(current_user, access_token, refresh_token, db)


@router.post("/invites", response_model=InviteCreateResponse, dependencies=[Depends(require_csrf_token)])
def create_invite(
    payload: InviteCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InviteCreateResponse:
    if current_user.role != UserRole.SUPER_ADMIN:
        raise api_error(403, "FORBIDDEN", "仅超级管理员可操作")
    department_id = payload.department_id or current_user.department_id
    department = db.get(Department, department_id)
    if not department or department.org_id != current_user.org_id:
        raise api_error(404, "DEPARTMENT_NOT_FOUND", "部门不存在或无权限")
    days = max(1, min(payload.expires_in_days, 7))
    code = create_invite_code()
    invite = OrgInvite(
        org_id=current_user.org_id,
        code_hash=hash_token(code),
        role=payload.role,
        department_id=department.id,
        expires_at=utc_now() + timedelta(days=days),
        created_by=current_user.id,
    )
    db.add(invite)
    write_audit_log(
        db,
        "auth.invite.created",
        user=current_user,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        metadata={"invite_id": invite.id, "role": str(payload.role), "department_id": department.id},
    )
    db.commit()
    db.refresh(invite)
    invite_url = str(request.base_url).rstrip("/") + f"/register?invite={code}"
    data = {
        "id": invite.id,
        "org_id": invite.org_id,
        "role": invite.role,
        "department_id": invite.department_id,
        "expires_at": invite.expires_at,
        "used_by": invite.used_by,
        "used_at": invite.used_at,
        "revoked_at": invite.revoked_at,
        "created_at": invite.created_at,
        "invite_code": code,
        "invite_url": invite_url,
    }
    return InviteCreateResponse.model_validate(data)


@router.get("/invites", response_model=list[InviteRead])
def list_invites(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != UserRole.SUPER_ADMIN:
        raise api_error(403, "FORBIDDEN", "仅超级管理员可操作")
    return db.scalars(select(OrgInvite).where(OrgInvite.org_id == current_user.org_id).order_by(OrgInvite.created_at.desc())).all()


@router.delete("/invites/{invite_id}", dependencies=[Depends(require_csrf_token)])
def revoke_invite(invite_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != UserRole.SUPER_ADMIN:
        raise api_error(403, "FORBIDDEN", "仅超级管理员可操作")
    invite = db.scalar(select(OrgInvite).where(OrgInvite.id == invite_id, OrgInvite.org_id == current_user.org_id))
    if not invite:
        raise api_error(404, "INVITE_NOT_FOUND", "邀请码不存在或无权限")
    invite.revoked_at = utc_now()
    write_audit_log(db, "auth.invite.revoked", user=current_user, metadata={"invite_id": invite.id})
    db.commit()
    return {"success": True}


@router.get("/sessions", response_model=list[AuthSessionRead])
def list_auth_sessions(
    session_token: str | None = Cookie(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AuthSessionRead]:
    current_hash = hash_token(session_token) if session_token else None
    now = utc_now()
    sessions = db.scalars(
        select(AuthSession)
        .where(
            AuthSession.user_id == current_user.id,
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > now,
            AuthSession.absolute_expires_at > now,
        )
        .order_by(AuthSession.updated_at.desc())
    ).all()
    return [
        AuthSessionRead(
            id=session.id,
            created_at=session.created_at,
            updated_at=session.updated_at,
            expires_at=session.expires_at,
            absolute_expires_at=session.absolute_expires_at,
            revoked_at=session.revoked_at,
            user_agent=session.user_agent,
            ip=str(session.ip) if session.ip else None,
            is_current=session.token_hash == current_hash,
        )
        for session in sessions
    ]


@router.delete("/sessions/{session_id}", dependencies=[Depends(require_csrf_token)])
def revoke_auth_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.scalar(select(AuthSession).where(AuthSession.id == session_id, AuthSession.user_id == current_user.id))
    if not session:
        raise api_error(404, "SESSION_NOT_FOUND", "会话不存在或无权限")
    if not session.revoked_at:
        session.revoked_at = utc_now()
        write_audit_log(db, "auth.session.revoked", user=current_user, metadata={"session_id": session.id})
        db.commit()
    return {"success": True}


@router.get("/invites/validate", response_model=InviteValidateResponse)
def validate_invite(code: str, db: Session = Depends(get_db)) -> InviteValidateResponse:
    invite = get_invite_by_code(db, code)
    org = db.get(Organization, invite.org_id)
    department = db.get(Department, invite.department_id)
    if not org or not department:
        raise api_error(400, "INVITE_INVALID", "邀请码无效或已失效")
    return InviteValidateResponse(
        valid=True,
        org_name=org.name,
        department_name=department.name,
        role=invite.role,
        expires_at=invite.expires_at,
    )
