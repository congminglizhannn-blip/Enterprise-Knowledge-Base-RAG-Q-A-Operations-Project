from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies import get_current_user, require_csrf_token, require_department_admin
from app.models.department import Department
from app.models.chunk import DocumentChunk
from app.models.document import Document
from app.models.enums import KnowledgeBaseScope, UserRole
from app.models.knowledge_base import KnowledgeBase
from app.models.organization import Organization
from app.models.user import User
from app.schemas.kb import KnowledgeBaseCreate, KnowledgeBaseRead, KnowledgeBaseUpdate, KnowledgeBaseStatusUpdate

router = APIRouter()


@router.get("", response_model=list[KnowledgeBaseRead])
def list_knowledge_bases(current_user: User = Depends(get_current_user), db: Session = Depends(get_db), include_disabled: bool = False):
    if include_disabled and current_user.role not in (UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN):
        raise HTTPException(status_code=403, detail="仅管理员可查看禁用知识库")
    document_counts = (
        select(Document.knowledge_base_id, func.count(Document.id).label("document_count"))
        .group_by(Document.knowledge_base_id)
        .subquery()
    )
    chunk_counts = (
        select(DocumentChunk.knowledge_base_id, func.count(DocumentChunk.id).label("chunk_count"))
        .group_by(DocumentChunk.knowledge_base_id)
        .subquery()
    )
    stmt = (
        select(
            KnowledgeBase,
            Organization.name.label("org_name"),
            Department.name.label("department_name"),
            func.coalesce(document_counts.c.document_count, 0).label("document_count"),
            func.coalesce(chunk_counts.c.chunk_count, 0).label("chunk_count"),
        )
        .join(Organization, Organization.id == KnowledgeBase.org_id)
        .join(Department, Department.id == KnowledgeBase.department_id)
        .outerjoin(document_counts, document_counts.c.knowledge_base_id == KnowledgeBase.id)
        .outerjoin(chunk_counts, chunk_counts.c.knowledge_base_id == KnowledgeBase.id)
    )
    if current_user.role != UserRole.SUPER_ADMIN:
        stmt = stmt.where(
            or_(
                KnowledgeBase.scope == KnowledgeBaseScope.GLOBAL,
                (KnowledgeBase.scope == KnowledgeBaseScope.ORGANIZATION) & (KnowledgeBase.target_id == current_user.org_id),
                (KnowledgeBase.scope == KnowledgeBaseScope.DEPARTMENT) & (KnowledgeBase.target_id == current_user.department_id),
            )
        )
    if not include_disabled:
        stmt = stmt.where(KnowledgeBase.is_active.is_(True))
    elif current_user.role != UserRole.SUPER_ADMIN:
        stmt = stmt.where(or_(
            KnowledgeBase.is_active.is_(True),
            (KnowledgeBase.scope == KnowledgeBaseScope.DEPARTMENT) & (KnowledgeBase.target_id == current_user.department_id),
        ))
    rows = db.execute(stmt.order_by(KnowledgeBase.created_at.desc())).all()
    return [
        serialize_kb(kb, org_name, department_name, int(document_count), int(chunk_count))
        for kb, org_name, department_name, document_count, chunk_count in rows
    ]


@router.post("", response_model=KnowledgeBaseRead)
def create_knowledge_base(
    payload: KnowledgeBaseCreate,
    current_user: User = Depends(require_department_admin),
    db: Session = Depends(get_db),
    _: None = Depends(require_csrf_token),
):
    org, department, target_id = resolve_kb_scope_target(db, payload.scope, payload.target_id, payload.org_id, current_user)
    if db.scalar(select(KnowledgeBase).where(KnowledgeBase.scope == payload.scope, KnowledgeBase.target_id == target_id, KnowledgeBase.name == payload.name)):
        raise HTTPException(status_code=409, detail={"code": "KB_NAME_TAKEN", "message": "该作用域下已存在同名知识库，请更换名称"})
    kb = KnowledgeBase(
        name=payload.name,
        description=payload.description,
        scope=payload.scope,
        target_id=target_id,
        org_id=org.id,
        department_id=department.id,
        created_by=current_user.id,
    )
    db.add(kb)
    db.commit()
    db.refresh(kb)
    return serialize_kb(kb, org.name, department.name, 0, 0)


