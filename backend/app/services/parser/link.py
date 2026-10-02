import re
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from app.core.config import settings


FEISHU_HOSTS = ("feishu.cn", "larksuite.com")


@dataclass(frozen=True)
class ParsedLinkText:
    text: str
    title: str | None = None


def extract_html_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    return soup.get_text("\n", strip=True)


def extract_html_title(html: str) -> str | None:
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    return title or None


def is_feishu_url(url: str) -> bool:
    hostname = urlparse(url).hostname or ""
    return any(hostname == host or hostname.endswith(f".{host}") for host in FEISHU_HOSTS)


def extract_feishu_token(url: str) -> tuple[str, str]:
    path = urlparse(url).path.strip("/")
    patterns = [
        ("docx", r"(?:^|/)docx/([A-Za-z0-9]+)"),
        ("doc", r"(?:^|/)docs?/([A-Za-z0-9]+)"),
        ("sheet", r"(?:^|/)sheets?/([A-Za-z0-9]+)"),
        ("bitable", r"(?:^|/)(?:base|bitable)/([A-Za-z0-9]+)"),
        ("wiki", r"(?:^|/)wiki/([A-Za-z0-9]+)"),
    ]
    for resource_type, pattern in patterns:
        match = re.search(pattern, path)
        if match:
            return resource_type, match.group(1)
    raise ValueError("暂不支持该飞书链接类型，请提供飞书文档、电子表格、多维表格或知识库 Wiki 链接")


