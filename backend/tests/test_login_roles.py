from itertools import product
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.testclient import TestClient

from app.api import auth
from app.core.database import get_db
from app.models.enums import UserRole
from app.schemas.auth import LoginRequest


@pytest.fixture
def login_context(monkeypatch):
    user = SimpleNamespace(id="test-user", role=UserRole.USER, is_active=True, hashed_password="unused")
    db = Mock()
    db.scalar.return_value = user
    spies = {}
    for name in ("verify_password", "create_auth_session", "create_legacy_tokens", "build_auth_response", "write_audit_log"):
        spies[name] = Mock()
        monkeypatch.setattr(auth, name, spies[name])
    spies["verify_password"].return_value = True
    spies["create_legacy_tokens"].return_value = ("test-access", "test-refresh")
    request = Request({"type": "http", "headers": []})
    return user, db, spies, request


@pytest.mark.parametrize("actual,selected", list(product(UserRole, repeat=2)))
def test_all_role_combinations(login_context, actual, selected):
    user, db, spies, request = login_context
    user.role = actual
    response = Response()
    payload = LoginRequest(username="test-user", password="test-input", role=selected)
    if actual == selected:
        auth.login(payload, request, response, db)
        spies["create_auth_session"].assert_called_once_with(db, user, request, response)
        spies["create_legacy_tokens"].assert_called_once_with(user)
        spies["build_auth_response"].assert_called_once_with(user, "test-access", "test-refresh", db)
    else:
        with pytest.raises(HTTPException) as error:
            auth.login(payload, request, response, db)
        assert error.value.status_code == 403
        assert error.value.detail == {
            "code": "ROLE_MISMATCH",
            "message": "所选角色与账号角色不一致，请选择正确的登录角色",
        }
        spies["create_auth_session"].assert_not_called()
        spies["create_legacy_tokens"].assert_not_called()
        spies["build_auth_response"].assert_not_called()
        assert "set-cookie" not in response.headers
        assert spies["write_audit_log"].call_args.kwargs["metadata"]["reason"] == "ROLE_MISMATCH"
    assert user.role == actual


@pytest.mark.parametrize("case,status,code", [("password", 401, "UNAUTHORIZED"), ("missing", 401, "UNAUTHORIZED"), ("disabled", 403, "USER_DISABLED")])
def test_other_login_errors_remain_distinct(login_context, case, status, code):
    user, db, spies, request = login_context
    if case == "password":
        spies["verify_password"].return_value = False
    elif case == "missing":
        db.scalar.return_value = None
    else:
        user.is_active = False
    with pytest.raises(HTTPException) as error:
        auth.login(LoginRequest(username="test-user", password="test-input", role=UserRole.SUPER_ADMIN), request, Response(), db)
    assert error.value.status_code == status
    assert error.value.detail["code"] == code
    spies["create_auth_session"].assert_not_called()
    spies["create_legacy_tokens"].assert_not_called()


def test_role_validation_and_mismatch_http_response(login_context):
    user, db, spies, _ = login_context
    app = FastAPI()
    app.include_router(auth.router, prefix="/api/auth")
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as client:
        base = {"username": "test-user", "password": "test-input"}
        for payload in (base, {**base, "role": None}, {**base, "role": "invalid"}):
            assert client.post("/api/auth/login", json=payload).status_code == 422
        db.scalar.assert_not_called()
        response = client.post("/api/auth/login", json={**base, "role": "super_admin"})
        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "ROLE_MISMATCH"
        assert "角色不一致" in response.json()["detail"]["message"]
        assert "set-cookie" not in response.headers
        spies["create_auth_session"].assert_not_called()