@router.put("/{kb_id}", response_model=KnowledgeBaseRead, dependencies=[Depends(require_csrf_token)])
def update_knowledge_base(
    kb_id: str,
    payload: KnowledgeBaseUpdate,
    current_user: User = Depends(require_department_admin),
    db: Session = Depends(get_db),
):
    kb = get_manageable_kb(db, kb_id, current_user)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail={"code": "KB_NAME_REQUIRED", "message": "请填写知识库名称"})
    org, department, target_id = resolve_kb_scope_target(db, payload.scope, payload.target_id, payload.org_id, current_user)
    if db.scalar(
        select(KnowledgeBase).where(
            KnowledgeBase.id != kb.id,
            KnowledgeBase.scope == payload.scope,
            KnowledgeBase.target_id == target_id,
            KnowledgeBase.name == name,
        )
    ):
        raise HTTPException(status_code=409, detail={"code": "KB_NAME_TAKEN", "message": "该作用域下已存在同名知识库，请更换名称"})
    kb.name = name
    kb.description = payload.description
    kb.scope = payload.scope
    kb.target_id = target_id
    kb.org_id = org.id
    kb.department_id = department.id
    db.execute(
        update(Document)
        .where(Document.knowledge_base_id == kb.id)
        .values(org_id=org.id, department_id=department.id)
    )
    db.execute(
        update(DocumentChunk)
        .where(DocumentChunk.knowledge_base_id == kb.id)
        .values(org_id=org.id, department_id=department.id)
    )
    db.commit()
    db.refresh(kb)
    document_count = db.scalar(select(func.count(Document.id)).where(Document.knowledge_base_id == kb.id)) or 0
    chunk_count = db.scalar(select(func.count(DocumentChunk.id)).where(DocumentChunk.knowledge_base_id == kb.id)) or 0
    return serialize_kb(kb, org.name, department.name, document_count, chunk_count)


@router.patch("/{kb_id}/status", response_model=KnowledgeBaseRead, dependencies=[Depends(require_csrf_token)])
def update_knowledge_base_status(
    kb_id: str,
    payload: KnowledgeBaseStatusUpdate,
    current_user: User = Depends(require_department_admin),
    db: Session = Depends(get_db),
):
    kb = get_manageable_kb(db, kb_id, current_user, allow_disabled=True)
    kb.is_active = payload.is_active
    db.commit()
    db.refresh(kb)
    org = db.get(Organization, kb.org_id)
    department = db.get(Department, kb.department_id)
    document_count = db.scalar(select(func.count(Document.id)).where(Document.knowledge_base_id == kb.id)) or 0
    chunk_count = db.scalar(select(func.count(DocumentChunk.id)).where(DocumentChunk.knowledge_base_id == kb.id)) or 0
    return serialize_kb(kb, org.name if org else None, department.name if department else None, document_count, chunk_count)


def get_accessible_kb(db: Session, kb_id: str, user: User, *, allow_disabled: bool = False) -> KnowledgeBase:
    try:
        UUID(kb_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="知识库不存在或无权限") from exc

    stmt = select(KnowledgeBase).where(KnowledgeBase.id == kb_id)
    if user.role != UserRole.SUPER_ADMIN:
        stmt = stmt.where(
            or_(
                KnowledgeBase.scope == KnowledgeBaseScope.GLOBAL,
                (KnowledgeBase.scope == KnowledgeBaseScope.ORGANIZATION) & (KnowledgeBase.target_id == user.org_id),
                (KnowledgeBase.scope == KnowledgeBaseScope.DEPARTMENT) & (KnowledgeBase.target_id == user.department_id),
            )
        )
    kb = db.scalar(stmt)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在或无权限")
    if not allow_disabled and not kb.is_active:
        raise HTTPException(status_code=409, detail={"code": "KB_DISABLED", "message": "知识库已禁用，请联系管理员启用"})
    return kb


