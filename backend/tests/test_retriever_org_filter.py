from app.models.enums import KnowledgeBaseScope
from app.services.retriever import RetrieverService


class _Rows:
    def all(self):
        return []


class _FakeSession:
    def __init__(self):
        self.statements = []

    def execute(self, statement):
        self.statements.append(statement)
        return _Rows()


class _FakeEmbeddingService:
    def embed_query(self, question: str):
        return [0.0] * 384


def test_retriever_filters_vectors_and_keyword_fallback_by_org_id():
    db = _FakeSession()
    retriever = RetrieverService(_FakeEmbeddingService())

    results = retriever.retrieve(
        db,
        question="审批流程",
        knowledge_base_id="kb-a",
        scope=KnowledgeBaseScope.ORGANIZATION,
        org_id="org-a",
        department_id="dept-a",
    )

    assert results == []
    assert len(db.statements) == 2

    vector_sql = str(db.statements[0])
    keyword_sql = str(db.statements[1])
    assert "knowledge_bases.is_active IS true" in vector_sql
    assert "knowledge_bases.is_active IS true" in keyword_sql
    assert "document_chunks.org_id" in vector_sql
    assert "documents.org_id" in vector_sql
    assert "document_chunks.org_id" in keyword_sql
    assert "documents.org_id" in keyword_sql


def test_retriever_allows_global_scope_without_org_filter():
    db = _FakeSession()
    retriever = RetrieverService(_FakeEmbeddingService())

    results = retriever.retrieve(
        db,
        question="审批流程",
        knowledge_base_id="kb-global",
        scope=KnowledgeBaseScope.GLOBAL,
        org_id="org-a",
        department_id="dept-a",
    )

    assert results == []
    vector_sql = str(db.statements[0])
    assert "document_chunks.knowledge_base_id" in vector_sql
    where_sql = vector_sql.split("WHERE", 1)[1]
    assert "document_chunks.org_id" not in where_sql
