from datetime import UTC, datetime

from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies import require_csrf_token, require_department_admin
from app.models.department import Department
from app.models.enums import UserRole
from app.models.organization import Organization
from app.models.user import User

router = APIRouter()


class DepartmentCreateRequest(BaseModel):
    name: str
    org_id: str | None = None
    description: str | None = None


class DepartmentUpdateRequest(BaseModel):
    name: str
    org_id: str | None = None
    description: str | None = None


@router.get("")
def list_departments(
    org_id: str | None = None,
    include_archived: bool = False,
    current_user: User = Depends(require_department_admin),
    db: Session = Depends(get_db),
):
    stmt = select(Department).join(Organization, Organization.id == Department.org_id)
    if not include_archived:
        stmt = stmt.where(Department.is_archived.is_(False), Organization.is_archived.is_(False))
    if current_user.role == UserRole.SUPER_ADMIN:
        if org_id:
            stmt = stmt.where(Department.org_id == org_id)
    else:
        stmt = stmt.where(Department.org_id == current_user.org_id, Department.id == current_user.department_id)
    return db.scalars(stmt.order_by(Department.created_at.asc())).all()


@router.post("", dependencies=[Depends(require_csrf_token)])
def create_department(
    payload: DepartmentCreateRequest,
    current_user: User = Depends(require_department_admin),
    db: Session = Depends(get_db),
):
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "仅超级管理员可创建部门"})

    org_id = payload.org_id or current_user.org_id
    org = db.get(Organization, org_id)
    if not org or org.is_archived:
        raise HTTPException(status_code=404, detail={"code": "ORG_NOT_FOUND", "message": "组织不存在或已归档"})

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail={"code": "DEPARTMENT_NAME_REQUIRED", "message": "请填写部门名称"})
    if db.scalar(select(Department).where(Department.name == name)):
        raise HTTPException(status_code=409, detail={"code": "DEPARTMENT_NAME_TAKEN", "message": "部门名称已存在"})

    department = Department(name=name, org_id=org.id, description=payload.description)
    db.add(department)
    db.commit()
    db.refresh(department)
    return department


@router.put("/{department_id}", dependencies=[Depends(require_csrf_token)])
def update_department(
    department_id: str,
    payload: DepartmentUpdateRequest,
    current_user: User = Depends(require_department_admin),
    db: Session = Depends(get_db),
):
    department = db.get(Department, department_id)
    if not department:
        raise HTTPException(status_code=404, detail={"code": "DEPARTMENT_NOT_FOUND", "message": "部门不存在"})
    if department.is_archived:
        raise HTTPException(status_code=400, detail={"code": "DEPARTMENT_ARCHIVED", "message": "归档部门不能编辑，请先恢复"})
    if current_user.role != UserRole.SUPER_ADMIN and department.id != current_user.department_id:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "无权编辑该部门"})

    org_id = payload.org_id or department.org_id
    if current_user.role != UserRole.SUPER_ADMIN and org_id != current_user.org_id:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "不能跨组织修改部门"})
    org = db.get(Organization, org_id)
    if not org or org.is_archived:
        raise HTTPException(status_code=404, detail={"code": "ORG_NOT_FOUND", "message": "组织不存在或已归档"})

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail={"code": "DEPARTMENT_NAME_REQUIRED", "message": "请填写部门名称"})
    existing = db.scalar(select(Department).where(Department.name == name, Department.id != department.id))
    if existing:
        raise HTTPException(status_code=409, detail={"code": "DEPARTMENT_NAME_TAKEN", "message": "部门名称已存在"})

    department.name = name
    department.org_id = org.id
    department.description = payload.description
    db.commit()
    db.refresh(department)
    return department


@router.patch("/{department_id}/archive", dependencies=[Depends(require_csrf_token)])
def archive_department(
    department_id: str,
    current_user: User = Depends(require_department_admin),
    db: Session = Depends(get_db),
):
    department = db.get(Department, department_id)
    if not department:
        raise HTTPException(status_code=404, detail={"code": "DEPARTMENT_NOT_FOUND", "message": "部门不存在"})
    if current_user.role != UserRole.SUPER_ADMIN and department.id != current_user.department_id:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "无权归档该部门"})
    if department.is_archived:
        return department

    active_users = db.scalar(select(func.count(User.id)).where(User.department_id == department.id, User.is_active.is_(True))) or 0
    if active_users > 0:
        raise HTTPException(status_code=409, detail={"code": "DEPARTMENT_HAS_ACTIVE_USERS", "message": "该部门下仍有启用用户，不能归档"})
    active_departments = db.scalar(
        select(func.count(Department.id)).where(
            Department.org_id == department.org_id,
            Department.is_archived.is_(False),
            Department.id != department.id,
        )
    ) or 0
    if active_departments == 0:
        raise HTTPException(status_code=409, detail={"code": "LAST_DEPARTMENT_FORBIDDEN", "message": "组织至少需要保留一个可用部门"})

    department.is_archived = True
    department.archived_at = datetime.now(UTC)
    db.commit()
    db.refresh(department)
    return department


@router.patch("/{department_id}/restore", dependencies=[Depends(require_csrf_token)])
def restore_department(
    department_id: str,
    current_user: User = Depends(require_department_admin),
    db: Session = Depends(get_db),
):
    department = db.get(Department, department_id)
    if not department:
        raise HTTPException(status_code=404, detail={"code": "DEPARTMENT_NOT_FOUND", "message": "部门不存在"})
    if current_user.role != UserRole.SUPER_ADMIN and department.id != current_user.department_id:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "无权恢复该部门"})
    org = db.get(Organization, department.org_id)
    if not org or org.is_archived:
        raise HTTPException(status_code=409, detail={"code": "ORG_ARCHIVED", "message": "所属组织已归档，请先恢复组织"})

    department.is_archived = False
    department.archived_at = None
    db.commit()
    db.refresh(department)
    return department
