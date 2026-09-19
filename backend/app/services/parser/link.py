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
        parts.append(title)
    for section_name, rows in sections:
        if section_name:
            parts.append(f"【{section_name}】")
        for index, row in enumerate(rows, start=1):
            values = [stringify_table_value(cell).strip() for cell in row]
            line = " | ".join(value for value in values if value)
            if line:
                parts.append(f"{index}. {line}")
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
    lines: list[str] = []
    for key, value in block.items():
        if key in {"block_id", "parent_id", "children", "block_type"} or key.endswith("_id"):
            continue
        lines.extend(extract_text_from_block_value(value))
    return " | ".join(line for line in lines if line)


def parse_feishu_docx_blocks(client: httpx.Client, tenant_token: str, document_token: str) -> str:
    blocks = request_feishu_api_paginated(
        client,
        f"/docx/v1/documents/{document_token}/blocks",
        tenant_token,
        params={"page_size": 500},
    )
    collected: list[str] = []
    for block in blocks:
        text = extract_text_from_docx_block(block)
        if text:
            collected.append(text)
    return "\n".join(collected)


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
        rows = []
        for record in records:
            fields = record.get("fields") or {}
            rows.append([f"{field_name}: {stringify_table_value(field_value)}" for field_name, field_value in fields.items()])
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
            content = merge_text_parts(raw_content, block_content)
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
