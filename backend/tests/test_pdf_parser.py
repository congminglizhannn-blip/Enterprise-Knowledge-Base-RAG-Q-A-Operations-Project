import builtins
from types import SimpleNamespace

from app.services.parser import pdf as pdf_parser
from app.services.parser.pdf import SCANNED_PDF_MESSAGE, _markdown_tables_only, _table_to_markdown, extract_pdf_page_markdown, format_pdf_markdown, normalize_pdf_text


def test_scanned_pdf_message_matches_product_requirement() -> None:
    assert SCANNED_PDF_MESSAGE == "扫描件暂不支持，请上传文本型 PDF（OCR 功能开发中）"


def test_pdf_normalizer_removes_layout_controls_and_converts_radicals() -> None:
    normalized = normalize_pdf_text("\u2f42档\u0001\u98ce\u9669\u2edb\u9669")

    assert normalized == "文档\n\n风险风险"
    assert "\u0001" not in normalized
    assert not any(0x2E80 <= ord(char) <= 0x2FFF for char in normalized)
    assert normalize_pdf_text("正文，标题：") == "正文，标题："


def test_pdf_formatter_merges_section_titles_and_preserves_flowchart_layout() -> None:
    markdown = format_pdf_markdown(
        "3. 全流程管理框架\n\n3.1\n\n流程总览\n\ntext\n\n阶段甲 → 阶段乙\n"
        "  │          │\n  ├─ 工作一  ├─ 工作二\n\n3.2\n\n各阶段说明"
    )

    assert "## 3.1 流程总览" in markdown
    assert "# 3. 全流程管理框架" in markdown
    assert "```text\n阶段甲 → 阶段乙\n  │          │\n  ├─ 工作一  ├─ 工作二\n```" in markdown
    assert "\ntext\n" not in markdown
    assert "## 3.2 各阶段说明" in markdown


def test_pdf_formatter_promotes_document_title() -> None:
    assert format_pdf_markdown("文档三：知识产权全流程管理规范\n\n正文") == "# 文档三：知识产权全流程管理规范\n\n正文"


def test_pdf_formatter_keeps_numbered_steps_under_their_parent_heading() -> None:
    markdown = format_pdf_markdown(
        "5.3\n\n解密流程\n\n1. 项目组提出解密申请\n\n"
        "2. 保密办公室审核\n\n3. 总师签署意见\n\n4. 上报原定密机关审批"
    )

    assert "## 5.3 解密流程" in markdown
    assert "1. 项目组提出解密申请" in markdown
    assert "2. 保密办公室审核" in markdown
    assert "# 1. 项目组提出解密申请" not in markdown
    assert "# 4. 上报原定密机关审批" not in markdown


def test_pdf_formatter_joins_bullet_marker_with_its_text_and_drops_number_artifact_run() -> None:
    markdown = format_pdf_markdown("•\n\n第一条说明\n\n•\n\n第二条说明\n\n1\n2\n3\n4\n5\n6\n7")

    assert "- 第一条说明" in markdown
    assert "- 第二条说明" in markdown
    assert "\n1\n2\n3\n4\n5\n6\n7" not in markdown


def test_pdf_table_cells_are_saved_as_markdown_table() -> None:
    markdown = _table_to_markdown([["角色", "职责"], ["业务部门", "发起申请|确认"]])

    assert markdown == "| 角色 | 职责 |\n| --- | --- |\n| 业务部门 | 发起申请\\|确认 |"


def test_pdf_page_interleaves_table_and_surrounding_text_in_visual_order() -> None:
    class Table:
        bbox = (10, 20, 90, 50)

        def extract(self):
            return [["列一", "列二"], ["甲", "乙"]]

    class Crop:
        def __init__(self, text):
            self.text = text

        def extract_text(self):
            return self.text

    class Page:
        width = 100
        height = 80

        def find_tables(self):
            return [Table()]

        def crop(self, bbox):
            return Crop("表格前正文" if bbox[1] == 0 else "表格后正文")

    markdown = extract_pdf_page_markdown(Page())

    assert markdown.index("表格前正文") < markdown.index("| 列一 | 列二 |") < markdown.index("表格后正文")


def test_vision_table_result_filters_non_table_text() -> None:
    result = _markdown_tables_only(
        "以下是识别结果：\n\n| 条件 | 说明 |\n| --- | --- |\n| 技术已公开 | 不具备秘密性 |\n\n识别结束。"
    )

    assert result == "| 条件 | 说明 |\n| --- | --- |\n| 技术已公开 | 不具备秘密性 |"
    assert _markdown_tables_only("NO_TABLES") == ""


def test_vision_sends_only_rendered_image_and_returns_markdown_table(monkeypatch) -> None:
    class RenderedImage:
        def convert(self, mode):
            return self

        def save(self, buffer, **kwargs):
            buffer.write(b"jpeg-image")

    class Rendered:
        original = RenderedImage()

    class Crop:
        def to_image(self, resolution):
            assert resolution == 170
            return Rendered()

    class Page:
        width = 100
        height = 100

        def crop(self, bbox):
            assert bbox == (7, 17, 53, 63)
            return Crop()

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return {"choices": [{"message": {"content": "| A | B |\n| --- | --- |\n| 1 | 2 |"}}]}

    calls = []
    monkeypatch.setattr(pdf_parser.httpx, "post", lambda *args, **kwargs: (calls.append(kwargs) or Response()))
    table = {"x0": 10, "top": 20, "x1": 50, "bottom": 60}
    result = pdf_parser._extract_image_tables_with_vision(
        Page(), table, model="deepseek-flash", api_key="test-key", base_url="https://example.test/v1"
    )

    assert result == "| A | B |\n| --- | --- |\n| 1 | 2 |"
    assert calls[0]["json"]["messages"][0]["content"][1]["image_url"]["url"].startswith("data:image/jpeg;base64,")
    assert calls[0]["json"]["model"] == "deepseek-flash"


def test_text_pdf_falls_back_when_optional_table_dependency_is_missing(monkeypatch) -> None:
    original_import = builtins.__import__

    def import_without_pdfplumber(name, *args, **kwargs):
        if name == "pdfplumber":
            raise ImportError("not installed")
        return original_import(name, *args, **kwargs)

    class Page:
        def extract_text(self):
            return "普通文本 PDF 正文"

    monkeypatch.setattr(builtins, "__import__", import_without_pdfplumber)
    monkeypatch.setattr(pdf_parser, "PdfReader", lambda path: SimpleNamespace(pages=[Page()]))
    monkeypatch.setattr(pdf_parser.settings, "pdf_image_table_vision_enabled", False)

    assert pdf_parser.parse_pdf_text("sample.pdf") == "普通文本 PDF 正文"


def test_pdf_formatter_preserves_table_blocks_and_promotes_their_section_title() -> None:
    markdown = format_pdf_markdown(
        "4. 知识产权申请类型选择\n| 类型 | 方式 |\n| --- | --- |\n| A | B |\n5. 下一节"
    )

    assert "# 4. 知识产权申请类型选择" in markdown
    assert "\n\n| 类型 | 方式 |\n| --- | --- |\n| A | B |\n\n" in markdown
    assert "| 类型 | 方式 | # 4." not in markdown


def test_pdf_formatter_separates_and_labels_qa_paragraphs() -> None:
    markdown = format_pdf_markdown(
        "6. 常见问题\nQ1：问题一？\nA：回答一。\nQ2：问题二？\nA：回答二。"
    )

    assert "**Q1：** 问题一？\n\n**A：** 回答一。" in markdown
    assert "**Q2：** 问题二？\n\n**A：** 回答二。" in markdown
