from datetime import UTC, datetime

from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies import require_admin, require_csrf_token
from app.models.department import Department
from app.models.organization import Organization
from app.models.user import User

router = APIRouter()


class OrganizationCreateRequest(BaseModel):
    name: str
    description: str | None = None
    department_name: str | None = None


class OrganizationUpdateRequest(BaseModel):
    name: str
    description: str | None = None


@router.get("")
def list_organizations(include_archived: bool = False, db: Session = Depends(get_db)):
    stmt = select(Organization)
    if not include_archived:
        stmt = stmt.where(Organization.is_archived.is_(False))
    return [
        {
            "id": org.id,
            "name": org.name,
            "description": org.description,
            "is_archived": org.is_archived,
            "archived_at": org.archived_at,
            "created_at": org.created_at,
        }
        for org in db.scalars(stmt.order_by(Organization.created_at.asc())).all()
    ]


@router.post("", dependencies=[Depends(require_csrf_token)])
def create_organization(
    payload: OrganizationCreateRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail={"code": "ORG_NAME_REQUIRED", "message": "请填写组织名称"})
    if db.scalar(select(Organization).where(Organization.name == name)):
        raise HTTPException(status_code=409, detail={"code": "ORG_NAME_TAKEN", "message": "组织名称已存在"})

    org = Organization(name=name, description=payload.description)
    db.add(org)
    db.flush()

    department_name = (payload.department_name or f"{name}-默认部门").strip()
    if db.scalar(select(Department).where(Department.name == department_name)):
        department_name = f"{name}-{org.id[:8]}-默认部门"
    department = Department(
        name=department_name,
        description=payload.description or "超级管理员创建组织时自动创建的默认部门",
        org_id=org.id,
    )
    db.add(department)
    db.commit()
    db.refresh(org)
    return {
        "id": org.id,
        "name": org.name,
        "description": org.description,
        "is_archived": org.is_archived,
        "archived_at": org.archived_at,
        "created_at": org.created_at,
        "default_department_id": department.id,
        "default_department_name": department.name,
    }


@router.put("/{org_id}", dependencies=[Depends(require_csrf_token)])
def update_organization(
    org_id: str,
    payload: OrganizationUpdateRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail={"code": "ORG_NOT_FOUND", "message": "组织不存在"})
    if org.is_archived:
        raise HTTPException(status_code=400, detail={"code": "ORG_ARCHIVED", "message": "归档组织不能编辑，请先恢复"})

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail={"code": "ORG_NAME_REQUIRED", "message": "请填写组织名称"})
    existing = db.scalar(select(Organization).where(Organization.name == name, Organization.id != org.id))
    if existing:
        raise HTTPException(status_code=409, detail={"code": "ORG_NAME_TAKEN", "message": "组织名称已存在"})

    org.name = name
    org.description = payload.description
    db.commit()
    db.refresh(org)
    return serialize_organization(org)


@router.patch("/{org_id}/archive", dependencies=[Depends(require_csrf_token)])
def archive_organization(
    org_id: str,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail={"code": "ORG_NOT_FOUND", "message": "组织不存在"})
    if org.is_archived:
        return serialize_organization(org)

    active_users = db.scalar(select(func.count(User.id)).where(User.org_id == org.id, User.is_active.is_(True))) or 0
    if active_users > 0:
        raise HTTPException(status_code=409, detail={"code": "ORG_HAS_ACTIVE_USERS", "message": "该组织下仍有启用用户，不能归档"})

    org.is_archived = True
    org.archived_at = datetime.now(UTC)
    db.commit()
    db.refresh(org)
    return serialize_organization(org)


@router.patch("/{org_id}/restore", dependencies=[Depends(require_csrf_token)])
def restore_organization(
    org_id: str,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail={"code": "ORG_NOT_FOUND", "message": "组织不存在"})

    org.is_archived = False
    org.archived_at = None
    db.commit()
    db.refresh(org)
    return serialize_organization(org)


def serialize_organization(org: Organization) -> dict:
    return {
        "id": org.id,
        "name": org.name,
        "description": org.description,
        "is_archived": org.is_archived,
        "archived_at": org.archived_at,
        "created_at": org.created_at,
    }
