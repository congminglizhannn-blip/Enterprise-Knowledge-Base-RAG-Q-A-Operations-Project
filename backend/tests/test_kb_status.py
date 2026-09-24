"""Exercise persisted KB status and business guards against an isolated database."""
import asyncio
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.knowledge_bases import (
    get_accessible_kb, list_knowledge_bases, update_knowledge_base_status,
    router,
)
from app.api.documents import get_document, list_documents, parse_document, delete_document
from app.api.upload import import_link, upload_file
from app.api.chat import stream_chat
from app.core.database import Base, get_db
from app.dependencies import get_current_user, require_csrf_token
from app.models import Organization, Department, User, KnowledgeBase, Document, DocumentChunk
from app.models.enums import KnowledgeBaseScope, UserRole, DocumentType
from app.schemas.kb import KnowledgeBaseStatusUpdate


@compiles(JSONB, "sqlite")
def compile_jsonb_for_test(element, compiler, **kw):
    return "JSON"


@pytest.fixture
def data():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    tables = [model.__table__ for model in (Organization, Department, User, KnowledgeBase, Document, DocumentChunk)]
    Base.metadata.create_all(engine, tables=tables)
    with Session(engine) as db:
        org = Organization(name="test")
        db.add(org)
        db.flush()
        dept = Department(name="one", org_id=org.id)
        other = Department(name="two", org_id=org.id)
        db.add_all([dept, other])
        db.flush()
        admin = User(username="admin", hashed_password="unused", role=UserRole.SUPER_ADMIN, org_id=org.id, department_id=dept.id)
        db.add(admin)
        db.flush()
        kb = KnowledgeBase(name="test", scope=KnowledgeBaseScope.DEPARTMENT, target_id=dept.id, org_id=org.id, department_id=dept.id, created_by=admin.id)
        db.add(kb)
        db.flush()
        doc = Document(knowledge_base_id=kb.id, org_id=org.id, department_id=dept.id, file_name="test.pdf", file_type=DocumentType.PDF, file_path="unused", uploaded_by=admin.id, chunk_count=1)
        db.add(doc)
        db.flush()
        db.add(DocumentChunk(document_id=doc.id, knowledge_base_id=kb.id, org_id=org.id, department_id=dept.id, chunk_index=0, content="preserved", content_hash="test", source_type="pdf"))
        db.commit()
        yield db, admin, kb, doc, other
    engine.dispose()


def toggle(db, user, kb, active):
    return update_knowledge_base_status(kb.id, KnowledgeBaseStatusUpdate(is_active=active), user, db)


def test_disable_preserves_content_and_enable_restores_access(data):
    db, admin, kb, doc, _ = data
    for _ in range(2):
        result = toggle(db, admin, kb, False)
        assert result["is_active"] is False
        assert result["document_count"] == result["chunk_count"] == 1
    db.expire_all()
    assert db.get(KnowledgeBase, kb.id).is_active is False
    assert list_knowledge_bases(admin, db) == []
    assert list_knowledge_bases(admin, db, True)[0]["id"] == kb.id
    assert db.scalar(select(func.count(DocumentChunk.id))) == 1
    assert db.get(Document, doc.id).chunk_count == 1
    toggle(db, admin, kb, True)
    assert get_accessible_kb(db, kb.id, admin).id == kb.id
    assert list_documents(kb.id, admin, db)[0].id == doc.id


def test_status_http_contract_csrf_validation_and_removed_delete(data):
    db, admin, kb, _, _ = data
    app = FastAPI()
    app.include_router(router, prefix="/api/kbs")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: admin
    with TestClient(app) as client:
        url = f"/api/kbs/{kb.id}/status"
        assert client.patch(url, json={"is_active": False}).status_code == 403
        assert kb.is_active is True
        app.dependency_overrides[require_csrf_token] = lambda: None
        for payload in ({}, {"is_active": None}, {"is_active": "false"}):
            assert client.patch(url, json=payload).status_code == 422
        response = client.patch(url, json={"is_active": False})
        assert response.status_code == 200
        assert response.json()["is_active"] is False
        assert client.get("/api/kbs").json() == []
        assert len(client.get("/api/kbs?include_disabled=true").json()) == 1
        assert client.delete(f"/api/kbs/{kb.id}").status_code == 405
        assert client.patch(url, json={"is_active": True}).status_code == 200


@pytest.mark.parametrize("operation", ["detail", "list", "parse", "delete", "link", "file", "chat"])
def test_disabled_kb_blocks_business_entry_points(data, operation):
    db, admin, kb, doc, _ = data
    toggle(db, admin, kb, False)
    with pytest.raises(HTTPException) as error:
        if operation == "detail":
            get_document(doc.id, admin, db)
        elif operation == "list":
            list_documents(kb.id, admin, db)
        elif operation == "parse":
            parse_document(doc.id, admin, db)
        elif operation == "delete":
            delete_document(doc.id, admin, db)
        elif operation == "link":
            import_link(SimpleNamespace(knowledge_base_id=kb.id, url="https://example.com"), admin, db)
        elif operation == "file":
            asyncio.run(upload_file(kb.id, None, admin, db))
        else:
            asyncio.run(stream_chat(SimpleNamespace(knowledge_base_id=kb.id), admin, db))
    assert error.value.status_code == 409
    assert error.value.detail["code"] == "KB_DISABLED"


def test_department_permissions_and_disabled_visibility(data):
    db, admin, kb, _, other = data
    local = SimpleNamespace(role=UserRole.DEPT_ADMIN, org_id=admin.org_id, department_id=admin.department_id)
    foreign = SimpleNamespace(role=UserRole.DEPT_ADMIN, org_id=admin.org_id, department_id=other.id)
    regular = SimpleNamespace(role=UserRole.USER, org_id=admin.org_id, department_id=admin.department_id)
    toggle(db, local, kb, False)
    assert list_knowledge_bases(local, db, True)[0]["id"] == kb.id
    assert list_knowledge_bases(foreign, db, True) == []
    for user in (foreign, regular):
        with pytest.raises(HTTPException):
            toggle(db, user, kb, True)
    with pytest.raises(HTTPException):
        list_knowledge_bases(regular, db, True)
    for scope in (KnowledgeBaseScope.GLOBAL, KnowledgeBaseScope.ORGANIZATION):
        kb.scope = scope
        kb.target_id = None if scope == KnowledgeBaseScope.GLOBAL else admin.org_id
        db.commit()
        with pytest.raises(HTTPException) as error:
            toggle(db, local, kb, True)
        assert error.value.status_code == 403
        assert list_knowledge_bases(local, db, True) == []
    toggle(db, admin, kb, True)
