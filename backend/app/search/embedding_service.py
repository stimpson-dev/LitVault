"""Embedding-Erzeugung für die semantische Suche.

Pure functions (Textaufbau, BLOB-Serialisierung) + EmbeddingService
(lazy geladener SentenceTransformer, Encoding im Threadpool).
"""
import asyncio
import logging
import threading

import numpy as np

from app.config import get_settings

logger = logging.getLogger("litvault.embeddings")


def build_embed_text(
    title: str | None,
    summary: str | None,
    full_text: str | None,
    max_chars: int,
) -> str:
    parts = [p for p in (title, summary) if p]
    if full_text:
        parts.append(full_text[:max_chars])
    return "\n".join(parts)


def vector_to_blob(vec: np.ndarray) -> bytes:
    return np.asarray(vec, dtype=np.float32).tobytes()


def blob_to_vector(blob: bytes) -> np.ndarray:
    return np.frombuffer(blob, dtype=np.float32)


DOC_PREFIX = "search_document: "
QUERY_PREFIX = "search_query: "


class ModelLoadError(Exception):
    """SentenceTransformer-Modell konnte nicht geladen werden."""


class EmbeddingService:
    """Lazy geladener SentenceTransformer; Encoding im Threadpool (torch gibt den GIL frei)."""

    def __init__(self, model_name: str):
        self.model_name = model_name
        self._model = None
        self._load_lock = threading.Lock()

    def _load_model(self):
        with self._load_lock:
            if self._model is None:
                try:
                    from sentence_transformers import SentenceTransformer
                    logger.info("Lade Embedding-Modell: %s", self.model_name)
                    self._model = SentenceTransformer(self.model_name, trust_remote_code=True)
                except Exception as exc:
                    raise ModelLoadError(f"{self.model_name}: {exc}") from exc
        return self._model

    def _encode(self, texts: list[str]) -> np.ndarray:
        model = self._load_model()
        vecs = model.encode(texts, normalize_embeddings=True)
        return np.asarray(vecs, dtype=np.float32)

    async def encode_documents(self, texts: list[str]) -> np.ndarray:
        return await asyncio.to_thread(self._encode, [DOC_PREFIX + t for t in texts])

    async def encode_query(self, text: str) -> np.ndarray:
        vecs = await asyncio.to_thread(self._encode, [QUERY_PREFIX + text])
        return vecs[0]


_service: EmbeddingService | None = None


def get_embedding_service() -> EmbeddingService:
    """Singleton; folgt settings.embedding_model. Tests patchen diese Funktion."""
    global _service
    model_name = get_settings().embedding_model
    if _service is None or _service.model_name != model_name:
        _service = EmbeddingService(model_name)
    return _service
