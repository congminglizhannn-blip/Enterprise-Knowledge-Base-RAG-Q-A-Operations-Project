from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.knowledge_bases import get_accessible_kb
from app.core.config import settings
from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.document import Document
from app.models.enums import DocumentType
from app.models.user import User
from app.schemas.document import DocumentRead, LinkImportRequest
from app.services.ingestion import detect_document_type
from app.services.parser.link import extract_feishu_token, is_feishu_url

router = APIRouter()


@router.post("/file", response_model=DocumentRead)
async def upload_file(
    knowledge_base_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    kb = get_accessible_kb(db, knowledge_base_id, current_user)
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")
    content = await file.read()
    max_bytes = settings.max_file_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=400, detail=f"文件不能超过 {settings.max_file_size_mb}MB")
    doc_type = detect_document_type(file.filename or "")
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    target = upload_dir / f"{kb.id}_{file.filename}"
    target.write_bytes(content)
    existing = db.scalar(
        select(Document).where(
            Document.knowledge_base_id == kb.id,
            Document.department_id == kb.department_id,
            Document.file_name == file.filename,
        )
    )
    if existing:
        db.delete(existing)
        db.flush()
    document = Document(
        knowledge_base_id=kb.id,
        department_id=kb.department_id,
        file_name=file.filename or "unknown",
        file_type=doc_type,
        file_path=str(target),
        uploaded_by=current_user.id,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@router.post("/link", response_model=DocumentRead)
def import_link(
    payload: LinkImportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    kb = get_accessible_kb(db, payload.knowledge_base_id, current_user)
    parsed_url = urlparse(payload.url.strip())
    if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
        raise HTTPException(status_code=400, detail="请粘贴公开可访问的 http/https 链接")
    existing = db.scalar(
        select(Document).where(
            Document.knowledge_base_id == kb.id,
            Document.department_id == kb.department_id,
            Document.file_type == DocumentType.LINK,
            Document.file_path == payload.url.strip(),
        )
    )
    if existing:
        db.delete(existing)
        db.flush()
    file_name = "公开飞书链接"
    if is_feishu_url(payload.url):
        try:
            resource_type, token = extract_feishu_token(payload.url)
            file_name = f"飞书{resource_type}文档-{token}"
        except ValueError:
            file_name = "飞书链接"
    document = Document(
        knowledge_base_id=kb.id,
        department_id=kb.department_id,
        file_name=file_name,
        file_type=DocumentType.LINK,
        file_path=payload.url.strip(),
        uploaded_by=current_user.id,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document
