from app.services.embedding import EmbeddingService


def test_fallback_embedding_is_384_dimensions() -> None:
    service = EmbeddingService()
    vector = service._fallback_vector("测试文本")

    assert len(vector) == 384
    assert vector == service._fallback_vector("测试文本")
