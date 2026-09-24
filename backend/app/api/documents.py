from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.knowledge_bases import get_accessible_kb, get_manageable_kb
from app.core.database import get_db
from app.dependencies import get_current_user, require_department_admin
from app.models.chunk import DocumentChunk
from app.models.document import Document
from app.models.user import User
from app.schemas.document import DocumentDetail, DocumentRead
from app.services.embedding import get_embedding_service
from app.services.ingestion import ingest_document

router = APIRouter()


@router.get("", response_model=list[DocumentRead])
def list_documents(knowledge_base_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    kb = get_accessible_kb(db, knowledge_base_id, current_user)
    rows = db.execute(
        select(Document)
        .add_columns(User.username, User.full_name)
        .join(User, User.id == Document.uploaded_by)
        .where(
            Document.knowledge_base_id == kb.id,
        )
        .order_by(Document.created_at.desc(), Document.id.desc())
    ).all()
    return [
        DocumentRead.model_validate({
            **document.__dict__,
            "uploader_name": full_name or username,
        })
        for document, username, full_name in rows
    ]


@router.get("/{document_id}", response_model=DocumentDetail)
def get_document(document_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(Document).where(Document.id == document_id)
    document = db.scalar(stmt)
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在或无权限")
    get_accessible_kb(db, document.knowledge_base_id, current_user)
    chunks = db.scalars(
        select(DocumentChunk)
        .where(DocumentChunk.document_id == document.id)
        .order_by(DocumentChunk.chunk_index.asc())
        .limit(8)
    ).all()
    return DocumentDetail.model_validate({**document.__dict__, "chunks": chunks})


@router.post("/{document_id}/parse", response_model=DocumentRead)
def parse_document(document_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(Document).where(Document.id == document_id)
    document = db.scalar(stmt)
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在或无权限")
    get_manageable_kb(db, document.knowledge_base_id, current_user)
    ingest_document(db, document, get_embedding_service())
    db.refresh(document)
    return document


@router.delete("/{document_id}")
def delete_document(document_id: str, current_user: User = Depends(require_department_admin), db: Session = Depends(get_db)):
    document = db.scalar(select(Document).where(Document.id == document_id))
    if not document:
        return {"message": "文档不存在或无权限"}
    get_manageable_kb(db, document.knowledge_base_id, current_user)
    db.delete(document)
    db.commit()
    return {"message": "文档及其向量数据已删除"}
