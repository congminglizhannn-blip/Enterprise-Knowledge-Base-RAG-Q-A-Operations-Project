import hashlib
from dataclasses import dataclass


@dataclass(frozen=True)
class TextChunk:
    index: int
    content: str
    content_hash: str


def chunk_text(text: str, chunk_size: int = 700, overlap: int = 100) -> list[TextChunk]:
    normalized = "\n".join(line.strip() for line in text.splitlines() if line.strip())
    if not normalized:
        return []
    chunks: list[TextChunk] = []
    start = 0
    while start < len(normalized):
        end = min(start + chunk_size, len(normalized))
        content = normalized[start:end]
        digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
        chunks.append(TextChunk(index=len(chunks), content=content, content_hash=digest))
        if end == len(normalized):
            break
        start = max(0, end - overlap)
    return chunks
