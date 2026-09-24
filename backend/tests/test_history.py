from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.history import router
from app.api.sessions import get_accessible_session, delete_session
from app.api.departments import validate_parent
from app.core.database import Base, get_db
from app.dependencies import get_current_user
from app.models import Organization, Department, User, KnowledgeBase, ChatSession, ChatMessage
from app.models.enums import KnowledgeBaseScope, UserRole, MessageRole
from app.schemas.history import HistoryQuery
from app.services.history import list_history, history_options
from app.services.history_scope import get_data_scope, department_tree_ids
from app.services.session_history import prepare_session, save_round


@compiles(JSONB, "sqlite")
def compile_jsonb(element, compiler, **kw):
    return "JSON"


@pytest.fixture
def history_data():
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine, tables=[m.__table__ for m in (Organization, Department, User, KnowledgeBase, ChatSession, ChatMessage)])
    with Session(engine) as db:
        org = Organization(name="org")
        other_org = Organization(name="other")
        db.add_all([org, other_org]); db.flush()
        root = Department(name="root", org_id=org.id)
        sibling = Department(name="sibling", org_id=org.id)
        foreign = Department(name="foreign", org_id=other_org.id)
        db.add_all([root, sibling, foreign]); db.flush()
        child = Department(name="child", org_id=org.id, parent_id=root.id)
        db.add(child); db.flush()
        grandchild = Department(name="grandchild", org_id=org.id, parent_id=child.id)
        db.add(grandchild); db.flush()
        def make_user(name, department, role=UserRole.USER):
            u = User(username=name, full_name=name + "姓名", hashed_password="unused", role=role, org_id=department.org_id, department_id=department.id)
            db.add(u); db.flush(); return u
        admin = make_user("admin", root, UserRole.SUPER_ADMIN)
        manager = make_user("manager", root, UserRole.DEPT_ADMIN)
        employee = make_user("employee", root)
        child_user = make_user("child-user", child)
        grand_user = make_user("grand-user", grandchild)
        sibling_user = make_user("sibling-user", sibling)
        foreign_user = make_user("foreign-user", foreign)
        def make_kb(name, dept, scope=KnowledgeBaseScope.DEPARTMENT):
            kb = KnowledgeBase(name=name, scope=scope, org_id=dept.org_id, department_id=dept.id, target_id=dept.id if scope == KnowledgeBaseScope.DEPARTMENT else None, created_by=admin.id)
            db.add(kb); db.flush(); return kb
        kb = make_kb("财务知识库", root)
        child_kb = make_kb("child-kb", child)
        foreign_kb = make_kb("secret-kb", foreign)
        global_kb = make_kb("global-kb", foreign, KnowledgeBaseScope.GLOBAL)
        def make_history(user, kb, title, rounds, day):
            s = prepare_session(db, user, kb.id, title)
            for i in range(rounds):
                save_round(db, s, "报销审批原始问题" if i == 0 else "follow-up", "answer", [])
            s.updated_at = datetime(2026, 9, day, tzinfo=UTC)
            db.commit(); return s
        own = make_history(employee, kb, "报销流程", 2, 20)
        children = make_history(child_user, child_kb, "child title", 3, 21)
        grandchildren = make_history(grand_user, child_kb, "grand title", 1, 22)
        outsider = make_history(sibling_user, kb, "sibling title", 4, 23)
        cross_org = make_history(foreign_user, foreign_kb, "foreign title", 5, 24)
        empty = make_history(employee, kb, "empty", 0, 19)
        yield SimpleNamespace(**locals())
    engine.dispose()


def ids(page):
    return {item.id for item in page.items}


def test_three_scopes_and_forged_parameters(history_data):
    h = history_data
    all_ids = {h.own.id, h.children.id, h.grandchildren.id, h.outsider.id, h.cross_org.id, h.empty.id}
    assert ids(list_history(h.db, h.admin, HistoryQuery())) == all_ids
    assert ids(list_history(h.db, h.manager, HistoryQuery(org_id=h.other_org.id, dept_id=h.foreign.id))) == {h.own.id, h.children.id, h.grandchildren.id, h.empty.id}
    assert ids(list_history(h.db, h.employee, HistoryQuery(org_id=h.other_org.id, dept_id=h.foreign.id, user_id=h.foreign_user.id))) == {h.own.id, h.empty.id}
    with pytest.raises(HTTPException):
        get_accessible_session(h.db, h.cross_org.id, h.manager)
    assert get_accessible_session(h.db, h.cross_org.id, h.admin).id == h.cross_org.id
    with pytest.raises(HTTPException):
        delete_session(h.own.id, h.manager, h.db)


