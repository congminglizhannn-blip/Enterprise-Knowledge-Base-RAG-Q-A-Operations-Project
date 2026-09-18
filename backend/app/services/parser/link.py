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
        ("wiki", r"(?:^|/)wiki/([A-Za-z0-9]+)"),
    ]
    for resource_type, pattern in patterns:
        match = re.search(pattern, path)
        if match:
            return resource_type, match.group(1)
    raise ValueError("暂不支持该飞书链接类型，请提供飞书文档或知识库 Wiki 文档链接")


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
            content = data.get("content") or data.get("text") or ""
        elif resource_type == "doc":
            data = request_feishu_api(client, f"/doc/v2/{token}/raw_content", tenant_token)
            content = data.get("content") or data.get("text") or ""
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