def get_manageable_kb(db: Session, kb_id: str, user: User, *, allow_disabled: bool = False) -> KnowledgeBase:
    kb = get_accessible_kb(db, kb_id, user, allow_disabled=allow_disabled)
    if kb.scope == KnowledgeBaseScope.GLOBAL:
        if user.role == UserRole.SUPER_ADMIN:
            return kb
    elif kb.scope == KnowledgeBaseScope.ORGANIZATION:
        if user.role == UserRole.SUPER_ADMIN:
            return kb
    elif kb.scope == KnowledgeBaseScope.DEPARTMENT:
        if user.role == UserRole.SUPER_ADMIN or (user.role == UserRole.DEPT_ADMIN and kb.target_id == user.department_id):
            return kb
    raise HTTPException(status_code=403, detail={"code": "KB_READ_ONLY", "message": "您没有该知识库的编辑权限"})


def serialize_kb(
    kb: KnowledgeBase,
    org_name: str | None,
    department_name: str | None,
    document_count: int,
    chunk_count: int,
) -> dict:
    if kb.scope == KnowledgeBaseScope.GLOBAL:
        target_name = "全系统"
    elif kb.scope == KnowledgeBaseScope.ORGANIZATION:
        target_name = org_name
    else:
        target_name = department_name
    return {
        "id": kb.id,
        "is_active": kb.is_active,
        "name": kb.name,
        "description": kb.description,
        "scope": kb.scope,
        "target_id": kb.target_id,
        "org_id": kb.org_id,
        "department_id": kb.department_id,
        "created_by": kb.created_by,
        "org_name": org_name,
        "department_name": department_name,
        "target_name": target_name,
        "document_count": document_count,
        "chunk_count": chunk_count,
    }


def resolve_kb_scope_target(
    db: Session,
    scope: KnowledgeBaseScope,
    target_id: str | None,
    org_id: str | None,
    current_user: User,
) -> tuple[Organization, Department, str | None]:
    if scope == KnowledgeBaseScope.GLOBAL:
        if current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "仅超级管理员可配置全局公共知识库"})
        org = db.get(Organization, current_user.org_id)
        department = db.get(Department, current_user.department_id)
        if not org or not department:
            raise HTTPException(status_code=400, detail={"code": "TARGET_INVALID", "message": "当前管理员组织或部门不可用"})
        return org, department, None

    if scope == KnowledgeBaseScope.ORGANIZATION:
        if current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "仅超级管理员可配置组织级知识库"})
        resolved_org_id = target_id or org_id
        if not resolved_org_id:
            raise HTTPException(status_code=400, detail={"code": "TARGET_ID_REQUIRED", "message": "组织级知识库必须指定目标组织"})
        org = db.get(Organization, resolved_org_id)
        if not org:
            raise HTTPException(status_code=404, detail={"code": "ORG_NOT_FOUND", "message": "目标组织不存在或状态异常"})
        department = db.scalar(select(Department).where(Department.org_id == org.id).order_by(Department.created_at.asc()))
        if not department:
            raise HTTPException(status_code=400, detail={"code": "TARGET_INVALID", "message": "目标组织暂无可用部门"})
        return org, department, org.id

    if not target_id:
        raise HTTPException(status_code=400, detail={"code": "TARGET_ID_REQUIRED", "message": "部门级知识库必须指定目标部门"})
    department = db.get(Department, target_id)
    if not department:
        raise HTTPException(status_code=404, detail={"code": "DEPARTMENT_NOT_FOUND", "message": "目标部门不存在"})
    if current_user.role != UserRole.SUPER_ADMIN and department.id != current_user.department_id:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "部门管理员只能配置本部门知识库"})
    org = db.get(Organization, department.org_id)
    if not org:
        raise HTTPException(status_code=400, detail={"code": "TARGET_INVALID", "message": "目标组织不可用"})
    return org, department, department.id
