from pathlib import Path

from pypdf import PdfReader


SCANNED_PDF_MESSAGE = "扫描件暂不支持，请上传文本型 PDF（OCR 功能开发中）"


def parse_pdf_text(path: str) -> str:
    reader = PdfReader(path)
    pages: list[str] = []
    for page in reader.pages:
        pages.append(page.extract_text() or "")
    text = "\n".join(pages).strip()
    if not text:
        raise ValueError(SCANNED_PDF_MESSAGE)
    return text


def is_pdf(path: str) -> bool:
    return Path(path).suffix.lower() == ".pdf"
