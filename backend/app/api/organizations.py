from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
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


@router.get("")
def list_organizations(db: Session = Depends(get_db)):
    return [
        {
            "id": org.id,
            "name": org.name,
            "created_at": org.created_at,
        }
        for org in db.scalars(select(Organization).order_by(Organization.created_at.asc())).all()
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

    org = Organization(name=name)
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
        "created_at": org.created_at,
        "default_department_id": department.id,
        "default_department_name": department.name,
    }
