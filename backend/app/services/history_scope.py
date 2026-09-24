from dataclasses import dataclass

from sqlalchemy import false, or_, select, true
from sqlalchemy.orm import Session

from app.models.chat import ChatSession
from app.models.department import Department
from app.models.enums import KnowledgeBaseScope, UserRole
from app.models.knowledge_base import KnowledgeBase
from app.models.user import User


@dataclass(frozen=True)
class DataScope:
    is_admin: bool = False
    user_id: str | None = None
    org_id: str | None = None
    dept_ids: tuple[str, ...] | None = None


def department_tree_ids(db: Session, org_id: str, department_id: str) -> tuple[str, ...]:
    tree = select(Department.id).where(
        Department.id == department_id, Department.org_id == org_id,
    ).cte("department_tree", recursive=True)
    # UNION (not UNION ALL) terminates even if corrupt legacy data has a cycle.
    tree = tree.union(select(Department.id).join(tree, Department.parent_id == tree.c.id).where(Department.org_id == org_id))
    return tuple(db.scalars(select(tree.c.id)).all())


def get_data_scope(db: Session, user: User) -> DataScope:
    if user.role == UserRole.SUPER_ADMIN:
        return DataScope(is_admin=True)
    if user.role == UserRole.DEPT_ADMIN:
        return DataScope(org_id=user.org_id, dept_ids=department_tree_ids(db, user.org_id, user.department_id))
    if user.role == UserRole.USER:
        return DataScope(user_id=user.id)
    return DataScope()


def scope_condition(scope: DataScope):
    if scope.is_admin:
        return true()
    if scope.user_id is not None:
        return ChatSession.user_id == scope.user_id
    if scope.dept_ids:
        return (ChatSession.org_id == scope.org_id) & ChatSession.department_id.in_(scope.dept_ids)
    return false()


def apply_data_scope(stmt, scope: DataScope):
    return stmt.where(scope_condition(scope))


def visible_kb_condition(user: User, scope: DataScope):
    if scope.is_admin:
        return true()
    dept_ids = scope.dept_ids if scope.dept_ids is not None else (user.department_id,)
    return or_(
        KnowledgeBase.scope == KnowledgeBaseScope.GLOBAL,
        (KnowledgeBase.scope == KnowledgeBaseScope.ORGANIZATION) & (KnowledgeBase.target_id == user.org_id),
        (KnowledgeBase.scope == KnowledgeBaseScope.DEPARTMENT) & (KnowledgeBase.org_id == user.org_id) & KnowledgeBase.target_id.in_(dept_ids),
    )
