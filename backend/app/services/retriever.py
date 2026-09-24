from dataclasses import dataclass
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.chunk import DocumentChunk
from app.models.document import Document
from app.models.enums import KnowledgeBaseScope
from app.models.knowledge_base import KnowledgeBase
from app.services.embedding import EmbeddingService


@dataclass
class RetrievedChunk:
    chunk_id: str
    document_id: str
    document_name: str
    content: str
    score: float | None


class RetrieverService:
    def __init__(self, embedding_service: EmbeddingService):
        self.embedding_service = embedding_service

    def _has_text_overlap(self, question: str, content: str) -> bool:
        terms: set[str] = set()
        for token in re.findall(r"[\u4e00-\u9fff]{2,}", question):
            for size in (2, 3, 4):
                terms.update(token[index:index + size] for index in range(0, max(len(token) - size + 1, 0)))
        terms.update(re.findall(r"[A-Za-z0-9]{2,}", question))
        if not terms:
            return True
        return any(term in content for term in terms)

    def retrieve(
        self,
        db: Session,
        *,
        question: str,
        knowledge_base_id: str,
        scope: KnowledgeBaseScope,
        org_id: str,
        department_id: str,
        limit: int = 6,
    ) -> list[RetrievedChunk]:
        query_embedding = self.embedding_service.embed_query(question)
        filters = [
            KnowledgeBase.is_active.is_(True),
            DocumentChunk.knowledge_base_id == knowledge_base_id,
            Document.knowledge_base_id == knowledge_base_id,
        ]
        if scope == KnowledgeBaseScope.ORGANIZATION:
            filters.extend([DocumentChunk.org_id == org_id, Document.org_id == org_id])
        elif scope == KnowledgeBaseScope.DEPARTMENT:
            filters.extend([
                DocumentChunk.org_id == org_id,
                DocumentChunk.department_id == department_id,
                Document.org_id == org_id,
            ])
        vector_stmt = (
            select(DocumentChunk, Document.file_name, DocumentChunk.embedding.cosine_distance(query_embedding).label("score"))
            .join(Document, Document.id == DocumentChunk.document_id)
            .join(KnowledgeBase, KnowledgeBase.id == DocumentChunk.knowledge_base_id)
            .where(*filters)
            .order_by("score")
            .limit(limit)
        )
        try:
            rows = db.execute(vector_stmt).all()
        except Exception:
            rows = []

        results = [
            RetrievedChunk(chunk_id=chunk.id, document_id=chunk.document_id, document_name=file_name, content=chunk.content, score=float(score) if score is not None else None)
            for chunk, file_name, score in rows
            if self._has_text_overlap(question, chunk.content)
        ]
        if results:
            return results

        keyword_stmt = (
            select(DocumentChunk, Document.file_name)
            .join(Document, Document.id == DocumentChunk.document_id)
            .join(KnowledgeBase, KnowledgeBase.id == DocumentChunk.knowledge_base_id)
            .where(*filters, DocumentChunk.content.ilike(f"%{question[:20]}%"))
            .limit(limit)
        )
        return [
            RetrievedChunk(chunk_id=chunk.id, document_id=chunk.document_id, document_name=file_name, content=chunk.content, score=None)
            for chunk, file_name in db.execute(keyword_stmt).all()
        ]
