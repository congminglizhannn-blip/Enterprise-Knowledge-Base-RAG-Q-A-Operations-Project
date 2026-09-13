from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies import require_department_admin
from app.models.department import Department
from app.models.enums import UserRole
from app.models.user import User

router = APIRouter()


@router.get("/users")
def list_users(current_user: User = Depends(require_department_admin), db: Session = Depends(get_db)):
    stmt = select(User)
    if current_user.role != UserRole.SUPER_ADMIN:
        stmt = stmt.where(User.department_id == current_user.department_id)
    users = db.scalars(stmt).all()
    return [
        {"id": user.id, "username": user.username, "role": user.role, "department_id": user.department_id, "is_active": user.is_active}
        for user in users
    ]


@router.get("/departments")
def list_departments(current_user: User = Depends(require_department_admin), db: Session = Depends(get_db)):
    stmt = select(Department)
    if current_user.role != UserRole.SUPER_ADMIN:
        stmt = stmt.where(Department.id == current_user.department_id)
    return db.scalars(stmt).all()