def get_feishu_tenant_access_token(client: httpx.Client) -> str:
    if not settings.feishu_app_id or not settings.feishu_app_secret:
        raise ValueError("飞书 App ID 或 App Secret 未配置，请在 backend/.env 中配置 App_ID 和 App_App Secret")
    response = client.post(
        "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
        json={"app_id": settings.feishu_app_id, "app_secret": settings.feishu_app_secret},
        timeout=15,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("code") != 0:
        raise ValueError(payload.get("msg") or "获取飞书 tenant_access_token 失败")
    return payload["tenant_access_token"]


def request_feishu_api(client: httpx.Client, path: str, token: str, **kwargs) -> dict:
    response = client.get(
        f"https://open.feishu.cn/open-apis{path}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=20,
        **kwargs,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("code") != 0:
        raise ValueError(payload.get("msg") or "飞书接口调用失败")
    return payload.get("data") or {}


def request_feishu_api_paginated(client: httpx.Client, path: str, token: str, items_key: str = "items", **kwargs) -> list[dict]:
    params = dict(kwargs.pop("params", {}) or {})
    items: list[dict] = []
    page_token = params.get("page_token")
    while True:
        if page_token:
            params["page_token"] = page_token
        data = request_feishu_api(client, path, token, params=params, **kwargs)
        items.extend(data.get(items_key) or data.get("items") or data.get("blocks") or [])
        if not data.get("has_more"):
            return items
        page_token = data.get("page_token")
        if not page_token:
            return items


def stringify_table_value(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, (str, int, float, bool)):
        return str(value)
    if isinstance(value, list):
        return "；".join(filter(None, (stringify_table_value(item) for item in value)))
    if isinstance(value, dict):
        for key in ("text", "name", "title", "value", "link", "url"):
            nested = value.get(key)
            if nested not in (None, ""):
                return stringify_table_value(nested)
        return "；".join(f"{key}:{stringify_table_value(nested)}" for key, nested in value.items() if nested not in (None, ""))
    return str(value)


def rows_to_text(title: str | None, sections: list[tuple[str, list[list[object]]]]) -> str:
    parts: list[str] = []
    if title:
        parts.append(f"# {title}")
    for section_name, rows in sections:
        if section_name:
            parts.append(f"## {section_name}")
        matrix = [[stringify_table_value(cell).strip().replace("|", "\\|").replace("\n", "<br>") for cell in row] for row in rows]
        width = max((len(row) for row in matrix), default=0)
        matrix = [row + [""] * (width - len(row)) for row in matrix]
        if width and matrix:
            parts.append("| " + " | ".join(matrix[0]) + " |")
            parts.append("| " + " | ".join(["---"] * width) + " |")
            parts.extend("| " + " | ".join(row) + " |" for row in matrix[1:])
    return "\n".join(parts)


def merge_text_parts(*parts: str) -> str:
    seen: set[str] = set()
    lines: list[str] = []
    for part in parts:
        for line in part.splitlines():
            normalized = line.strip()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            lines.append(normalized)
    return "\n".join(lines)


def extract_text_from_block_value(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        if re.fullmatch(r"[A-Za-z0-9_-]{8,}", text):
            return []
        return [text]
    if isinstance(value, (int, float, bool)):
        return [str(value)]
    if isinstance(value, list):
        lines: list[str] = []
        for item in value:
            lines.extend(extract_text_from_block_value(item))
        return lines
    if isinstance(value, dict):
        preferred_keys = ("text", "content", "title", "name", "value")
        lines: list[str] = []
        for key in preferred_keys:
            if key in value:
                lines.extend(extract_text_from_block_value(value[key]))
        if lines:
            return lines
        for key, nested in value.items():
            if key.endswith("_id") or key in {"id", "token", "block_id", "parent_id", "children", "obj_token"}:
                continue
            lines.extend(extract_text_from_block_value(nested))
        return lines
    return []


def extract_text_from_docx_block(block: dict) -> str:
    content_keys = (
        "page", "paragraph", "heading1", "heading2", "heading3", "heading4", "heading5", "heading6",
        "bullet", "ordered", "code", "quote", "text", "table_cell",
    )

    def body_text(value: object) -> list[str]:
        if isinstance(value, str):
            return [value.strip()] if value.strip() else []
        if isinstance(value, list):
            return [text for item in value for text in body_text(item)]
        if not isinstance(value, dict):
            return []
        if isinstance(value.get("text_run"), dict):
            content = value["text_run"].get("content")
            return [content.strip()] if isinstance(content, str) and content.strip() else []
        # Only inspect text-bearing fields. Block style, alignment, IDs, flags,
        # and sizing metadata are structural data, never document prose.
        result: list[str] = []
        for key in ("elements", "content", "text", "title", "name", "url", "link"):
            if key in value:
                result.extend(body_text(value[key]))
        return result

    for key in content_keys:
        if key in block:
            return " | ".join(body_text(block[key]))
    return ""


def parse_feishu_docx_blocks(client: httpx.Client, tenant_token: str, document_token: str) -> str:
    blocks = request_feishu_api_paginated(
        client,
        f"/docx/v1/documents/{document_token}/blocks",
        tenant_token,
        params={"page_size": 500},
    )
    # The list endpoint can omit descendants referenced by a block's children
    # or table.cells. Load only missing descendants before rendering.
    by_id = {block.get("block_id"): block for block in blocks if block.get("block_id")}
    queue = list(blocks)
    visited: set[str] = set()
    while queue:
        parent = queue.pop(0)
        parent_id = parent.get("block_id")
        if not parent_id or parent_id in visited:
            continue
        visited.add(parent_id)
        child_ids = list(parent.get("children") or [])
        table_cells = (parent.get("table") or {}).get("cells") or []
        if table_cells and isinstance(table_cells[0], list):
            table_cells = [cell_id for row in table_cells for cell_id in row]
        child_ids.extend(table_cells)
        missing = [child_id for child_id in child_ids if child_id not in by_id]
        if not missing:
            continue
        descendants = request_feishu_api_paginated(
            client,
            f"/docx/v1/documents/{document_token}/blocks/{parent_id}/children",
            tenant_token,
            params={"page_size": 500},
        )
        for child in descendants:
            child_id = child.get("block_id")
            if child_id and child_id not in by_id:
                by_id[child_id] = child
                blocks.append(child)
                queue.append(child)
    return render_feishu_docx_blocks(blocks, client, tenant_token)


def render_feishu_docx_blocks(
    blocks: list[dict], client: httpx.Client | None = None, tenant_token: str | None = None
) -> str:
    by_id = {block.get("block_id"): block for block in blocks if block.get("block_id")}
    children: dict[str, list[dict]] = {}
    for block in blocks:
        parent_id = block.get("parent_id")
        if parent_id:
            children.setdefault(parent_id, []).append(block)

    def cell_text(block: dict) -> str:
        text = extract_text_from_docx_block(block)
        nested = children.get(block.get("block_id"), [])
        if nested:
            text = " ".join(filter(None, (cell_text(child) for child in nested)))
        return text.strip()

    def markdown_table(block: dict) -> str:
        table = block.get("table") or {}
        props = table.get("property") or table.get("table_property") or {}
        try:
            columns = int(props.get("column_size") or props.get("column_count") or 0)
            rows = int(props.get("row_size") or props.get("row_count") or 0)
        except (TypeError, ValueError):
            columns = rows = 0
        cell_ids = table.get("cells") or []
        if cell_ids and isinstance(cell_ids[0], list):
            cell_ids = [cell_id for row in cell_ids for cell_id in row]
        cell_blocks = [by_id.get(cell_id) for cell_id in cell_ids]
        cell_blocks = [item for item in cell_blocks if item]
        if not cell_blocks:
            cell_blocks = children.get(block.get("block_id"), [])
        if not columns:
            columns = max(1, round(len(cell_blocks) / rows)) if rows else max(1, len(cell_blocks))
        if not rows:
            rows = (len(cell_blocks) + columns - 1) // columns
        values = [cell_text(item).replace("|", "\\|").replace("\n", "<br>") for item in cell_blocks]
        matrix = [values[i * columns:(i + 1) * columns] for i in range(rows)]
        matrix = [row + [""] * (columns - len(row)) for row in matrix]
        if not matrix:
            return ""
        lines = ["| " + " | ".join(matrix[0]) + " |", "| " + " | ".join(["---"] * columns) + " |"]
        lines.extend("| " + " | ".join(row) + " |" for row in matrix[1:])
        return "\n".join(lines)

    collected: list[str] = []
    rendered_cells: set[str] = set()
    for block in blocks:
        kind = next((key for key in ("table", "table_cell", "sheet", "image", "paragraph", "heading1", "heading2", "heading3", "heading4", "heading5", "heading6", "bullet", "ordered", "code", "quote", "text") if key in block), None)
        if kind == "table":
            rendered = markdown_table(block)
            rendered_cells.update(item.get("block_id") for item in children.get(block.get("block_id"), []))
        elif kind == "sheet":
            if client is None or tenant_token is None:
                rendered = ""
            else:
                rendered = parse_feishu_embedded_sheet(client, tenant_token, (block.get("sheet") or {}).get("token", ""))
        elif kind == "bitable":
            if client is None or tenant_token is None:
                rendered = ""
            else:
                rendered = parse_feishu_embedded_bitable(client, tenant_token, (block.get("bitable") or {}).get("token", ""))
        elif kind == "image":
            image = block.get("image") or {}
            image_key = image.get("token") or image.get("image_key") or ""
            rendered = f"![图片](feishu://{image_key})" if image_key else "![图片]"
        elif kind == "table_cell" or block.get("block_id") in rendered_cells:
            continue
        else:
            rendered = extract_text_from_docx_block(block)
            if rendered and kind and kind.startswith("heading"):
                level = min(6, int(kind[-1]))
                rendered = f"{'#' * level} {rendered}"
        if rendered.strip():
            collected.append(rendered.strip())
    return "\n\n".join(collected)


def parse_feishu_embedded_sheet(client: httpx.Client, tenant_token: str, sheet_token: str) -> str:
    """Read an embedded Sheet block; its token is spreadsheet_token_sheet_id."""
    if "_" not in sheet_token:
        raise ValueError("飞书嵌入式电子表格 token 格式无效")
    spreadsheet_token, sheet_id = sheet_token.rsplit("_", 1)
    data = request_feishu_api(
        client,
        f"/sheets/v2/spreadsheets/{spreadsheet_token}/values/{sheet_id}",
        tenant_token,
        params={"valueRenderOption": "ToString"},
    )
    value_range = data.get("valueRange") or data.get("value_range") or data
    values = value_range.get("values") or []
    return rows_to_text(None, [("", values)])


def parse_feishu_embedded_bitable(client: httpx.Client, tenant_token: str, bitable_token: str) -> str:
    """Read an embedded Bitable block; its token is app_token_table_id."""
    if "_" not in bitable_token:
        raise ValueError("飞书嵌入式多维表格 token 格式无效")
    app_token, table_id = bitable_token.rsplit("_", 1)
    fields = request_feishu_api_paginated(
        client,
        f"/bitable/v1/apps/{app_token}/tables/{table_id}/fields",
        tenant_token,
        params={"page_size": 100},
    )
    field_names = [field.get("field_name") or field.get("name") for field in fields]
    field_names = [name for name in field_names if name]
    records = request_feishu_api_paginated(
        client,
        f"/bitable/v1/apps/{app_token}/tables/{table_id}/records",
        tenant_token,
        params={"page_size": 100},
    )
    rows = [field_names]
    rows.extend(
        [stringify_table_value((record.get("fields") or {}).get(name)) for name in field_names]
        for record in records
    )
    return rows_to_text(None, [("多维表格", rows)])


def parse_feishu_sheet(client: httpx.Client, tenant_token: str, spreadsheet_token: str) -> ParsedLinkText:
    metadata = request_feishu_api(client, f"/sheets/v3/spreadsheets/{spreadsheet_token}/sheets/query", tenant_token)
    sheets = metadata.get("sheets") or metadata.get("items") or []
    title = (metadata.get("spreadsheet", {}) or {}).get("title") or metadata.get("title")
    sections: list[tuple[str, list[list[object]]]] = []
    for sheet in sheets:
        sheet_id = sheet.get("sheet_id") or sheet.get("sheetId")
        sheet_title = sheet.get("title") or sheet.get("name") or sheet_id
        if not sheet_id:
            continue
        values_data = request_feishu_api(
            client,
            f"/sheets/v2/spreadsheets/{spreadsheet_token}/values/{sheet_id}",
            tenant_token,
            params={"valueRenderOption": "ToString"},
        )
        value_range = values_data.get("valueRange") or values_data.get("value_range") or values_data
        values = value_range.get("values") or []
        sections.append((sheet_title, values))
    return ParsedLinkText(text=rows_to_text(title, sections), title=title)


def parse_feishu_bitable(client: httpx.Client, tenant_token: str, app_token: str) -> ParsedLinkText:
    tables = request_feishu_api_paginated(
        client,
        f"/bitable/v1/apps/{app_token}/tables",
        tenant_token,
        params={"page_size": 100},
    )
    sections: list[tuple[str, list[list[object]]]] = []
    for table in tables:
        table_id = table.get("table_id")
        table_name = table.get("name") or table_id
        if not table_id:
            continue
        records = request_feishu_api_paginated(
            client,
            f"/bitable/v1/apps/{app_token}/tables/{table_id}/records",
            tenant_token,
            params={"page_size": 100},
        )
        field_names = list(dict.fromkeys(field_name for record in records for field_name in (record.get("fields") or {})))
        rows = [field_names]
        rows.extend([[stringify_table_value((record.get("fields") or {}).get(field_name)) for field_name in field_names] for record in records])
        sections.append((table_name, rows))
    return ParsedLinkText(text=rows_to_text(None, sections), title=None)


def parse_feishu_link_text(url: str) -> str:
    return parse_feishu_link(url).text


def parse_feishu_link(url: str) -> ParsedLinkText:
    resource_type, token = extract_feishu_token(url)
    title: str | None = None
    with httpx.Client() as client:
        tenant_token = get_feishu_tenant_access_token(client)
        if resource_type == "wiki":
            node = request_feishu_api(client, "/wiki/v2/spaces/get_node", tenant_token, params={"token": token, "obj_type": "wiki"})
            node_info = node.get("node") or node
            resource_type = node_info.get("obj_type") or node_info.get("object_type") or ""
            token = node_info.get("obj_token") or node_info.get("object_token") or ""
            title = (node_info.get("title") or "").strip() or None
            if not token:
                raise ValueError("飞书 Wiki 节点解析失败，未获取到底层文档 token")
        if resource_type == "docx":
            if not title:
                metadata = request_feishu_api(client, f"/docx/v1/documents/{token}", tenant_token)
                document_info = metadata.get("document") or metadata
                title = (document_info.get("title") or "").strip() or None
            data = request_feishu_api(client, f"/docx/v1/documents/{token}/raw_content", tenant_token)
            raw_content = data.get("content") or data.get("text") or ""
            block_content = parse_feishu_docx_blocks(client, tenant_token, token)
            content = block_content or raw_content
        elif resource_type == "doc":
            data = request_feishu_api(client, f"/doc/v2/{token}/raw_content", tenant_token)
            content = data.get("content") or data.get("text") or ""
        elif resource_type == "sheet":
            parsed = parse_feishu_sheet(client, tenant_token, token)
            content = parsed.text
            title = parsed.title
        elif resource_type == "bitable":
            parsed = parse_feishu_bitable(client, tenant_token, token)
            content = parsed.text
            title = parsed.title
        else:
            raise ValueError(f"暂不支持该飞书资源类型：{resource_type}")
    content = content.strip()
    if not content:
        raise ValueError("飞书文档解析结果为空，请确认机器人/应用具备该文档访问权限")
    return ParsedLinkText(text=content, title=title)


def parse_public_link_text(url: str) -> str:
    return parse_public_link(url).text


def parse_public_link(url: str) -> ParsedLinkText:
    if is_feishu_url(url):
        return parse_feishu_link(url)
    response = httpx.get(url, timeout=15)
    response.raise_for_status()
    text = extract_html_text(response.text)
    if not text:
        raise ValueError("链接解析结果为空，请确认页面公开可访问")
    return ParsedLinkText(text=text, title=extract_html_title(response.text))


async def parse_public_link_text_async(url: str) -> str:
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(url)
        response.raise_for_status()
    return extract_html_text(response.text)
