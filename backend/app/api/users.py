from datetime import UTC, datetime

from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies import require_csrf_token, require_department_admin
from app.models.auth_session import AuthSession
from app.models.department import Department
from app.models.enums import UserRole
from app.models.user import User
from app.services.audit import write_audit_log

router = APIRouter()


class UserRoleUpdateRequest(BaseModel):
    role: UserRole
    department_id: str


class UserStatusUpdateRequest(BaseModel):
    is_active: bool


def ensure_can_manage_user(current_user: User, target_user: User) -> None:
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "仅超级管理员可操作"})
    if target_user.id == current_user.id:
        raise HTTPException(status_code=400, detail={"code": "SELF_EDIT_FORBIDDEN", "message": "不能在此处修改自己的账号"})


@router.put("/{user_id}/role", dependencies=[Depends(require_csrf_token)])
def update_user_role(
    user_id: str,
    payload: UserRoleUpdateRequest,
    current_user: User = Depends(require_department_admin),
    db: Session = Depends(get_db),
):
    target_user = db.get(User, user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail={"code": "USER_NOT_FOUND", "message": "用户不存在"})
    ensure_can_manage_user(current_user, target_user)

    department = db.get(Department, payload.department_id)
    if not department:
        raise HTTPException(status_code=404, detail={"code": "DEPARTMENT_NOT_FOUND", "message": "部门不存在"})

    target_user.role = payload.role
    target_user.org_id = department.org_id
    target_user.department_id = department.id
    write_audit_log(
        db,
        "user.role.updated",
        user=current_user,
        metadata={"target_user_id": target_user.id, "role": str(payload.role), "department_id": department.id},
    )
    db.commit()
    return {"success": True}


@router.patch("/{user_id}/status", dependencies=[Depends(require_csrf_token)])
def update_user_status(
    user_id: str,
    payload: UserStatusUpdateRequest,
    current_user: User = Depends(require_department_admin),
    db: Session = Depends(get_db),
):
    target_user = db.get(User, user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail={"code": "USER_NOT_FOUND", "message": "用户不存在"})
    ensure_can_manage_user(current_user, target_user)

    target_user.is_active = payload.is_active
    if not payload.is_active:
        now = datetime.now(UTC)
        for session in db.scalars(select(AuthSession).where(AuthSession.user_id == target_user.id, AuthSession.revoked_at.is_(None))).all():
            session.revoked_at = now
    write_audit_log(
        db,
        "user.status.updated",
        user=current_user,
        metadata={"target_user_id": target_user.id, "is_active": payload.is_active},
    )
    db.commit()
    return {"success": True}
