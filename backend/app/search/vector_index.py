"""In-Memory-Vektorindex für die semantische Suche.

Hält alle Dokument-Embeddings EINES Modells als numpy-Matrix (N x dim).
Lazy geladen; invalidate() erhöht die Generation und erzwingt Neuladen
beim nächsten Zugriff (gleiches Muster wie FacetCache). Bei ~4.300
Dokumenten ist Brute-Force-Cosine (<50 ms) einem Vektorindex vorzuziehen.

Bewusst KEIN excluded-Filter beim Laden: den erledigt der SQL-Schritt der
Aufrufer — so braucht exclude/restore keine Index-Invalidierung.
"""
import numpy as np
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.search.embedding_service import blob_to_vector


class VectorIndex:
    def __init__(self) -> None:
        self._doc_ids: np.ndarray = np.empty(0, dtype=np.int64)
        self._matrix: np.ndarray = np.zeros((0, 1), dtype=np.float32)
        self._generation = 0
        self._loaded_generation = -1
        self._loaded_model: str | None = None

    def invalidate(self) -> None:
        self._generation += 1

    async def _ensure_loaded(self, db: AsyncSession, model: str) -> None:
        if self._loaded_generation == self._generation and self._loaded_model == model:
            return
        rows = await db.execute(
            text("SELECT document_id, vector FROM embeddings WHERE model = :model"),
            {"model": model},
        )
        ids: list[int] = []
        vecs: list[np.ndarray] = []
        for doc_id, blob in rows:
            ids.append(doc_id)
            vecs.append(blob_to_vector(blob))
        self._doc_ids = np.asarray(ids, dtype=np.int64)
        self._matrix = np.stack(vecs) if vecs else np.zeros((0, 1), dtype=np.float32)
        self._loaded_model = model
        self._loaded_generation = self._generation

    async def top_k(
        self, db: AsyncSession, query_vec: np.ndarray, k: int, model: str
    ) -> list[tuple[int, float]]:
        await self._ensure_loaded(db, model)
        n = self._matrix.shape[0]
        if n == 0:
            return []
        scores = self._matrix @ np.asarray(query_vec, dtype=np.float32)
        k = min(k, n)
        idx = np.argpartition(-scores, k - 1)[:k]
        idx = idx[np.argsort(-scores[idx])]
        return [(int(self._doc_ids[i]), float(scores[i])) for i in idx]


VECTOR_INDEX = VectorIndex()
