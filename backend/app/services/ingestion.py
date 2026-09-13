from pathlib import Path

from sqlalchemy.orm import Session

from app.models.chunk import DocumentChunk
from app.models.document import Document
from app.models.enums import DocumentStatus, DocumentType
from app.services.chunker import chunk_text
from app.services.embedding import EmbeddingService
from app.services.parser.office import parse_docx_text, parse_xlsx_text
from app.services.parser.link import parse_public_link_text
from app.services.parser.pdf import parse_pdf_text


def parse_document_text(document: Document) -> str:
    if document.file_type == DocumentType.PDF:
        return parse_pdf_text(document.file_path)
    if document.file_type == DocumentType.DOCX:
        return parse_docx_text(document.file_path)
    if document.file_type == DocumentType.XLSX:
        return parse_xlsx_text(document.file_path)
    if document.file_type == DocumentType.LINK:
        return parse_public_link_text(document.file_path)
    raise ValueError("暂不支持该文档类型")


def ingest_document(db: Session, document: Document, embedding_service: EmbeddingService) -> None:
    try:
        document.status = DocumentStatus.PROCESSING
        db.commit()
        text = parse_document_text(document)
        chunks = chunk_text(text)
        vectors = embedding_service.embed_texts([chunk.content for chunk in chunks])
        db.query(DocumentChunk).filter(DocumentChunk.document_id == document.id).delete(synchronize_session=False)
        for chunk, vector in zip(chunks, vectors, strict=True):
            db.add(
                DocumentChunk(
                    document_id=document.id,
                    knowledge_base_id=document.knowledge_base_id,
                    department_id=document.department_id,
                    chunk_index=chunk.index,
                    content=chunk.content,
                    content_hash=chunk.content_hash,
                    embedding=vector,
                    metadata_json={"file_name": document.file_name},
                    source_type="file",
                    source_url=None,
                    page_number=None,
                )
            )
        document.chunk_count = len(chunks)
        document.status = DocumentStatus.COMPLETED
        document.error_message = None
    except Exception as exc:
        document.status = DocumentStatus.FAILED
        document.error_message = str(exc)
    finally:
        db.commit()


def detect_document_type(filename: str) -> DocumentType:
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf":
        return DocumentType.PDF
    if suffix == ".docx":
        return DocumentType.DOCX
    if suffix in {".xlsx", ".xlsm"}:
        return DocumentType.XLSX
    raise ValueError("仅支持 Word、Excel、PDF 文件")
