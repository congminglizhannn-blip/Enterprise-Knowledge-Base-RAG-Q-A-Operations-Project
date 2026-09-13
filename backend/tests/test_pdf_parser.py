from app.services.parser.pdf import SCANNED_PDF_MESSAGE


def test_scanned_pdf_message_matches_product_requirement() -> None:
    assert SCANNED_PDF_MESSAGE == "扫描件暂不支持，请上传文本型 PDF（OCR 功能开发中）"
