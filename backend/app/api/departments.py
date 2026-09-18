from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies import require_department_admin
from app.models.department import Department
from app.models.enums import UserRole
from app.models.user import User

router = APIRouter()


@router.get("")
def list_departments(
    org_id: str | None = None,
    current_user: User = Depends(require_department_admin),
    db: Session = Depends(get_db),
):
    stmt = select(Department)
    if current_user.role == UserRole.SUPER_ADMIN:
        if org_id:
            stmt = stmt.where(Department.org_id == org_id)
    else:
        stmt = stmt.where(Department.org_id == current_user.org_id, Department.id == current_user.department_id)
    return db.scalars(stmt.order_by(Department.created_at.asc())).all()