def test_filter_options_hierarchy_and_kb_permissions(history_data):
    h = history_data
    options = history_options(h.db, h.manager)
    assert options.organizations == []
    assert {o.id for o in options.departments} == {h.root.id, h.child.id, h.grandchild.id}
    assert h.foreign_kb.id not in {o.id for o in options.knowledge_bases}
    assert h.global_kb.id in {o.id for o in options.knowledge_bases}
    assert h.foreign_user.id not in {o.id for o in options.users}
    employee_options = history_options(h.db, h.employee)
    assert employee_options.organizations == employee_options.departments == employee_options.users == []
    assert h.child_kb.id not in {o.id for o in employee_options.knowledge_bases}
    for user in (h.manager, h.employee):
        with pytest.raises(HTTPException) as exc:
            list_history(h.db, user, HistoryQuery(kb_id=h.foreign_kb.id))
        assert exc.value.status_code == 403
    with pytest.raises(HTTPException):
        list_history(h.db, h.manager, HistoryQuery(user_id=h.foreign_user.id))
    assert ids(list_history(h.db, h.manager, HistoryQuery(kb_id=h.child_kb.id))) == {h.children.id, h.grandchildren.id}
    assert {o.id for o in history_options(h.db, h.admin, h.other_org.id).departments} == {h.foreign.id}


@pytest.mark.parametrize("keyword,expected", [("报销流程", "own"), ("employee姓名", "own"), ("财务知识库", "own"), ("报销审批原始问题", "own")])
def test_keyword_matches_title_user_kb_and_question(history_data, keyword, expected):
    h = history_data
    assert getattr(h, expected).id in ids(list_history(h.db, h.admin, HistoryQuery(keyword=keyword)))
    assert list_history(h.db, h.admin, HistoryQuery(keyword="%_不存在")).items == []


@pytest.mark.parametrize("column", ["round_count", "updated_at"])
@pytest.mark.parametrize("direction", ["asc", "desc"])
def test_sorting_and_pagination(history_data, column, direction):
    h = history_data
    page = list_history(h.db, h.admin, HistoryQuery(sort_by=column, sort_order=direction))
    values = [getattr(item, column) for item in page.items]
    assert values == sorted(values, reverse=direction == "desc")
    first = list_history(h.db, h.admin, HistoryQuery(sort_by=column, sort_order=direction, page_size=2))
    second = list_history(h.db, h.admin, HistoryQuery(sort_by=column, sort_order=direction, page_size=2, page=2))
    assert first.total == second.total == 6
    assert not ids(first) & ids(second)
    assert ids(first) | ids(second) == {item.id for item in page.items[:4]}


def test_time_filters_and_empty_page(history_data):
    h = history_data
    query = HistoryQuery(start_time="2026-09-20T00:00:00Z", end_time="2026-09-21T00:00:00Z")
    assert ids(list_history(h.db, h.admin, query)) == {h.own.id, h.children.id}
    assert list_history(h.db, h.admin, HistoryQuery(page=100)).items == []
    with pytest.raises(HTTPException):
        list_history(h.db, h.admin, HistoryQuery(start_time="2026-09-22T00:00:00Z", end_time="2026-09-20T00:00:00Z"))


def test_transfer_snapshot_and_new_session(history_data):
    h = history_data
    previous_count = h.own.round_count
    h.employee.department_id = h.sibling.id
    h.employee.full_name = "改名后"
    h.db.commit()
    old = list_history(h.db, h.manager, HistoryQuery(user_id=h.employee.id))
    assert h.own.id in ids(old)
    assert next(item for item in old.items if item.id == h.own.id).user_name == "employee姓名"
    new = prepare_session(h.db, h.employee, h.kb.id, "调岗后", h.own)
    assert new.id != h.own.id and new.department_id == h.sibling.id
    save_round(h.db, new, "question", "answer", [])
    assert h.own.round_count == previous_count
    assert h.own.department_id == h.root.id
    assert new.id not in ids(list_history(h.db, h.manager, HistoryQuery()))
    assert new.id in ids(list_history(h.db, h.employee, HistoryQuery()))


