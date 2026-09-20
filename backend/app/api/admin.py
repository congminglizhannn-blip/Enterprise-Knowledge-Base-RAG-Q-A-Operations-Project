from datetime import UTC, datetime, time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import create_invite_code, get_password_hash
from app.dependencies import require_csrf_token, require_department_admin
from app.models.audit import ApiUsageLog
from app.models.auth_session import AuthSession
from app.models.department import Department
from app.models.enums import UserRole
from app.models.knowledge_base import KnowledgeBase
from app.models.organization import Organization
from app.models.user import User
from app.schemas.auth import ResetPasswordRequest, ResetPasswordResponse
from app.services.audit import write_audit_log

router = APIRouter()


@router.get("/users")
def list_users(current_user: User = Depends(require_department_admin), db: Session = Depends(get_db)):
    stmt = select(User, Department.name.label("department_name")).join(Department, Department.id == User.department_id)
    if current_user.role != UserRole.SUPER_ADMIN:
        stmt = stmt.where(User.org_id == current_user.org_id, User.department_id == current_user.department_id)
    users = db.execute(stmt.order_by(User.created_at.desc())).all()
    return [
        {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "org_id": user.org_id,
            "department_id": user.department_id,
            "department_name": department_name,
            "is_active": user.is_active,
            "must_change_password": user.must_change_password,
        }
        for user, department_name in users
    ]


@router.get("/departments")
def list_departments(current_user: User = Depends(require_department_admin), db: Session = Depends(get_db)):
    stmt = select(Department).join(Organization, Organization.id == Department.org_id).where(
        Department.is_archived.is_(False),
        Organization.is_archived.is_(False),
    )
    if current_user.role != UserRole.SUPER_ADMIN:
        stmt = stmt.where(Department.org_id == current_user.org_id, Department.id == current_user.department_id)
    return db.scalars(stmt).all()


@router.get("/stats")
def get_admin_stats(current_user: User = Depends(require_department_admin), db: Session = Depends(get_db)):
    user_stmt = select(func.count(User.id))
    department_stmt = select(func.count(Department.id)).join(Organization, Organization.id == Department.org_id).where(
        Department.is_archived.is_(False),
        Organization.is_archived.is_(False),
    )
    kb_stmt = select(func.count(KnowledgeBase.id))
    token_stmt = select(func.coalesce(func.sum(ApiUsageLog.total_tokens), 0))
    today_start = datetime.combine(datetime.now(UTC).date(), time.min, tzinfo=UTC)

    if current_user.role != UserRole.SUPER_ADMIN:
        user_stmt = user_stmt.where(User.org_id == current_user.org_id, User.department_id == current_user.department_id)
        department_stmt = department_stmt.where(Department.org_id == current_user.org_id, Department.id == current_user.department_id)
        kb_stmt = kb_stmt.where(KnowledgeBase.org_id == current_user.org_id, KnowledgeBase.department_id == current_user.department_id)
        token_stmt = token_stmt.where(ApiUsageLog.org_id == current_user.org_id)

    token_stmt = token_stmt.where(ApiUsageLog.created_at >= today_start)
    return {
        "users": db.scalar(user_stmt) or 0,
        "departments": db.scalar(department_stmt) or 0,
        "knowledge_bases": db.scalar(kb_stmt) or 0,
        "today_tokens": db.scalar(token_stmt) or 0,
    }


@router.post("/users/{user_id}/reset-password", response_model=ResetPasswordResponse, dependencies=[Depends(require_csrf_token)])
def reset_user_password(
    user_id: str,
    payload: ResetPasswordRequest,
    current_user: User = Depends(require_department_admin),
    db: Session = Depends(get_db),
) -> ResetPasswordResponse:
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "仅超级管理员可操作"})

    user = db.scalar(select(User).where(User.id == user_id, User.org_id == current_user.org_id))
    if not user:
        raise HTTPException(status_code=404, detail={"code": "USER_NOT_FOUND", "message": "用户不存在或无权限"})

    temporary_password = payload.temporary_password or create_invite_code()
    if len(temporary_password) < 8:
        raise HTTPException(status_code=400, detail={"code": "PASSWORD_TOO_WEAK", "message": "密码至少需要 8 位"})

    user.hashed_password = get_password_hash(temporary_password)
    user.must_change_password = True
    now = datetime.now(UTC)
    active_sessions = db.scalars(select(AuthSession).where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))).all()
    for session in active_sessions:
        session.revoked_at = now
    write_audit_log(db, "auth.password.reset", user=current_user, metadata={"target_user_id": user.id})
    db.commit()
    return ResetPasswordResponse(user_id=user.id, temporary_password=temporary_password)
