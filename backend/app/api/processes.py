from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies import get_current_user, require_department_admin
from app.models.enums import UserRole
from app.models.process import Process
from app.models.user import User
from app.schemas.process import ProcessCreate, ProcessRead

router = APIRouter()


@router.get("", response_model=list[ProcessRead])
def list_processes(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(Process).where(Process.org_id == current_user.org_id)
    if current_user.role != UserRole.SUPER_ADMIN:
        stmt = stmt.where(Process.department_id == current_user.department_id)
    return db.scalars(stmt).all()


@router.post("", response_model=ProcessRead)
def create_process(payload: ProcessCreate, current_user: User = Depends(require_department_admin), db: Session = Depends(get_db)):
    process = Process(
        name=payload.name,
        description=payload.description,
        knowledge_base_id=payload.knowledge_base_id,
        org_id=current_user.org_id,
        department_id=current_user.department_id,
    )
    db.add(process)
    db.commit()
    db.refresh(process)
    return process
