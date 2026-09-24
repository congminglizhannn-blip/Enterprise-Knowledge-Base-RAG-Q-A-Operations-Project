from types import SimpleNamespace
from uuid import NAMESPACE_URL, uuid5

import pytest
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session

from app.api.sessions import list_sessions
from app.models.enums import MessageRole, UserRole
from app.models.chat import ChatMessage, ChatSession
from app.models.department import Department


@compiles(JSONB, "sqlite")
def compile_jsonb_for_sqlite(element, compiler, **kw):
    return "JSON"


class _Rows:
    def all(self):
        return []


class _FakeSession:
    def __init__(self):
        self.statement = None

    def scalars(self, statement):
        self.statement = statement
        return _Rows()


def test_super_admin_session_list_is_global():
    db = _FakeSession()
    user = SimpleNamespace(id="user-1", org_id="org-1", role=UserRole.SUPER_ADMIN)

    assert list_sessions(user, db) == []

    sql = str(db.statement)
    assert "chat_sessions.org_id" in sql
    assert "chat_sessions.user_id" in sql
    assert "WHERE true" in sql


@pytest.mark.parametrize("role", [UserRole.USER, UserRole.DEPT_ADMIN, UserRole.SUPER_ADMIN])
def test_round_counts_are_per_session_and_permission_scoped(role):
    def identifier(name):
        return str(uuid5(NAMESPACE_URL, name))

    engine = create_engine("sqlite://")
    ChatSession.__table__.create(engine)
    ChatMessage.__table__.create(engine)
    Department.__table__.create(engine)
    with Session(engine) as db:
        db.add(Department(id=identifier("dept"), name="dept", org_id=identifier("org")))
        db.flush()
        def add_session(owner, org, rounds, pending=False):
            session = ChatSession(user_id=identifier(owner), org_id=identifier(org), department_id=identifier("dept"), knowledge_base_id=identifier("kb"), title="test", round_count=rounds)
            db.add(session)
            db.flush()
            for _ in range(rounds):
                db.add_all([
                    ChatMessage(session_id=session.id, role=MessageRole.USER, content="question"),
                    ChatMessage(session_id=session.id, role=MessageRole.ASSISTANT, content="answer"),
                ])
            if pending:
                db.add(ChatMessage(session_id=session.id, role=MessageRole.USER, content="pending"))
            return session

        first = add_session("me", "org", 2, pending=True)
        second = add_session("me", "org", 1)
        empty = add_session("me", "org", 0)
        unanswered = add_session("me", "org", 0, pending=True)
        colleague = add_session("colleague", "org", 3)
        foreign = add_session("other", "other-org", 4)
        db.commit()
        user = SimpleNamespace(id=identifier("me"), org_id=identifier("org"), department_id=identifier("dept"), role=role)
        counts = {row.id: row.qa_round_count for row in list_sessions(user, db)}
        expected = {first.id: 2, second.id: 1, empty.id: 0, unanswered.id: 0}
        personal = {row.id: row.qa_round_count for row in list_sessions(user, db, scope="mine")}
        assert personal == expected
        if role in (UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN):
            expected[colleague.id] = 3
        if role == UserRole.SUPER_ADMIN:
            expected[foreign.id] = 4
        assert counts == expected
        if role != UserRole.SUPER_ADMIN:
            assert foreign.id not in counts
    engine.dispose()
