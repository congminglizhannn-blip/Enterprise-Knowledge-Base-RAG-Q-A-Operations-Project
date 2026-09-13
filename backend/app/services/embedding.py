import os
import hashlib
from functools import lru_cache
from pathlib import Path

from app.core.config import settings


class EmbeddingService:
    """Local CPU embedding service with a deterministic fallback for tests."""

    def __init__(self, model_name: str = settings.embedding_model_name):
        self.model_name = model_name
        self.dimension = settings.embedding_dimension
        self._model = None
        self._use_fallback = False

    def _load_model(self):
        if self._model is None:
            cache_root = Path(settings.upload_dir).resolve().parent / "model_cache"
            os.environ.setdefault("HF_HOME", str(cache_root / "huggingface"))
            os.environ.setdefault("SENTENCE_TRANSFORMERS_HOME", str(cache_root / "sentence-transformers"))
            os.environ.setdefault("HF_HUB_OFFLINE", "1")
            os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
            if not cache_root.exists():
                self._use_fallback = True
                return None
            from sentence_transformers import SentenceTransformer

            try:
                self._model = SentenceTransformer(self.model_name, device="cpu")
            except Exception:
                self._use_fallback = True
        return self._model

    def _fallback_vector(self, text: str) -> list[float]:
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        values = [((digest[index % len(digest)] / 255) * 2) - 1 for index in range(self.dimension)]
        norm = sum(value * value for value in values) ** 0.5 or 1
        return [value / norm for value in values]

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        model = self._load_model()
        if self._use_fallback or model is None:
            return [self._fallback_vector(text) for text in texts]
        try:
            vectors = model.encode(texts, normalize_embeddings=True)
            return [vector.tolist() for vector in vectors]
        except Exception:
            self._use_fallback = True
            return [self._fallback_vector(text) for text in texts]

    def embed_query(self, text: str) -> list[float]:
        return self.embed_texts([text])[0]


@lru_cache
def get_embedding_service() -> EmbeddingService:
    return EmbeddingService()
