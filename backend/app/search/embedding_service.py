"""Embedding-Erzeugung für die semantische Suche.

Pure functions (Textaufbau, BLOB-Serialisierung) + EmbeddingService
(lazy geladener SentenceTransformer, Encoding im Threadpool).
"""
import numpy as np


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
