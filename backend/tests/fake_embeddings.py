"""Deterministischer Fake-Encoder — gleiche Schnittstelle wie EmbeddingService,
aber ohne Modell/torch. Wort-Hash auf 32 Dimensionen (wenig Kollisionen),
L2-normalisiert."""
import hashlib

import numpy as np

DIM = 32


class FakeEmbeddingService:
    def __init__(self, model_name: str = "fake-model"):
        self.model_name = model_name

    def _vec(self, text: str) -> np.ndarray:
        v = np.zeros(DIM, dtype=np.float32)
        for word in text.lower().split():
            digest = int(hashlib.md5(word.encode("utf-8")).hexdigest(), 16)
            v[digest % DIM] += 1.0
        norm = float(np.linalg.norm(v))
        return v / norm if norm > 0 else v

    async def encode_documents(self, texts: list[str]) -> np.ndarray:
        return np.stack([self._vec(t) for t in texts])

    async def encode_query(self, text: str) -> np.ndarray:
        return self._vec(text)
