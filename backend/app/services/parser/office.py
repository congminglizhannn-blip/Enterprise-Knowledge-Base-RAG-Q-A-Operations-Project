from io import BytesIO
from pathlib import Path
from pathlib import PurePosixPath
import re
import xml.etree.ElementTree as ET
from zipfile import ZipFile

from docx import Document as DocxDocument
from docx.oxml.ns import qn
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph
from openpyxl import load_workbook


REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
OLE_NS = "urn:schemas-microsoft-com:office:office"
REL_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def markdown_table(rows: list[list[object]]) -> str:
    normalized = [[str(value).strip() if value is not None else "" for value in row] for row in rows]
    normalized = [row for row in normalized if any(value for value in row)]
    if not normalized:
        return ""
    width = max(map(len, normalized))
    normalized = [row + [""] * (width - len(row)) for row in normalized]
    normalized = [[value.replace("|", "\\|").replace("\r\n", "<br>").replace("\n", "<br>") for value in row] for row in normalized]
    lines = ["| " + " | ".join(normalized[0]) + " |", "| " + " | ".join(["---"] * width) + " |"]
    lines.extend("| " + " | ".join(row) + " |" for row in normalized[1:])
    return "\n".join(lines)


def parse_docx_text(path: str) -> str:
    doc = DocxDocument(path)
    document_title = Path(path).stem
    embedded_workbooks = _embedded_excel_workbooks(path)
    numbering = _numbering_definitions(path)
    parts: list[str] = []
    for element in doc.element.body.iterchildren():
        if isinstance(element, CT_P):
            paragraph = Paragraph(element, doc)
            object_ids = [
                node.get(REL_ID)
                for node in element.iter()
                if node.tag == f"{{{OLE_NS}}}OLEObject" and node.get(REL_ID)
            ]
            embedded_parts = [embedded_workbooks[rel_id] for rel_id in object_ids if rel_id in embedded_workbooks]
            if embedded_parts:
                parts.extend(embedded_parts)
                continue
            text = paragraph.text.strip()
            if not text:
                continue
            if embedded_workbooks and text == "点击图片可查看完整电子表格":
                continue
            style_name = paragraph.style.name if paragraph.style else ""
            heading = style_name.lower().replace(" ", "")
            marker = _paragraph_list_marker(paragraph, numbering)
            outline = paragraph._p.pPr.outlineLvl if paragraph._p.pPr is not None else None
            if marker:
                text = marker + text
            elif outline is not None:
                level = min(6, int(outline.val) + 1)
                text = f"{'#' * level} {text}"
            elif re.match(r"^\d+(?:\.\d+)+\s+", text):
                section_number = re.match(r"^(\d+(?:\.\d+)+)", text).group(1)
                level = min(6, section_number.count(".") + 1)
                text = f"{'#' * level} {text}"
            elif heading == "title" or text == document_title:
                text = f"# {text}"
            elif heading.startswith("heading") and heading.removeprefix("heading").isdigit():
                level = min(6, int(heading.removeprefix("heading")))
                text = f"{'#' * level} {text}"
            elif "bullet" in style_name.lower():
                nested_level = _style_list_level(style_name)
                text = f"{' ' * (4 * nested_level)}- {text}"
            elif "number" in style_name.lower():
                nested_level = _style_list_level(style_name)
                text = f"{' ' * (4 * nested_level)}1. {text}"
            parts.append(text)
        elif isinstance(element, CT_Tbl):
            table = Table(element, doc)
            rendered = markdown_table([[cell.text for cell in row.cells] for row in table.rows])
            if rendered:
                parts.append(rendered)
    return "\n\n".join(parts)


