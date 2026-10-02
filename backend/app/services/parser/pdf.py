import base64
from io import BytesIO
from pathlib import Path
import re
import unicodedata

import httpx
from pypdf import PdfReader

from app.core.config import settings

SCANNED_PDF_MESSAGE = "扫描件暂不支持，请上传文本型 PDF（OCR 功能开发中）"

# Some PDFs map common Chinese characters to compatibility/radical code points
# instead of their standard ideographs. NFKC handles Kangxi radicals; these
# simplified radicals need explicit equivalents.
_PDF_RADICAL_REPLACEMENTS = str.maketrans({
    "\u2ea0": "民",
    "\u2ec5": "见",
    "\u2ec6": "角",
    "\u2ed4": "门",
    "\u2edb": "风",
})


def normalize_pdf_text(text: str) -> str:
    text = "".join(
        unicodedata.normalize("NFKC", char) if 0x2F00 <= ord(char) <= 0x2FDF else char
        for char in text
    ).translate(_PDF_RADICAL_REPLACEMENTS)
    # pypdf exposes several layout separators as control characters; they
    # render as boxes in the UI and have no useful textual meaning.
    text = "".join(char if char in "\n\r\t" or ord(char) >= 32 else "\n\n" for char in text)
    text = "\n".join(line.rstrip() for line in text.splitlines())
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def format_pdf_markdown(text: str) -> str:
    """Restore section headings and preserve text-based flowcharts in code blocks."""
    lines = _clean_pdf_list_artifacts(text.splitlines())
    output: list[str] = []
    index = 0
    current_main_section: int | None = None
    active_subsection_parent: int | None = None
    while index < len(lines):
        line = lines[index].strip()
        if not line or line.lower() == "text":
            index += 1
            continue

        if not output and re.match(r"^文档[一二三四五六七八九十0-9]+[：:]", line):
            output.extend([f"# {line}", ""])
            index += 1
            continue

        section = re.fullmatch(r"(\d+(?:\.\d+)+)", line)
        if section:
            next_index = index + 1
            while next_index < len(lines) and not lines[next_index].strip():
                next_index += 1
            if next_index < len(lines):
                title = lines[next_index].strip()
                level = min(6, section.group(1).count(".") + 1)
                output.extend(["", f"{'#' * level} {line} {title}", ""])
                current_main_section = int(section.group(1).split(".", 1)[0])
                active_subsection_parent = current_main_section
                index = next_index + 1
                continue

        main_section = re.fullmatch(r"(\d+)\.\s+(.+)", line)
        if main_section and (
            _follows_markdown_table(lines, index)
            or _is_pdf_main_heading(lines, index, main_section, current_main_section, active_subsection_parent)
        ):
            output.extend(["", f"# {line}", ""])
            current_main_section = int(main_section.group(1))
            active_subsection_parent = None
            index += 1
            continue

        if _is_markdown_table_header(lines, index):
            table_lines = [line]
            index += 1
            while index < len(lines) and lines[index].strip().startswith("|"):
                table_lines.append(lines[index].strip())
                index += 1
            output.extend(["", *table_lines, ""])
            continue

        qa_parts = re.split(r"\s+(?=(?:Q\d+[：:]|A[：:]))", line)
        if any(re.match(r"^(?:Q\d+[：:]|A[：:])", part) for part in qa_parts):
            for part in qa_parts:
                part = part.strip()
                if not part:
                    continue
                part = re.sub(r"^(Q\d+[：:])", r"**\1** ", part)
                part = re.sub(r"^(A[：:])", r"**\1** ", part)
                output.extend(["", part])
            index += 1
            continue

        if "→" in line and "阶段" in line:
            diagram = [line]
            index += 1
            while index < len(lines) and lines[index].strip():
                if re.fullmatch(r"\d+(?:\.\d+)*", lines[index].strip()):
                    break
                diagram.append(lines[index].rstrip())
                index += 1
            output.extend(["", "```text", *diagram, "```", ""])
            continue

        output.append(line)
        index += 1

    return re.sub(r"\n{3,}", "\n\n", "\n".join(output)).strip()


def _is_markdown_table_header(lines: list[str], index: int) -> bool:
    if index + 1 >= len(lines) or not lines[index].strip().startswith("|"):
        return False
    return bool(re.search(r"\|\s*:?-{3,}:?\s*\|", lines[index + 1]))


def _follows_markdown_table(lines: list[str], index: int) -> bool:
    table_index, _ = _next_nonempty_line(lines, index + 1)
    return table_index < len(lines) and _is_markdown_table_header(lines, table_index)


