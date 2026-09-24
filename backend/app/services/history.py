from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.chat import ChatMessage, ChatSession
from app.models.department import Department
from app.models.enums import MessageRole
from app.models.knowledge_base import KnowledgeBase
from app.models.organization import Organization
from app.models.user import User
from app.schemas.history import HistoryItem, HistoryOptions, HistoryPage, HistoryQuery
from app.services.history_scope import apply_data_scope, get_data_scope, visible_kb_condition


def allowed_users_stmt(user: User, scope):
    stmt = select(User)
    if scope.is_admin:
        return stmt
    if scope.dept_ids is not None:
        historical_authors = apply_data_scope(select(ChatSession.user_id), scope)
        return stmt.where(or_(
            (User.org_id == user.org_id) & User.department_id.in_(scope.dept_ids),
            User.id.in_(historical_authors),
        ))
    return stmt.where(User.id == user.id)


def list_history(db: Session, user: User, query: HistoryQuery) -> HistoryPage:
    if query.start_time and query.end_time and query.start_time > query.end_time:
        raise HTTPException(422, detail={"code": "INVALID_TIME_RANGE", "message": "开始时间不能晚于结束时间"})
    scope = get_data_scope(db, user)
    stmt = select(ChatSession).join(User, User.id == ChatSession.user_id).join(
        KnowledgeBase, KnowledgeBase.id == ChatSession.knowledge_base_id,
    ).join(Organization, Organization.id == ChatSession.org_id).join(Department, Department.id == ChatSession.department_id)
    stmt = apply_data_scope(stmt, scope)
    if scope.is_admin:
        if query.org_id:
            stmt = stmt.where(ChatSession.org_id == str(query.org_id))
        if query.dept_id:
            stmt = stmt.where(ChatSession.department_id == str(query.dept_id))
    # Department/user requests cannot expand their scope using org/dept params.
    if query.user_id and scope.user_id is None:
        target_id = str(query.user_id)
        if not db.scalar(allowed_users_stmt(user, scope).where(User.id == target_id)):
            raise HTTPException(403, detail={"code": "HISTORY_USER_FORBIDDEN", "message": "无权筛选该用户"})
        stmt = stmt.where(ChatSession.user_id == target_id)
    if query.kb_id:
        target_id = str(query.kb_id)
        if not db.scalar(select(KnowledgeBase.id).where(KnowledgeBase.id == target_id, visible_kb_condition(user, scope))):
            raise HTTPException(403, detail={"code": "HISTORY_KB_FORBIDDEN", "message": "无权筛选该知识库"})
        stmt = stmt.where(ChatSession.knowledge_base_id == target_id)
    keyword = (query.keyword or "").strip()
    if keyword:
        # Treat wildcard characters as literal input, not an unbounded wildcard.
        escaped = keyword.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        questions = select(ChatMessage.id).where(
            ChatMessage.session_id == ChatSession.id,
            ChatMessage.role == MessageRole.USER,
            ChatMessage.content.ilike(pattern, escape="\\"),
        ).exists()
        stmt = stmt.where(or_(
            ChatSession.title.ilike(pattern, escape="\\"),
            ChatSession.user_name_snapshot.ilike(pattern, escape="\\"),
            User.username.ilike(pattern, escape="\\"),
            User.full_name.ilike(pattern, escape="\\"),
            KnowledgeBase.name.ilike(pattern, escape="\\"),
            questions,
        ))
    if query.start_time:
        stmt = stmt.where(ChatSession.updated_at >= query.start_time)
    if query.end_time:
        stmt = stmt.where(ChatSession.updated_at <= query.end_time)
    total = db.scalar(select(func.count()).select_from(stmt.with_only_columns(ChatSession.id).subquery())) or 0
    order_col = ChatSession.round_count if query.sort_by == "round_count" else ChatSession.updated_at
    order = order_col.asc() if query.sort_order == "asc" else order_col.desc()
    rows = db.execute(stmt.add_columns(User.username, User.full_name, Organization.name, Department.name, KnowledgeBase.name)
                      .order_by(order, ChatSession.id.asc()).offset((query.page - 1) * query.page_size).limit(query.page_size)).all()
    return HistoryPage(items=[HistoryItem(
        id=s.id, title=s.title, user_id=s.user_id, user_name=s.user_name_snapshot or full_name or username,
        org_id=s.org_id, org_name=org_name, dept_id=s.department_id, dept_name=dept_name,
        kb_id=s.knowledge_base_id, kb_name=kb_name, round_count=s.round_count,
        created_at=s.created_at, updated_at=s.updated_at,
    ) for s, username, full_name, org_name, dept_name, kb_name in rows], total=total, page=query.page, page_size=query.page_size)


def history_options(db: Session, user: User, org_id: str | None = None) -> HistoryOptions:
    scope = get_data_scope(db, user)
    orgs = db.scalars(select(Organization).order_by(Organization.name)).all() if scope.is_admin else []
    departments = []
    if scope.is_admin or scope.dept_ids is not None:
        stmt = select(Department)
        if scope.is_admin:
            if org_id:
                stmt = stmt.where(Department.org_id == org_id)
        else:
            stmt = stmt.where(Department.org_id == user.org_id, Department.id.in_(scope.dept_ids))
        departments = db.scalars(stmt.order_by(Department.name)).all()
    kbs = db.scalars(select(KnowledgeBase).where(visible_kb_condition(user, scope)).order_by(KnowledgeBase.name)).all()
    users = db.scalars(allowed_users_stmt(user, scope).order_by(User.username)).all() if scope.user_id is None else []
    return HistoryOptions(
        organizations=[{"id": o.id, "name": o.name} for o in orgs],
        departments=[{"id": d.id, "name": d.name, "org_id": d.org_id} for d in departments],
        knowledge_bases=[{"id": k.id, "name": k.name, "org_id": k.org_id, "department_id": k.department_id} for k in kbs],
        users=[{"id": u.id, "name": u.full_name or u.username, "org_id": u.org_id, "department_id": u.department_id} for u in users],
    )
