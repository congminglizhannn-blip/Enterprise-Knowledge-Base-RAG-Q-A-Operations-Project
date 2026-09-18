from types import SimpleNamespace

from app.api.sessions import list_sessions
from app.models.enums import UserRole


class _Rows:
    def all(self):
        return []


class _FakeSession:
    def __init__(self):
        self.statement = None

    def scalars(self, statement):
        self.statement = statement
        return _Rows()


def test_super_admin_session_list_includes_current_org_or_own_sessions():
    db = _FakeSession()
    user = SimpleNamespace(id="user-1", org_id="org-1", role=UserRole.SUPER_ADMIN)

    assert list_sessions(user, db) == []

    sql = str(db.statement)
    assert "chat_sessions.org_id" in sql
    assert "chat_sessions.user_id" in sql
    assert " OR " in sql