def _next_nonempty_line(lines: list[str], start: int) -> tuple[int, str]:
    while start < len(lines) and not lines[start].strip():
        start += 1
    return start, lines[start].strip() if start < len(lines) else ""


def _is_pdf_main_heading(
    lines: list[str],
    index: int,
    match: re.Match[str],
    current_main_section: int | None,
    active_subsection_parent: int | None,
) -> bool:
    number = int(match.group(1))
    title = match.group(2)
    if any(keyword in title for keyword in ("常见问题", "版本历史", "相关模板", "相关附件")):
        return True

    expected_number = (active_subsection_parent if active_subsection_parent is not None else current_main_section)
    if expected_number is not None and number != expected_number + 1:
        return False

    cursor, following = _next_nonempty_line(lines, index + 1)
    if re.match(rf"^{number}\.\d+\b", following):
        return True

    # Some PDF headings have no subheading beneath them. Confirm a run of
    # section headings by looking ahead for a numbered section that does.
    expected = number + 1
    for _ in range(3):
        candidate = re.fullmatch(r"(\d+)\.\s+(.+)", following)
        if candidate is None or int(candidate.group(1)) != expected:
            return False
        candidate_number = int(candidate.group(1))
        next_cursor, after_candidate = _next_nonempty_line(lines, cursor + 1)
        if re.match(rf"^{candidate_number}\.\d+\b", after_candidate):
            return True
        if any(keyword in candidate.group(2) for keyword in ("常见问题", "版本历史", "相关模板", "相关附件")):
            return True
        expected += 1
        cursor, following = _next_nonempty_line(lines, next_cursor + 1)
    return False


def _clean_pdf_list_artifacts(lines: list[str]) -> list[str]:
    cleaned: list[str] = []
    index = 0
    while index < len(lines):
        current = lines[index].strip()
        if re.fullmatch(r"\d+", current):
            run: list[tuple[int, str]] = []
            cursor = index
            while cursor < len(lines):
                next_index, value = _next_nonempty_line(lines, cursor)
                if not re.fullmatch(r"\d+", value):
                    break
                run.append((next_index, value))
                cursor = next_index + 1
            values = [int(value) for _, value in run]
            if len(values) >= 4 and values == list(range(values[0], values[0] + len(values))):
                index = cursor
                continue

        if current in {"•", "·", "▪", "●"}:
            next_index, value = _next_nonempty_line(lines, index + 1)
            if value:
                cleaned.append("- " + value)
                index = next_index + 1
                continue
        elif current.startswith("• "):
            cleaned.append("- " + current[2:].strip())
            index += 1
            continue

        cleaned.append(lines[index])
        index += 1
    return cleaned


def parse_pdf_text(path: str) -> str:
    # pdfplumber exposes table boundaries and cell text, which pypdf's plain
    # text extraction does not. Keep extraction page-local and interleave
    # table Markdown with the text bands around each table to preserve reading
    # order.
    try:
        import pdfplumber
    except ImportError as exc:
        if settings.pdf_image_table_vision_enabled:
            raise RuntimeError("PDF 图片表格识别依赖未安装，请安装 backend/requirements.txt") from exc
        # Keep ordinary text-PDF parsing available in restricted/offline
        # environments where the optional layout/table dependency is absent.
        text = "\n".join(normalize_pdf_text(page.extract_text() or "") for page in PdfReader(path).pages).strip()
        if not text:
            raise ValueError(SCANNED_PDF_MESSAGE)
        return format_pdf_markdown(text)

    pages: list[str] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            pages.append(extract_pdf_page_markdown(
                page,
                vision_enabled=settings.pdf_image_table_vision_enabled,
                vision_model=settings.pdf_image_table_vision_model,
                api_key=settings.deepseek_api_key,
                base_url=settings.deepseek_base_url,
            ))
    text = "\n".join(pages).strip()
    if not text:
        raise ValueError(SCANNED_PDF_MESSAGE)
    return format_pdf_markdown(text)