def _numbering_definitions(path: str) -> dict[tuple[int, int], str]:
    """Map Word numbering IDs/levels to Markdown list markers."""
    with ZipFile(path) as archive:
        if "word/numbering.xml" not in archive.namelist():
            return {}
        root = ET.fromstring(archive.read("word/numbering.xml"))

    ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    abstract_levels: dict[tuple[str, str], tuple[str, str]] = {}
    for abstract in root.findall(f"{{{ns}}}abstractNum"):
        abstract_id = abstract.get(f"{{{ns}}}abstractNumId", "")
        for level in abstract.findall(f"{{{ns}}}lvl"):
            ilvl = level.get(f"{{{ns}}}ilvl", "0")
            num_fmt = level.find(f"{{{ns}}}numFmt")
            lvl_text = level.find(f"{{{ns}}}lvlText")
            abstract_levels[(abstract_id, ilvl)] = (
                num_fmt.get(f"{{{ns}}}val", "bullet") if num_fmt is not None else "bullet",
                lvl_text.get(f"{{{ns}}}val", "•") if lvl_text is not None else "•",
            )

    markers: dict[tuple[int, int], str] = {}
    for num in root.findall(f"{{{ns}}}num"):
        num_id = int(num.get(f"{{{ns}}}numId", "0"))
        abstract = num.find(f"{{{ns}}}abstractNumId")
        if abstract is None:
            continue
        abstract_id = abstract.get(f"{{{ns}}}val", "")
        for (candidate_id, ilvl), (num_fmt, lvl_text) in abstract_levels.items():
            if candidate_id != abstract_id:
                continue
            marker = "- " if num_fmt == "bullet" else _markdown_ordered_marker(num_fmt, lvl_text)
            markers[(num_id, int(ilvl))] = marker
    return markers


def _markdown_ordered_marker(num_fmt: str, lvl_text: str) -> str:
    return "1. "


def _style_list_level(style_name: str) -> int:
    match = re.search(r"(?:bullet|number)\s+(\d+)$", style_name, flags=re.IGNORECASE)
    return max(0, int(match.group(1)) - 1) if match else 0


def _paragraph_list_marker(paragraph: Paragraph, numbering: dict[tuple[int, int], str]) -> str:
    ppr = paragraph._p.pPr
    num_pr = ppr.find(qn("w:numPr")) if ppr is not None else None
    if num_pr is None:
        return ""
    num_id = num_pr.find(qn("w:numId"))
    if num_id is None:
        return ""
    level = num_pr.find(qn("w:ilvl"))
    ilvl = int(level.val) if level is not None else 0
    marker = numbering.get((int(num_id.val), ilvl))
    return " " * (4 * ilvl) + marker if marker else ""


def parse_xlsx_text(path: str) -> str:
    return _parse_xlsx_stream(path)


def _parse_xlsx_stream(source: str | BytesIO, *, embedded: bool = False) -> str:
    workbook = load_workbook(source, read_only=True, data_only=True)
    parts: list[str] = []
    for sheet_index, sheet in enumerate(workbook.worksheets, start=1):
        # Some OLE-embedded workbooks declare an undersized worksheet range
        # (for example A1) even though their sheet XML contains many rows.
        # Resetting the cached dimensions makes openpyxl stream the actual cells.
        if hasattr(sheet, "reset_dimensions"):
            sheet.reset_dimensions()
        sheet_rows: list[list[object]] = []
        for row in sheet.iter_rows(values_only=True):
            values = list(row)
            while values and values[-1] is None:
                values.pop()
            if any(value is not None for value in values):
                sheet_rows.append(values)
        rendered = markdown_table(sheet_rows)
        if rendered:
            heading = f"**嵌入 Excel 表格 {sheet_index}**" if embedded else f"## {sheet.title}"
            parts.append(f"{heading}\n\n{rendered}")
    workbook.close()
    return "\n\n".join(parts)


def _embedded_excel_workbooks(path: str) -> dict[str, str]:
    """Extract embedded Excel OLE packages and render their cell values as Markdown."""
    rendered: dict[str, str] = {}
    with ZipFile(path) as archive:
        rels_path = "word/_rels/document.xml.rels"
        if rels_path not in archive.namelist():
            return rendered
        relationships = ET.fromstring(archive.read(rels_path))
        targets = {
            relationship.attrib["Id"]: relationship.attrib["Target"]
            for relationship in relationships.findall(f"{{{REL_NS}}}Relationship")
            if relationship.attrib.get("Type", "").endswith("/package")
        }
        for rel_id, target in targets.items():
            member = str(PurePosixPath("word") / target)
            if member not in archive.namelist() or not target.lower().endswith(".xlsx"):
                continue
            try:
                markdown = _parse_xlsx_stream(BytesIO(archive.read(member)), embedded=True)
            except (KeyError, ValueError, OSError):
                continue
            if markdown:
                rendered[rel_id] = markdown
    return rendered