def test_save_round_snapshot_atomic_count_and_kb_switch(history_data):
    h = history_data
    s = prepare_session(h.db, h.employee, h.global_kb.id, "global")
    assert s.org_id == h.employee.org_id and s.department_id == h.employee.department_id
    save_round(h.db, s, "q", "a", [])
    save_round(h.db, s, "q2", "a2", [])
    h.db.refresh(s)
    assert s.round_count == 2
    assert h.db.scalar(select(func.count(ChatMessage.id)).where(ChatMessage.session_id == s.id)) == 4
    assert prepare_session(h.db, h.employee, h.global_kb.id, "same", s).id == s.id
    assert prepare_session(h.db, h.employee, h.kb.id, "different", s).id != s.id
    with pytest.raises(HTTPException):
        prepare_session(h.db, h.manager, h.kb.id, "impersonate", h.own)


def test_parent_validation_and_cycle_safe_scope(history_data):
    h = history_data
    for parent in (h.root.id, h.child.id, h.foreign.id):
        with pytest.raises(HTTPException):
            validate_parent(h.db, parent, h.org.id, h.root)
    h.root.parent_id = h.grandchild.id
    h.db.commit()
    assert set(department_tree_ids(h.db, h.org.id, h.root.id)) == {h.root.id, h.child.id, h.grandchild.id}


def test_http_contract_and_query_validation(history_data):
    h = history_data
    app = FastAPI(); app.include_router(router, prefix="/api/qa-history")
    app.dependency_overrides[get_db] = lambda: h.db
    app.dependency_overrides[get_current_user] = lambda: h.employee
    with TestClient(app) as client:
        response = client.get("/api/qa-history")
        assert response.status_code == 200 and response.json()["total"] == 2
        assert response.json()["items"][0]["round_count"] == 2
        assert client.get("/api/qa-history/filter-options").json()["organizations"] == []
        for query in ("page=0", "page_size=101", "sort_by=unknown", "sort_order=unknown", "kb_id=bad", "start_time=2026-09-01T00:00:00"):
            assert client.get("/api/qa-history?" + query).status_code == 422
        assert client.get("/api/qa-history?keyword=no-such-title").json()["items"] == []


def test_stream_to_history_persists_rounds_and_author_snapshot(history_data, monkeypatch):
    from app.api import chat
    h = history_data
    async def answer(prompt):
        yield "完整"
        yield "回答"
    monkeypatch.setattr(chat, "stream_deepseek_answer", answer)
    monkeypatch.setattr(chat, "get_embedding_service", lambda: None)
    monkeypatch.setattr(chat.RetrieverService, "retrieve", lambda *args, **kwargs: [])
    app = FastAPI()
    app.include_router(chat.router, prefix="/api/chat")
    app.include_router(router, prefix="/api/qa-history")
    app.dependency_overrides[get_db] = lambda: h.db
    app.dependency_overrides[get_current_user] = lambda: h.employee
    with TestClient(app) as client:
        response = client.post("/api/chat/stream", json={"knowledge_base_id": h.global_kb.id, "question": "stream history unique"})
        assert response.status_code == 200
        assert all(f"event: {name}" in response.text for name in ("metadata", "delta", "done"))
        rows = client.get("/api/qa-history?keyword=stream%20history%20unique").json()["items"]
        assert len(rows) == 1
        item = rows[0]
        assert item["round_count"] == 1 and item["dept_id"] == h.root.id and item["org_id"] == h.org.id
        response = client.post("/api/chat/stream", json={"knowledge_base_id": h.global_kb.id, "session_id": item["id"], "question": "second question"})
        assert response.status_code == 200
        item2 = client.get("/api/qa-history?keyword=stream%20history%20unique").json()["items"][0]
        assert item2["round_count"] == 2
        assert item2["updated_at"] >= item["updated_at"]