def extract_pdf_page_markdown(
    page,
    *,
    vision_enabled: bool = False,
    vision_model: str = "deepseek-flash",
    api_key: str | None = None,
    base_url: str = "https://api.deepseek.com/v1",
) -> str:
    """Extract vector tables and, when enabled, image tables in visual order."""
    table_blocks = []
    for table in page.find_tables():
        rows = table.extract()
        if rows and max((len(row) for row in rows), default=0) >= 2:
            markdown = _table_to_markdown(rows)
            if markdown:
                table_blocks.append((table.bbox, markdown))
    if vision_enabled:
        if not api_key or api_key == "sk-xxxxx":
            raise RuntimeError("已启用 PDF 图片表格识别，但未配置 DEEPSEEK_API_KEY")
        for image in page.images:
            if not _is_table_image_candidate(image, page):
                continue
            image_markdown = _extract_image_tables_with_vision(
                page, image, model=vision_model, api_key=api_key, base_url=base_url
            )
            if image_markdown:
                table_blocks.append(((image["x0"], image["top"], image["x1"], image["bottom"]), image_markdown))

    table_blocks.sort(key=lambda block: (block[0][1], block[0][0]))
    if not table_blocks:
        return normalize_pdf_text(page.extract_text() or "")

    blocks: list[tuple[float, str]] = []
    cursor = 0.0
    for bbox, markdown in table_blocks:
        x0, top, x1, bottom = bbox
        if top > cursor:
            text = page.crop((0, cursor, page.width, top)).extract_text() or ""
            if text.strip():
                blocks.append((cursor, normalize_pdf_text(text)))
        if markdown:
            blocks.append((top, markdown))
        cursor = max(cursor, bottom)
    if cursor < page.height:
        text = page.crop((0, cursor, page.width, page.height)).extract_text() or ""
        if text.strip():
            blocks.append((cursor, normalize_pdf_text(text)))
    return "\n\n".join(content for _, content in sorted(blocks, key=lambda block: block[0]))


def _is_table_image_candidate(image: dict, page) -> bool:
    width = max(0.0, image["x1"] - image["x0"])
    height = max(0.0, image["bottom"] - image["top"])
    return width >= page.width * 0.2 and height >= 35 and width * height >= page.width * page.height * 0.02


def _extract_image_tables_with_vision(
    page,
    image: dict,
    *,
    model: str,
    api_key: str,
    base_url: str,
) -> str:
    """Render one embedded PDF image and ask the configured VLM for tables only."""
    margin = 3
    bbox = (
        max(0, image["x0"] - margin),
        max(0, image["top"] - margin),
        min(page.width, image["x1"] + margin),
        min(page.height, image["bottom"] + margin),
    )
    rendered = page.crop(bbox).to_image(resolution=170).original
    image_buffer = BytesIO()
    rendered.convert("RGB").save(image_buffer, format="JPEG", quality=88, optimize=True)
    encoded_image = base64.b64encode(image_buffer.getvalue()).decode("ascii")
    prompt = (
        "识别图片中完整可见的表格，并严格按原行列输出 Markdown 表格。"
        "仅输出表格，不要解释或转录表格以外的正文；若没有表格，只输出 NO_TABLES。"
        "保留原文字、数字和符号，不确定的单元格写【无法识别】，不要猜测。"
        "多张表格之间空一行；单元格换行用 <br> 表示。"
    )
    url = f"{base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{encoded_image}", "detail": "original"}},
            ],
        }],
        "stream": False,
        "max_tokens": 4096,
    }
    try:
        response = httpx.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=httpx.Timeout(75.0, connect=10.0),
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
        raise RuntimeError("PDF 图片表格视觉解析失败，请检查 DeepSeek 视觉模型配置与网络") from exc
    if not isinstance(content, str):
        return ""
    return _markdown_tables_only(content)


def _markdown_tables_only(content: str) -> str:
    content = content.strip()
    content = re.sub(r"^```(?:markdown|md)?\s*|\s*```$", "", content, flags=re.IGNORECASE)
    if content.strip().upper() == "NO_TABLES":
        return ""
    tables: list[list[str]] = []
    current: list[str] = []
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("|") and stripped.count("|") >= 2:
            current.append(stripped)
        elif current:
            if len(current) >= 2 and re.search(r"\|\s*:?-{3,}:?\s*\|", current[1]):
                tables.append(current)
            current = []
    if current and len(current) >= 2 and re.search(r"\|\s*:?-{3,}:?\s*\|", current[1]):
        tables.append(current)
    return "\n\n".join("\n".join(table) for table in tables)


def _table_to_markdown(rows: list[list[str | None]] | None) -> str:
    if not rows:
        return ""
    normalized = [[normalize_pdf_text((cell or "").replace("|", r"\|").replace("\n", "<br>")).replace("\n", "<br>") for cell in row] for row in rows]
    width = max(map(len, normalized), default=0)
    if not width:
        return ""
    normalized = [row + [""] * (width - len(row)) for row in normalized]
    header = normalized[0]
    divider = ["---"] * width
    return "\n".join(["| " + " | ".join(header) + " |", "| " + " | ".join(divider) + " |", *["| " + " | ".join(row) + " |" for row in normalized[1:]]])


def is_pdf(path: str) -> bool:
    return Path(path).suffix.lower() == ".pdf"
