import json

import httpx

from app.core.config import settings
from app.services.retriever import RetrievedChunk


FLOW_KEYWORDS = ("流程", "步骤", "阶段", "节点", "怎么走", "全流程", "递进", "先后")


def is_flow_question(question: str) -> bool:
    return any(keyword in question for keyword in FLOW_KEYWORDS)


def build_prompt(question: str, chunks: list[RetrievedChunk]) -> str:
    context = "\n\n".join(
        f"来源：{chunk.document_name}\n片段：{chunk.content[:900]}" for chunk in chunks
    )
    flow_rule = ""
    if is_flow_question(question):
        flow_rule = (
            "\n如果问题属于流程类问题，请在文字回答后追加 Mermaid 流程图代码块。"
            "流程图节点不超过 10 个，节点使用中文，格式为 ```mermaid。"
        )
    return (
        "你是企业知识库问答助手。只能基于给定资料回答；如果资料不足，请说明无法从当前知识库确认。"
        "回答需要简洁、可执行，并保留引用依据。"
        f"{flow_rule}\n\n资料：\n{context}\n\n用户问题：{question}"
    )


async def stream_deepseek_answer(prompt: str):
    if not settings.deepseek_api_key or settings.deepseek_api_key == "sk-xxxxx":
        yield "DeepSeek API Key 未配置，当前为开发环境模拟回答。"
        yield "请在 backend/.env 中配置 DEEPSEEK_API_KEY，并重启后端服务。"
        return
    base_url = settings.deepseek_base_url.rstrip("/")
    if base_url.endswith("/anthropic"):
        base_url = base_url.removesuffix("/anthropic")
    payload = {
        "model": settings.deepseek_model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": True,
    }
    if settings.deepseek_reasoning_effort:
        payload["reasoning_effort"] = settings.deepseek_reasoning_effort
    if settings.deepseek_thinking_enabled:
        payload["thinking"] = {"type": "enabled"}
    headers = {"Authorization": f"Bearer {settings.deepseek_api_key}"}
    timeout = httpx.Timeout(60.0, connect=10.0, read=60.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", f"{base_url}/chat/completions", json=payload, headers=headers) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data = line.removeprefix("data: ").strip()
                    if data == "[DONE]":
                        break
                    delta = json.loads(data)["choices"][0]["delta"].get("content")
                    if delta:
                        yield delta
    except httpx.HTTPError as exc:
        yield f"已完成知识库检索，但 DeepSeek 生成暂时失败：{exc.__class__.__name__}。请检查本地 .env 中的 DeepSeek Key、Base URL 或网络连接。"
