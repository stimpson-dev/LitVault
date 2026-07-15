# Semantische Suche — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Semantischer Suchmodus (Umschalter neben FTS) + „Ähnliche Dokumente" auf Basis von Dokument-Level-Embeddings (nomic-embed-text-v1.5, in-process, numpy-Brute-Force).

**Architecture:** Ein Vektor pro Dokument in der vorhandenen `embeddings`-Tabelle (BLOB float32[768], L2-normalisiert). Ein lazy geladener SentenceTransformer im Backend-Prozess erzeugt Embeddings im Threadpool; ein In-Memory-`VectorIndex` (Generation-Invalidierung wie `FACET_CACHE`) beantwortet top_k-Anfragen per Matrixmultiplikation. Indexierung läuft als neuer `JobType.EMBED` im bestehenden Job-System.

**Tech Stack:** FastAPI, SQLAlchemy 2 (async), sentence-transformers (CPU), numpy, React 19 + Vite.

**Spec:** `docs/superpowers/specs/2026-07-15-semantische-suche-design.md`

## Global Constraints

- Embedding-Modell: `nomic-ai/nomic-embed-text-v1.5` (Config-Key `embedding_model`, existiert bereits)
- Neuer Config-Key: `embedding_max_chars: int = 8000`
- Vektorformat: float32[768], L2-normalisiert, `np.tobytes()` als BLOB
- Nomic-Prefixe: `search_document: ` (Indexierung), `search_query: ` (Query) — exakt mit Leerzeichen nach dem Doppelpunkt
- Top-K der semantischen Suche: 200 Kandidaten; `total` ist dadurch bewusst auf max. 200 begrenzt
- Kein sqlite-vec, kein Chunking, kein Hybrid-Ranking (Spec: ausgeklammert)
- Tests dürfen NIE das echte Modell laden (kein Download in CI) — Fake-Encoder verwenden
- Backend-Tests: `cd backend && uv run pytest tests/<datei> -v` | Frontend-Verify: `cd frontend && npx tsc -b && npm run lint`
- Alle Commits auf `master`, Konvention: `feat:`/`fix:`/`refactor:`/`test:` wie in `git log` üblich

---

### Task 1: Embed-Text-Aufbau, BLOB-Serialisierung, Config-Key

**Files:**
- Create: `backend/app/search/embedding_service.py` (erst pure functions, Service folgt in Task 2)
- Modify: `backend/app/config.py` (Zeile ~36, nach `classification_max_chars`)
- Modify: `config.example.json` (falls vorhanden: Key ergänzen)
- Test: `backend/tests/test_embedding_service.py`

**Interfaces:**
- Produces: `build_embed_text(title: str | None, summary: str | None, full_text: str | None, max_chars: int) -> str`; `vector_to_blob(vec: np.ndarray) -> bytes`; `blob_to_vector(blob: bytes) -> np.ndarray` (float32); Settings-Feld `embedding_max_chars: int = 8000`

- [ ] **Step 1: Failing Tests schreiben**

```python
# backend/tests/test_embedding_service.py
import numpy as np

from app.search.embedding_service import build_embed_text, vector_to_blob, blob_to_vector


def test_build_embed_text_joins_fields():
    result = build_embed_text("Titel", "Zusammenfassung", "Volltext hier", max_chars=8000)
    assert result == "Titel\nZusammenfassung\nVolltext hier"


def test_build_embed_text_skips_missing_fields():
    assert build_embed_text(None, None, "nur text", max_chars=8000) == "nur text"
    assert build_embed_text("Titel", None, None, max_chars=8000) == "Titel"
    assert build_embed_text(None, None, None, max_chars=8000) == ""


def test_build_embed_text_truncates_full_text():
    result = build_embed_text("T", None, "x" * 10000, max_chars=100)
    assert result == "T\n" + "x" * 100


def test_vector_blob_roundtrip():
    vec = np.array([0.1, -0.5, 0.25], dtype=np.float32)
    blob = vector_to_blob(vec)
    assert isinstance(blob, bytes)
    restored = blob_to_vector(blob)
    assert restored.dtype == np.float32
    np.testing.assert_array_equal(restored, vec)


def test_vector_to_blob_casts_float64():
    vec = np.array([1.0, 2.0])  # float64
    restored = blob_to_vector(vector_to_blob(vec))
    assert restored.dtype == np.float32
    assert len(restored) == 2


def test_embedding_max_chars_default():
    from app.config import Settings
    assert Settings.model_fields["embedding_max_chars"].default == 8000
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `cd backend && uv run pytest tests/test_embedding_service.py -v`
Expected: FAIL / ERROR mit `ModuleNotFoundError: No module named 'app.search.embedding_service'`

- [ ] **Step 3: Implementieren**

```python
# backend/app/search/embedding_service.py
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
```

In `backend/app/config.py` direkt nach `classification_max_chars: int = 6000` einfügen:

```python
    embedding_max_chars: int = 8000
```

Falls `config.example.json` existiert und Backend-Keys enthält: `"embedding_max_chars": 8000` ergänzen (ansonsten überspringen — der Default greift).

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `cd backend && uv run pytest tests/test_embedding_service.py -v`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/search/embedding_service.py backend/app/config.py backend/tests/test_embedding_service.py config.example.json
git commit -m "feat: Embed-Text-Aufbau + Vektor-Serialisierung fuer semantische Suche (Task 1)"
```

---

### Task 2: EmbeddingService (lazy Model, Threadpool, Prefixe) + Fake für Tests

**Files:**
- Modify: `backend/app/search/embedding_service.py`
- Modify: `backend/pyproject.toml` (dependencies: `einops` — nomic-Modell braucht es via `trust_remote_code`)
- Create: `backend/tests/fake_embeddings.py`
- Test: `backend/tests/test_embedding_service.py` (erweitern)

**Interfaces:**
- Consumes: `vector_to_blob`/`blob_to_vector` aus Task 1
- Produces: `class ModelLoadError(Exception)`; `class EmbeddingService` mit `model_name: str`, `async encode_documents(texts: list[str]) -> np.ndarray` (Shape [n, dim], normalisiert), `async encode_query(text: str) -> np.ndarray` (Shape [dim]); Modul-Funktion `get_embedding_service() -> EmbeddingService` (Singleton, folgt `settings.embedding_model`); Test-Fake `tests/fake_embeddings.py::FakeEmbeddingService` (gleiche async-Schnittstelle, deterministische 8-dim-Vektoren, kein torch)

- [ ] **Step 1: Failing Tests schreiben (an `test_embedding_service.py` anhängen)**

```python
import pytest

from app.search import embedding_service
from tests.fake_embeddings import FakeEmbeddingService


async def test_fake_encoder_is_deterministic_and_normalized():
    fake = FakeEmbeddingService()
    v1 = await fake.encode_query("kegelrad tragfähigkeit")
    v2 = await fake.encode_query("kegelrad tragfähigkeit")
    np.testing.assert_array_equal(v1, v2)
    assert abs(float(np.linalg.norm(v1)) - 1.0) < 1e-5


async def test_fake_encoder_similar_texts_score_higher():
    fake = FakeEmbeddingService()
    docs = await fake.encode_documents([
        "kegelrad tragfähigkeit untersuchung",
        "beton brückenbau statik",
    ])
    q = await fake.encode_query("kegelrad tragfähigkeit")
    scores = docs @ q
    assert scores[0] > scores[1]


def test_get_embedding_service_singleton(monkeypatch):
    monkeypatch.setattr(embedding_service, "_service", None)
    s1 = embedding_service.get_embedding_service()
    s2 = embedding_service.get_embedding_service()
    assert s1 is s2
    from app.config import get_settings
    assert s1.model_name == get_settings().embedding_model


def test_encode_uses_prefixes(monkeypatch):
    captured: list[list[str]] = []
    svc = embedding_service.EmbeddingService("dummy")

    def fake_encode(texts):
        captured.append(texts)
        return np.zeros((len(texts), 4), dtype=np.float32)

    monkeypatch.setattr(svc, "_encode", fake_encode)
    import asyncio
    asyncio.run(svc.encode_documents(["doc eins"]))
    asyncio.run(svc.encode_query("frage"))
    assert captured[0] == ["search_document: doc eins"]
    assert captured[1] == ["search_query: frage"]
```

Hinweis: `test_encode_uses_prefixes` ist eine sync-Funktion mit `asyncio.run` — das umgeht die pytest-asyncio-Auto-Loop und funktioniert, weil `_encode` gemockt ist (kein echtes Modell).

- [ ] **Step 2: Fake-Encoder schreiben**

```python
# backend/tests/fake_embeddings.py
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
```

- [ ] **Step 3: Tests laufen lassen — die zwei Service-Tests müssen fehlschlagen**

Run: `cd backend && uv run pytest tests/test_embedding_service.py -v`
Expected: Fake-Tests PASS, `test_get_embedding_service_singleton` und `test_encode_uses_prefixes` FAIL mit `AttributeError` (kein `EmbeddingService`/`get_embedding_service`)

- [ ] **Step 4: EmbeddingService implementieren (an `embedding_service.py` anhängen)**

```python
import asyncio
import logging
import threading

from app.config import get_settings

logger = logging.getLogger("litvault.embeddings")

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
```

Die Imports (`asyncio`, `logging`, `threading`, `get_settings`) an den Dateianfang zu den bestehenden Imports verschieben.

In `backend/pyproject.toml` unter `dependencies` ergänzen (nach `"sentence-transformers",`):

```toml
    "einops",
```

Dann: `cd backend && uv sync`

- [ ] **Step 5: Tests laufen lassen — alle müssen bestehen**

Run: `cd backend && uv run pytest tests/test_embedding_service.py -v`
Expected: 10 passed

- [ ] **Step 6: Commit**

```bash
git add backend/app/search/embedding_service.py backend/tests/fake_embeddings.py backend/tests/test_embedding_service.py backend/pyproject.toml backend/uv.lock
git commit -m "feat: EmbeddingService mit lazy Model-Load und nomic-Prefixen (Task 2)"
```

---

### Task 3: VectorIndex (In-Memory, top_k, Generation-Invalidierung)

**Files:**
- Create: `backend/app/search/vector_index.py`
- Test: `backend/tests/test_vector_index.py`

**Interfaces:**
- Consumes: `blob_to_vector` (Task 1)
- Produces: `class VectorIndex` mit `invalidate() -> None` und `async top_k(db: AsyncSession, query_vec: np.ndarray, k: int, model: str) -> list[tuple[int, float]]` (doc_id, score — absteigend sortiert); Modul-Singleton `VECTOR_INDEX`. Der Index lädt ALLE Embeddings des Modells (kein excluded-Filter — den erledigt der SQL-Schritt der Aufrufer).

- [ ] **Step 1: Failing Tests schreiben**

```python
# backend/tests/test_vector_index.py
import numpy as np
from sqlalchemy import text

from app.search.embedding_service import vector_to_blob
from app.search.vector_index import VectorIndex


async def _insert_embedding(db, doc_id: int, vec, model: str = "test-model"):
    await db.execute(
        text("INSERT INTO embeddings (document_id, model, vector, created_at)"
             " VALUES (:id, :model, :vector, datetime('now'))"),
        {"id": doc_id, "model": model,
         "vector": vector_to_blob(np.asarray(vec, dtype=np.float32))},
    )
    await db.commit()


async def test_top_k_returns_best_matches_sorted(db_session):
    # Seed-Dokumente aus conftest haben die IDs 1-4
    await _insert_embedding(db_session, 1, [1.0, 0.0])
    await _insert_embedding(db_session, 2, [0.0, 1.0])
    await _insert_embedding(db_session, 3, [0.7071, 0.7071])
    index = VectorIndex()
    result = await index.top_k(db_session, np.array([1.0, 0.0], dtype=np.float32), k=2, model="test-model")
    assert [doc_id for doc_id, _ in result] == [1, 3]
    assert result[0][1] > result[1][1]


async def test_top_k_filters_by_model(db_session):
    await _insert_embedding(db_session, 1, [1.0, 0.0], model="old-model")
    index = VectorIndex()
    result = await index.top_k(db_session, np.array([1.0, 0.0], dtype=np.float32), k=5, model="test-model")
    assert result == []


async def test_top_k_empty_index(db_session):
    index = VectorIndex()
    result = await index.top_k(db_session, np.array([1.0, 0.0], dtype=np.float32), k=5, model="test-model")
    assert result == []


async def test_invalidate_triggers_reload(db_session):
    await _insert_embedding(db_session, 1, [1.0, 0.0])
    index = VectorIndex()
    q = np.array([1.0, 0.0], dtype=np.float32)
    assert len(await index.top_k(db_session, q, 5, "test-model")) == 1

    # Ohne invalidate: neuer Eintrag wird nicht gesehen (Cache steht)
    await _insert_embedding(db_session, 2, [0.9, 0.1])
    assert len(await index.top_k(db_session, q, 5, "test-model")) == 1

    index.invalidate()
    assert len(await index.top_k(db_session, q, 5, "test-model")) == 2


async def test_model_switch_triggers_reload(db_session):
    await _insert_embedding(db_session, 1, [1.0, 0.0], model="model-a")
    await _insert_embedding(db_session, 2, [1.0, 0.0], model="model-b")
    index = VectorIndex()
    q = np.array([1.0, 0.0], dtype=np.float32)
    a = await index.top_k(db_session, q, 5, "model-a")
    b = await index.top_k(db_session, q, 5, "model-b")
    assert [d for d, _ in a] == [1]
    assert [d for d, _ in b] == [2]
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `cd backend && uv run pytest tests/test_vector_index.py -v`
Expected: ERROR mit `ModuleNotFoundError: No module named 'app.search.vector_index'`

- [ ] **Step 3: Implementieren**

```python
# backend/app/search/vector_index.py
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
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `cd backend && uv run pytest tests/test_vector_index.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/search/vector_index.py backend/tests/test_vector_index.py
git commit -m "feat: In-Memory-VectorIndex mit Generation-Invalidierung (Task 3)"
```

---

### Task 4: Refactoring — Filter-Clause-Builder extrahieren (DRY)

**Files:**
- Modify: `backend/app/search/service.py` (der Filterblock ist in `search()` Zeilen 62–128 und `get_facets()` Zeilen 237–302 dupliziert)
- Test: bestehende `backend/tests/test_search_service.py` (Sicherheitsnetz, keine neuen Tests)

**Interfaces:**
- Produces: Modul-Funktion `build_filter_clauses(filters: SearchFilters) -> tuple[list[str], dict]` in `app/search/service.py` — gibt `(["AND d.excluded = 0", ...], params)` zurück; wird in Task 6 von der semantischen Suche konsumiert.

- [ ] **Step 1: Bestehende Tests als Baseline laufen lassen**

Run: `cd backend && uv run pytest tests/test_search_service.py tests/test_facet_cache.py -v`
Expected: alle PASS (Baseline notieren)

- [ ] **Step 2: Funktion extrahieren**

In `service.py` nach der `SearchResult`-Dataclass einfügen (Inhalt = exakt der bisherige Block aus `search()`, Zeilen 62–128 — von `params: dict = {}` bis zum Ende des `category`-Blocks):

```python
def build_filter_clauses(filters: SearchFilters) -> tuple[list[str], dict]:
    """Metadaten-Filter als SQL-Fragmente (Alias d) + Bind-Parameter."""
    params: dict = {}
    filter_clauses: list[str] = ["AND d.excluded = 0"]

    if filters.doc_type is not None:
        filter_clauses.append("AND d.doc_type = :doc_type")
        params["doc_type"] = filters.doc_type

    if filters.year_min is not None:
        filter_clauses.append("AND d.year >= :year_min")
        params["year_min"] = filters.year_min

    if filters.year_max is not None:
        filter_clauses.append("AND d.year <= :year_max")
        params["year_max"] = filters.year_max

    if filters.language is not None:
        filter_clauses.append("AND d.language = :language")
        params["language"] = filters.language

    if filters.author is not None:
        filter_clauses.append("AND d.authors LIKE :author_pattern")
        params["author_pattern"] = f"%{filters.author}%"

    if filters.has_text is not None:
        filter_clauses.append("AND d.has_text = :has_text")
        params["has_text"] = filters.has_text

    if filters.classification_source is not None:
        filter_clauses.append("AND d.classification_source = :classification_source")
        params["classification_source"] = filters.classification_source

    if filters.file_type is not None:
        filter_clauses.append("AND d.file_type = :file_type")
        params["file_type"] = filters.file_type

    if filters.processing_status is not None:
        filter_clauses.append("AND d.processing_status = :processing_status")
        params["processing_status"] = filters.processing_status

    if filters.file_size_min is not None:
        filter_clauses.append("AND d.file_size >= :file_size_min")
        params["file_size_min"] = filters.file_size_min

    if filters.file_size_max is not None:
        filter_clauses.append("AND d.file_size <= :file_size_max")
        params["file_size_max"] = filters.file_size_max

    if filters.created_after is not None:
        filter_clauses.append("AND d.created_at >= :created_after")
        params["created_after"] = filters.created_after

    if filters.created_before is not None:
        filter_clauses.append("AND d.created_at <= :created_before")
        params["created_before"] = filters.created_before

    if filters.category is not None:
        filter_clauses.append(
            "AND d.id IN ("
            "SELECT dc.document_id FROM document_categories dc "
            "JOIN categories c ON c.id = dc.category_id "
            "WHERE c.name = :category"
            ")"
        )
        params["category"] = filters.category

    return filter_clauses, params
```

In `search()` den duplizierten Block (Zeilen 62–128) ersetzen durch:

```python
        sanitized = sanitize_fts5_query(query)
        filter_clauses, params = build_filter_clauses(filters)
```

In `get_facets()` den duplizierten Block (Zeilen 236–302, nach dem Cache-Check) ersetzen durch:

```python
        sanitized = sanitize_fts5_query(query)
        filter_clauses, params = build_filter_clauses(filters)
```

- [ ] **Step 3: Tests laufen lassen — müssen unverändert bestehen**

Run: `cd backend && uv run pytest tests/test_search_service.py tests/test_facet_cache.py -v`
Expected: gleiche Anzahl PASS wie Baseline, 0 FAIL

- [ ] **Step 4: Commit**

```bash
git add backend/app/search/service.py
git commit -m "refactor: Filter-Clause-Builder aus search/get_facets extrahiert (Task 4)"
```

---

### Task 5: Facetten über Kandidaten-IDs (get_facets erweitern)

**Files:**
- Modify: `backend/app/search/service.py` (`get_facets`, ab Zeile ~223)
- Test: `backend/tests/test_search_service.py` (erweitern)

**Interfaces:**
- Consumes: `build_filter_clauses` (Task 4)
- Produces: `SearchService.get_facets(query="", filters=None, candidate_ids: list[int] | None = None)` — bei gesetzten `candidate_ids` wird statt der FTS-CTE `AND d.id IN (:candidate_ids)` (expanding) verwendet und der Facetten-Cache übersprungen (Kandidaten hängen an der Embedding-Generation; Nicht-Cachen erfüllt die Kollisionsfreiheit trivial — bewusste Vereinfachung gegenüber Spec-Wortlaut „Cache-Key enthält Modus").

- [ ] **Step 1: Failing Tests schreiben (an `test_search_service.py` anhängen)**

```python
async def test_facets_for_candidate_ids(db_session):
    # IDs 1 (kegelrad/bericht) und 3 (norm) aus dem conftest-Seed
    facets = await SearchService(db_session).get_facets(candidate_ids=[1, 3])
    doc_types = {f["name"]: f["count"] for f in facets["doc_types"]}
    assert doc_types == {"bericht": 1, "norm": 1}


async def test_facets_for_empty_candidate_ids(db_session):
    facets = await SearchService(db_session).get_facets(candidate_ids=[])
    assert facets["doc_types"] == []
    assert facets["categories"] == []
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `cd backend && uv run pytest tests/test_search_service.py -v -k candidate`
Expected: FAIL mit `TypeError: ... unexpected keyword argument 'candidate_ids'`

- [ ] **Step 3: Implementieren**

Signatur von `get_facets` ändern:

```python
    async def get_facets(
        self,
        query: str = "",
        filters: SearchFilters | None = None,
        candidate_ids: list[int] | None = None,
    ) -> dict:
```

Direkt nach `if filters is None: filters = SearchFilters()` einfügen:

```python
        empty: dict = {"categories": [], "doc_types": [], "years": [], "file_types": [], "statuses": []}
        if candidate_ids is not None and len(candidate_ids) == 0:
            return empty
```

Den Cache-Check (`cache_key = ...` / `cached = ...` / `if cached ...`) nur ausführen, wenn `candidate_ids is None` — dazu den Block so wrappen:

```python
        cache_key = (query, astuple(filters))
        if candidate_ids is None:
            cached = FACET_CACHE.get(cache_key)
            if cached is not None:
                return cached
```

Den CTE-Block ersetzen:

```python
        cte = ""
        if candidate_ids is not None:
            fts_subquery = "AND d.id IN :candidate_ids"
            params["candidate_ids"] = candidate_ids
        elif sanitized:
            params["query"] = sanitized
            cte = ("WITH matched(rowid) AS ("
                   "SELECT documents_fts.rowid FROM documents_fts WHERE documents_fts MATCH :query) ")
            fts_subquery = "AND d.id IN (SELECT rowid FROM matched)"
        else:
            fts_subquery = ""
```

Beim Ausführen der Query das expanding-Bindparam setzen (bestehende Zeile `rows = await self.db.execute(text(union_sql), params)` ersetzen):

```python
            stmt = text(union_sql)
            if candidate_ids is not None:
                from sqlalchemy import bindparam
                stmt = stmt.bindparams(bindparam("candidate_ids", expanding=True))
            rows = await self.db.execute(stmt, params)
```

(`from sqlalchemy import bindparam` stattdessen in die Modul-Imports zu `text` aufnehmen.)

Und das Cache-`set` nur bei `candidate_ids is None`:

```python
            if candidate_ids is None:
                FACET_CACHE.set(cache_key, facets)
```

Die `facets`-Initialisierung kann `empty` wiederverwenden: `facets: dict = {k: [] for k in empty}` oder unverändert bleiben.

- [ ] **Step 4: Alle Suchtests laufen lassen**

Run: `cd backend && uv run pytest tests/test_search_service.py -v`
Expected: alle PASS (alte + 2 neue)

- [ ] **Step 5: Commit**

```bash
git add backend/app/search/service.py backend/tests/test_search_service.py
git commit -m "feat: Facetten ueber Kandidaten-IDs fuer semantischen Modus (Task 5)"
```

---

### Task 6: SemanticSearchService

**Files:**
- Create: `backend/app/search/semantic.py`
- Test: `backend/tests/test_semantic_search.py`

**Interfaces:**
- Consumes: `embedding_service.get_embedding_service()` (Task 2, wird in Tests gepatcht), `VECTOR_INDEX.top_k` (Task 3), `build_filter_clauses` (Task 4), `SearchService.get_facets(candidate_ids=...)` (Task 5), `SearchResult`/`SearchFilters` (bestehend)
- Produces: `class SemanticSearchService` mit `__init__(db: AsyncSession)` und `async search(query: str, filters: SearchFilters | None = None, offset: int = 0, limit: int = 50, include_facets: bool = True) -> SearchResult`. Score steht im Feld `rank` (float 0..1), `title_snippet`/`text_snippet` sind `None`. Konstante `TOP_K = 200`.

- [ ] **Step 1: Failing Tests schreiben**

```python
# backend/tests/test_semantic_search.py
import numpy as np
import pytest
from sqlalchemy import text

from app.search import embedding_service
from app.search.embedding_service import vector_to_blob
from app.search.semantic import SemanticSearchService
from app.search.service import SearchFilters
from app.search.vector_index import VECTOR_INDEX
from tests.fake_embeddings import FakeEmbeddingService


@pytest.fixture
def fake_embeddings(monkeypatch):
    fake = FakeEmbeddingService()
    monkeypatch.setattr(embedding_service, "get_embedding_service", lambda: fake)
    VECTOR_INDEX.invalidate()
    yield fake
    VECTOR_INDEX.invalidate()


async def _embed_seed_docs(db, fake):
    """Embeddings für die conftest-Seed-Dokumente (IDs 1-3 haben Text) erzeugen."""
    from app.config import get_settings
    model = get_settings().embedding_model
    rows = (await db.execute(text(
        "SELECT id, title, full_text FROM documents WHERE has_text = 1"
    ))).all()
    for doc_id, title, full_text in rows:
        vec = (await fake.encode_documents([f"{title}\n{full_text}"]))[0]
        await db.execute(
            text("INSERT INTO embeddings (document_id, model, vector, created_at)"
                 " VALUES (:id, :model, :vector, datetime('now'))"),
            {"id": doc_id, "model": model, "vector": vector_to_blob(vec)},
        )
    await db.commit()


async def test_semantic_search_ranks_by_similarity(db_session, fake_embeddings):
    await _embed_seed_docs(db_session, fake_embeddings)
    result = await SemanticSearchService(db_session).search("kegelrad tragfähigkeit")
    assert result.total == 3  # alle embeddeten Docs sind Kandidaten (Ranking, kein Cutoff)
    assert result.documents[0]["file_path"] == "a/kegelrad.pdf"
    assert result.documents[0]["rank"] >= result.documents[1]["rank"]
    assert result.documents[0]["title_snippet"] is None


async def test_semantic_search_applies_filters(db_session, fake_embeddings):
    await _embed_seed_docs(db_session, fake_embeddings)
    result = await SemanticSearchService(db_session).search(
        "kegelrad", SearchFilters(doc_type="norm")
    )
    assert result.total == 1
    assert result.documents[0]["file_path"] == "b/norm.pdf"


async def test_semantic_search_pagination(db_session, fake_embeddings):
    await _embed_seed_docs(db_session, fake_embeddings)
    page1 = await SemanticSearchService(db_session).search("kegelrad", limit=2, offset=0)
    page2 = await SemanticSearchService(db_session).search("kegelrad", limit=2, offset=2)
    assert len(page1.documents) == 2
    assert len(page2.documents) == 1
    assert page1.total == page2.total == 3
    ids_1 = {d["id"] for d in page1.documents}
    ids_2 = {d["id"] for d in page2.documents}
    assert ids_1.isdisjoint(ids_2)


async def test_semantic_search_no_embeddings_returns_empty(db_session, fake_embeddings):
    result = await SemanticSearchService(db_session).search("kegelrad")
    assert result.total == 0
    assert result.documents == []


async def test_semantic_search_facets_over_candidates(db_session, fake_embeddings):
    await _embed_seed_docs(db_session, fake_embeddings)
    result = await SemanticSearchService(db_session).search("kegelrad")
    names = {f["name"] for f in result.facets["doc_types"]}
    assert "bericht" in names and "norm" in names


async def test_semantic_search_excluded_docs_filtered(db_session, fake_embeddings):
    await _embed_seed_docs(db_session, fake_embeddings)
    await db_session.execute(text("UPDATE documents SET excluded = 1 WHERE id = 1"))
    await db_session.commit()
    result = await SemanticSearchService(db_session).search("kegelrad tragfähigkeit")
    assert all(d["id"] != 1 for d in result.documents)
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `cd backend && uv run pytest tests/test_semantic_search.py -v`
Expected: ERROR mit `ModuleNotFoundError: No module named 'app.search.semantic'`

- [ ] **Step 3: Implementieren**

```python
# backend/app/search/semantic.py
"""Semantische Suche: Query-Embedding -> VectorIndex-Kandidaten -> SQL-Filter.

Top-K (200) begrenzt bewusst die Ergebnismenge — semantische Suche ist ein
Ranking, keine Vollzählung. Filter/Pagination laufen über die Kandidaten-IDs.
"""
import logging

from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.search import embedding_service
from app.search.service import SearchFilters, SearchResult, SearchService, build_filter_clauses
from app.search.vector_index import VECTOR_INDEX

logger = logging.getLogger("litvault.search")

TOP_K = 200

_SELECT_COLUMNS = (
    "d.id, d.file_path, d.file_hash, d.file_type, d.file_size, d.mtime,"
    " d.title, d.authors, d.year, d.doc_type, d.source, d.language,"
    " d.summary, d.has_text, d.doi, d.processing_status,"
    " d.classification_confidence, d.classification_source,"
    " d.created_at, d.updated_at, d.indexed_at,"
    " NULL as title_snippet, NULL as text_snippet, 0 as rank"
)

_EMPTY_FACETS: dict = {"categories": [], "doc_types": [], "years": [], "file_types": [], "statuses": []}


class SemanticSearchService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def search(
        self,
        query: str,
        filters: SearchFilters | None = None,
        offset: int = 0,
        limit: int = 50,
        include_facets: bool = True,
    ) -> SearchResult:
        if filters is None:
            filters = SearchFilters()

        settings = get_settings()
        service = embedding_service.get_embedding_service()
        query_vec = await service.encode_query(query)
        candidates = await VECTOR_INDEX.top_k(
            self.db, query_vec, TOP_K, settings.embedding_model
        )
        if not candidates:
            return SearchResult(documents=[], total=0,
                                facets=dict(_EMPTY_FACETS) if include_facets else {})

        scores = {doc_id: score for doc_id, score in candidates}
        filter_clauses, params = build_filter_clauses(filters)
        filter_sql = " ".join(filter_clauses)
        stmt = text(
            f"SELECT {_SELECT_COLUMNS} FROM documents d"
            " WHERE d.id IN :candidate_ids"
            f" {filter_sql}"
        ).bindparams(bindparam("candidate_ids", expanding=True))
        params["candidate_ids"] = list(scores)

        rows = await self.db.execute(stmt, params)
        documents = [dict(row._mapping) for row in rows]
        for doc in documents:
            doc["rank"] = scores[doc["id"]]
        documents.sort(key=lambda d: d["rank"], reverse=True)

        total = len(documents)
        page = documents[offset:offset + limit]

        facets: dict = {}
        if include_facets:
            facets = await SearchService(self.db).get_facets(
                candidate_ids=[d["id"] for d in documents]
            )
        return SearchResult(documents=page, total=total, facets=facets)
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `cd backend && uv run pytest tests/test_semantic_search.py -v`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/search/semantic.py backend/tests/test_semantic_search.py
git commit -m "feat: SemanticSearchService (Kandidaten + Filter + Facetten) (Task 6)"
```

---

### Task 7: API — `mode=semantic` im Search-Endpoint + 503-Pfad

**Files:**
- Modify: `backend/app/search/router.py` (`search()`-Endpoint, Zeilen 33–79)
- Test: `backend/tests/test_search_api_semantic.py`

**Interfaces:**
- Consumes: `SemanticSearchService` (Task 6), `ModelLoadError` (Task 2)
- Produces: `GET /api/search?mode=semantic&q=...` — gleiche Response-Form wie bisher (`documents`, `total`, `facets`, `query`); Default `mode=fts` (API-kompatibel). Bei `ModelLoadError`: HTTP 503 mit `detail`. Leere Query im semantic-Modus → normaler Browse-Zweig.

- [ ] **Step 1: Failing Tests schreiben**

```python
# backend/tests/test_search_api_semantic.py
"""API-Tests für mode=semantic via ASGI-Transport mit Test-DB-Override."""
import numpy as np
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.deps import get_db
from app.main import app
from app.search import embedding_service
from app.search.embedding_service import ModelLoadError, vector_to_blob
from app.search.vector_index import VECTOR_INDEX
from tests.fake_embeddings import FakeEmbeddingService


@pytest.fixture
async def client(db_session, monkeypatch):
    fake = FakeEmbeddingService()
    monkeypatch.setattr(embedding_service, "get_embedding_service", lambda: fake)
    VECTOR_INDEX.invalidate()

    from app.config import get_settings
    model = get_settings().embedding_model
    rows = (await db_session.execute(text(
        "SELECT id, title, full_text FROM documents WHERE has_text = 1"
    ))).all()
    for doc_id, title, full_text in rows:
        vec = (await fake.encode_documents([f"{title}\n{full_text}"]))[0]
        await db_session.execute(
            text("INSERT INTO embeddings (document_id, model, vector, created_at)"
                 " VALUES (:id, :model, :vector, datetime('now'))"),
            {"id": doc_id, "model": model, "vector": vector_to_blob(vec)},
        )
    await db_session.commit()

    app.dependency_overrides[get_db] = lambda: db_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
    VECTOR_INDEX.invalidate()


async def test_search_mode_semantic_returns_ranked_results(client):
    resp = await client.get("/api/search", params={"q": "kegelrad tragfähigkeit", "mode": "semantic"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert data["documents"][0]["file_path"] == "a/kegelrad.pdf"
    assert data["documents"][0]["rank"] > 0


async def test_search_default_mode_unchanged(client):
    resp = await client.get("/api/search", params={"q": "kegelrad"})
    assert resp.status_code == 200
    assert resp.json()["total"] == 2  # FTS-Verhalten wie bisher


async def test_search_semantic_empty_query_browses(client):
    resp = await client.get("/api/search", params={"q": "", "mode": "semantic"})
    assert resp.status_code == 200
    assert resp.json()["total"] == 4  # Browse-Zweig, alle nicht-excludeten Docs


async def test_search_semantic_model_error_returns_503(client, monkeypatch):
    class BrokenService:
        model_name = "broken"

        async def encode_query(self, text):
            raise ModelLoadError("model missing")

    monkeypatch.setattr(embedding_service, "get_embedding_service", lambda: BrokenService())
    resp = await client.get("/api/search", params={"q": "kegelrad", "mode": "semantic"})
    assert resp.status_code == 503
    assert "model missing" in resp.json()["detail"]
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `cd backend && uv run pytest tests/test_search_api_semantic.py -v`
Expected: `test_search_mode_semantic_returns_ranked_results` FAIL (mode wird ignoriert → FTS-Ergebnis mit total==2), `test_search_semantic_model_error_returns_503` FAIL (200 statt 503). Die zwei Kompatibilitätstests dürfen schon PASS sein.

- [ ] **Step 3: Implementieren**

In `router.py` beim `search()`-Endpoint den Parameter ergänzen (nach `sort: str = "date_desc"`):

```python
    mode: str = "fts",
```

Und den Service-Aufruf (Zeilen 72–73) ersetzen:

```python
    if mode == "semantic" and q:
        from app.search.embedding_service import ModelLoadError
        from app.search.semantic import SemanticSearchService

        try:
            result = await SemanticSearchService(db).search(
                q, filters, offset, limit, include_facets=include_facets
            )
        except ModelLoadError as exc:
            raise HTTPException(status_code=503, detail=f"Embedding-Modell nicht verfügbar: {exc}")
    else:
        service = SearchService(db)
        result = await service.search(q, filters, offset, limit, sort=sort, include_facets=include_facets)
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `cd backend && uv run pytest tests/test_search_api_semantic.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/search/router.py backend/tests/test_search_api_semantic.py
git commit -m "feat: mode=semantic im Search-API mit 503 bei Modellfehler (Task 7)"
```

---

### Task 8: `GET /api/documents/{doc_id}/similar`

**Files:**
- Modify: `backend/app/documents/router.py` (neuer Endpoint VOR `get_document`, nach `get_duplicates`)
- Modify: `backend/tests/test_documents_api.py` (Route in `EXPECTED_PATHS` ergänzen)
- Test: `backend/tests/test_similar_api.py`

**Interfaces:**
- Consumes: `VECTOR_INDEX.top_k` (Task 3), `blob_to_vector` (Task 1)
- Produces: `GET /api/documents/{doc_id}/similar?limit=10` → `{"embedded": bool, "similar": [{id, title, authors, year, doc_type, file_path, file_type, summary, rank}]}`. Kein Modell-Load nötig (Vektor kommt aus der DB) → kein 503-Pfad. Selbstausschluss + `excluded = 0`.

- [ ] **Step 1: Failing Tests schreiben**

```python
# backend/tests/test_similar_api.py
import numpy as np
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.deps import get_db
from app.main import app
from app.search.embedding_service import vector_to_blob
from app.search.vector_index import VECTOR_INDEX


async def _insert(db, doc_id, vec):
    from app.config import get_settings
    await db.execute(
        text("INSERT INTO embeddings (document_id, model, vector, created_at)"
             " VALUES (:id, :model, :vector, datetime('now'))"),
        {"id": doc_id, "model": get_settings().embedding_model,
         "vector": vector_to_blob(np.asarray(vec, dtype=np.float32))},
    )
    await db.commit()


@pytest.fixture
async def client(db_session):
    VECTOR_INDEX.invalidate()
    app.dependency_overrides[get_db] = lambda: db_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
    VECTOR_INDEX.invalidate()


async def test_similar_returns_neighbors_without_self(client, db_session):
    await _insert(db_session, 1, [1.0, 0.0])
    await _insert(db_session, 2, [0.9, 0.1])
    await _insert(db_session, 3, [0.0, 1.0])
    resp = await client.get("/api/documents/1/similar")
    assert resp.status_code == 200
    data = resp.json()
    assert data["embedded"] is True
    ids = [d["id"] for d in data["similar"]]
    assert 1 not in ids
    assert ids[0] == 2  # ähnlichster Nachbar zuerst
    assert data["similar"][0]["rank"] > data["similar"][-1]["rank"]


async def test_similar_without_embedding_returns_flag(client):
    resp = await client.get("/api/documents/1/similar")
    assert resp.status_code == 200
    assert resp.json() == {"embedded": False, "similar": []}


async def test_similar_respects_excluded(client, db_session):
    await _insert(db_session, 1, [1.0, 0.0])
    await _insert(db_session, 2, [0.9, 0.1])
    await db_session.execute(text("UPDATE documents SET excluded = 1 WHERE id = 2"))
    await db_session.commit()
    resp = await client.get("/api/documents/1/similar")
    ids = [d["id"] for d in resp.json()["similar"]]
    assert 2 not in ids


async def test_similar_unknown_document_404(client):
    resp = await client.get("/api/documents/9999/similar")
    assert resp.status_code == 404
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `cd backend && uv run pytest tests/test_similar_api.py -v`
Expected: FAIL — 404 auf allen Requests (Route existiert nicht; Achtung: `/documents/1/similar` matcht `/documents/{doc_id}` NICHT, also echte 404)

- [ ] **Step 3: Implementieren**

In `documents/router.py` nach `get_duplicates` (vor `get_document`) einfügen:

```python
@router.get("/documents/{doc_id}/similar")
async def get_similar_documents(
    doc_id: int,
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Inhaltlich ähnliche Dokumente (Cosine über Dokument-Embeddings)."""
    from app.config import get_settings
    from app.search.embedding_service import blob_to_vector
    from app.search.vector_index import VECTOR_INDEX

    result = await db.execute(select(Document.id).where(Document.id == doc_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Document not found")

    settings = get_settings()
    row = await db.execute(
        text("SELECT vector FROM embeddings WHERE document_id = :id AND model = :model"),
        {"id": doc_id, "model": settings.embedding_model},
    )
    blob = row.scalar_one_or_none()
    if blob is None:
        return {"embedded": False, "similar": []}

    # Puffer für Selbstausschluss + excluded-Filter
    candidates = await VECTOR_INDEX.top_k(
        db, blob_to_vector(blob), limit + 20, settings.embedding_model
    )
    scores = {cid: score for cid, score in candidates if cid != doc_id}
    if not scores:
        return {"embedded": True, "similar": []}

    from sqlalchemy import bindparam
    stmt = text(
        "SELECT d.id, d.title, d.authors, d.year, d.doc_type, d.file_path,"
        " d.file_type, d.summary"
        " FROM documents d WHERE d.id IN :ids AND d.excluded = 0"
    ).bindparams(bindparam("ids", expanding=True))
    rows = await db.execute(stmt, {"ids": list(scores)})
    docs = [dict(r._mapping) for r in rows]
    for doc in docs:
        doc["rank"] = scores[doc["id"]]
    docs.sort(key=lambda d: d["rank"], reverse=True)
    return {"embedded": True, "similar": docs[:limit]}
```

In `test_documents_api.py` zu `EXPECTED_PATHS` hinzufügen:

```python
    "/api/documents/{doc_id}/similar",
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `cd backend && uv run pytest tests/test_similar_api.py tests/test_documents_api.py -v`
Expected: alle PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/documents/router.py backend/tests/test_similar_api.py backend/tests/test_documents_api.py
git commit -m "feat: /api/documents/{id}/similar via VectorIndex (Task 8)"
```

---

### Task 9: `JobType.EMBED` im Worker + `POST /api/documents/embed-batch`

**Files:**
- Modify: `backend/app/jobs/models.py` (JobType-Enum, Zeile 7–10)
- Modify: `backend/app/jobs/worker.py` (neuer `case JobType.EMBED:` vor `case _:`, Zeile ~182)
- Modify: `backend/app/documents/actions_router.py` (neuer Endpoint nach `classify_batch`, Zeile ~51)
- Modify: `backend/tests/test_documents_api.py` (Route ergänzen)
- Test: `backend/tests/test_embed_job.py`

**Interfaces:**
- Consumes: `embedding_service.get_embedding_service()` / `build_embed_text` / `vector_to_blob` / `ModelLoadError` (Tasks 1–2), `VECTOR_INDEX.invalidate()` (Task 3), `Embedding`-Model (bestehend)
- Produces: `JobType.EMBED = "embed"`; Worker-Zweig, der alle `has_text=1`-Dokumente ohne aktuelles Embedding (fehlend ODER `model != settings.embedding_model`) embedded — delete+insert pro Dokument, Commit pro Dokument, Fehler zählen statt abbrechen, `is_cancelled`-Check pro Iteration, `VECTOR_INDEX.invalidate()` + `FACET_CACHE`-unabhängig im `finally`; Job-Result `{"embedded": int, "errors": int, "total": int}`. Endpoint `POST /api/documents/embed-batch` → `{"job_id", "status": "queued"}`.

- [ ] **Step 1: Failing Tests schreiben**

```python
# backend/tests/test_embed_job.py
import asyncio

import numpy as np
import pytest
from sqlalchemy import text

from app.config import get_settings
from app.jobs.models import JobStore, JobType
from app.search import embedding_service
from app.search.embedding_service import vector_to_blob
from tests.fake_embeddings import FakeEmbeddingService


@pytest.fixture
def fake_embeddings(monkeypatch):
    fake = FakeEmbeddingService()
    monkeypatch.setattr(embedding_service, "get_embedding_service", lambda: fake)
    return fake


@pytest.fixture
def run_embed_job(db_session, monkeypatch):
    """Führt den EMBED-Zweig von process_job gegen die Test-DB aus."""
    from app.jobs import worker as worker_mod

    class _FakeSessionFactory:
        def __call__(self):
            return self

        async def __aenter__(self):
            return db_session

        async def __aexit__(self, *args):
            return False

    monkeypatch.setattr(worker_mod, "async_session_factory", _FakeSessionFactory())

    async def _run() -> dict:
        store = JobStore()
        job = store.create_job(JobType.EMBED, {})
        await worker_mod.process_job(job, store, get_settings(), asyncio.Lock())
        assert job.error is None, f"Job failed: {job.error}"
        return job.result

    return _run


async def test_embed_job_embeds_docs_with_text(db_session, fake_embeddings, run_embed_job):
    result = await run_embed_job()
    assert result["embedded"] == 3  # conftest-Seed: 3 Docs mit has_text=1
    assert result["errors"] == 0
    count = (await db_session.execute(text("SELECT COUNT(*) FROM embeddings"))).scalar()
    assert count == 3
    model = (await db_session.execute(text("SELECT DISTINCT model FROM embeddings"))).scalar()
    assert model == get_settings().embedding_model


async def test_embed_job_skips_already_embedded(db_session, fake_embeddings, run_embed_job):
    await run_embed_job()
    result = await run_embed_job()
    assert result["total"] == 0
    assert result["embedded"] == 0


async def test_embed_job_reembeds_on_model_change(db_session, fake_embeddings, run_embed_job):
    await db_session.execute(
        text("INSERT INTO embeddings (document_id, model, vector, created_at)"
             " VALUES (1, 'old-model', :vector, datetime('now'))"),
        {"vector": vector_to_blob(np.zeros(8, dtype=np.float32))},
    )
    await db_session.commit()
    result = await run_embed_job()
    assert result["embedded"] == 3  # inkl. Doc 1 (model-Mismatch)
    models = (await db_session.execute(
        text("SELECT DISTINCT model FROM embeddings"))).scalars().all()
    assert models == [get_settings().embedding_model]
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `cd backend && uv run pytest tests/test_embed_job.py -v`
Expected: FAIL — `job.error == "Unknown job type: JobType.EMBED"` bzw. AttributeError `EMBED`

- [ ] **Step 3: JobType + Worker-Zweig implementieren**

In `jobs/models.py`:

```python
class JobType(str, Enum):
    CRAWL = "crawl"
    CLASSIFY = "classify"
    RESCAN = "rescan"
    EMBED = "embed"
```

In `jobs/worker.py` vor `case _:` einfügen:

```python
                case JobType.EMBED:
                    from sqlalchemy import delete

                    from app.documents.models import Embedding
                    from app.search import embedding_service as emb_mod
                    from app.search.embedding_service import build_embed_text, vector_to_blob
                    from app.search.vector_index import VECTOR_INDEX

                    emb_service = emb_mod.get_embedding_service()
                    result = await session.execute(
                        select(Document)
                        .outerjoin(Embedding, Embedding.document_id == Document.id)
                        .where(
                            Document.has_text.is_(True),
                            Document.excluded == False,
                            (Embedding.document_id.is_(None))
                            | (Embedding.model != settings.embedding_model),
                        )
                    )
                    docs = result.scalars().all()
                    # Texte EAGER aufbauen — keine ORM-Attributzugriffe mehr im
                    # Loop noetig (rollback wuerde Instanzen expiren, s. CLASSIFY).
                    items = [
                        (d.id, build_embed_text(d.title, d.summary, d.full_text,
                                                settings.embedding_max_chars), d.file_path)
                        for d in docs
                    ]
                    embedded = 0
                    errors = 0
                    try:
                        for i, (item_id, embed_text_str, file_path) in enumerate(items):
                            if store.is_cancelled(job.id):
                                break
                            try:
                                vecs = await emb_service.encode_documents([embed_text_str])
                                await session.execute(
                                    delete(Embedding).where(Embedding.document_id == item_id)
                                )
                                session.add(Embedding(
                                    document_id=item_id,
                                    model=settings.embedding_model,
                                    vector=vector_to_blob(vecs[0]),
                                ))
                                await session.commit()
                                embedded += 1
                            except emb_mod.ModelLoadError:
                                raise  # fatal — ohne Modell ist der ganze Job sinnlos
                            except Exception as exc:
                                logger.warning("Embedding failed for doc %s: %s", item_id, exc)
                                await session.rollback()
                                errors += 1
                            store.update_progress(job.id, i + 1, len(items), f"Embedded: {file_path}")
                        store.complete_job(job.id, {
                            "embedded": embedded, "errors": errors, "total": len(items),
                        })
                    finally:
                        VECTOR_INDEX.invalidate()
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `cd backend && uv run pytest tests/test_embed_job.py -v`
Expected: 3 passed

- [ ] **Step 5: embed-batch-Endpoint + Routen-Test**

In `actions_router.py` nach `classify_batch` einfügen:

```python
@router.post("/documents/embed-batch")
async def embed_batch() -> dict:
    """Queue embedding generation for all documents with text (new/stale)."""
    queue = jobs_router_mod._queue
    store = jobs_router_mod._store
    if queue is None or store is None:
        raise HTTPException(status_code=503, detail="Job system not initialized")

    job = store.create_job(JobType.EMBED, {})
    await queue.put(job)
    return {"job_id": job.id, "status": "queued"}
```

In `test_documents_api.py` zu `EXPECTED_PATHS`:

```python
    "/api/documents/embed-batch",
```

Run: `cd backend && uv run pytest tests/test_documents_api.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/jobs/models.py backend/app/jobs/worker.py backend/app/documents/actions_router.py backend/tests/test_embed_job.py backend/tests/test_documents_api.py
git commit -m "feat: JobType.EMBED (Batch-Embedding) + embed-batch-Endpoint (Task 9)"
```

---

### Task 10: Auto-Trigger nach Crawl + Rescan-Invalidierung

**Files:**
- Modify: `backend/app/jobs/worker.py` (CRAWL-Zweig Zeile ~41–50, RESCAN-Zweig Zeile ~146–181)
- Test: `backend/tests/test_embed_job.py` (erweitern)

**Interfaces:**
- Consumes: `jobs_router_mod._queue` (etabliertes Muster aus `documents/router.py`), `Embedding`-Model, `VECTOR_INDEX`
- Produces: Nach erfolgreichem CRAWL mit `result.processed > 0` wird automatisch ein `EMBED`-Job eingereiht. Der RESCAN-Erfolgspfad löscht das Embedding des Dokuments und ruft `VECTOR_INDEX.invalidate()` auf.

- [ ] **Step 1: Failing Test für Rescan-Invalidierung schreiben (an `test_embed_job.py` anhängen)**

```python
async def test_rescan_deletes_embedding(db_session, fake_embeddings, run_embed_job, monkeypatch, tmp_path):
    from app.jobs import worker as worker_mod
    from app.ingest.parsers.models import ParseResult

    await run_embed_job()
    before = (await db_session.execute(
        text("SELECT COUNT(*) FROM embeddings WHERE document_id = 1"))).scalar()
    assert before == 1

    async def fake_parse(path, file_type):
        return ParseResult(text="neuer text nach rescan", has_text=True, error=None)

    import app.ingest.parsers as parsers_mod
    monkeypatch.setattr(parsers_mod, "parse_document", fake_parse)

    store = JobStore()
    f = tmp_path / "kegelrad.pdf"
    f.write_text("dummy")
    job = store.create_job(JobType.RESCAN, {
        "document_id": 1, "file_path": str(f), "file_type": "pdf",
    })
    await worker_mod.process_job(job, store, get_settings(), asyncio.Lock())
    assert job.error is None

    after = (await db_session.execute(
        text("SELECT COUNT(*) FROM embeddings WHERE document_id = 1"))).scalar()
    assert after == 0
```

Hinweis: `ParseResult` (`app/ingest/parsers/models.py`) ist eine Dataclass mit `text: str = ""`, `page_count: int = 0`, `has_text: bool = False`, `ocr_pages: list[int] = []`, `error: str | None = None` — der Fake-Aufruf oben ist damit vollständig gültig. Der RESCAN-Zweig importiert `parse_document` LOKAL (`from app.ingest.parsers import parse_document` innerhalb des case) — deshalb wird auf `app.ingest.parsers` gepatcht; das funktioniert, weil der lokale Import das Modul-Attribut erst zur Job-Laufzeit auflöst.

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `cd backend && uv run pytest tests/test_embed_job.py::test_rescan_deletes_embedding -v`
Expected: FAIL — `after == 1` (Embedding wird nicht gelöscht)

- [ ] **Step 3: Rescan-Löschung implementieren**

Im RESCAN-Zweig von `worker.py`, im Erfolgspfad direkt nach `doc.processing_status = "done"`:

```python
                            # Text hat sich geaendert -> Embedding ist veraltet
                            from sqlalchemy import delete as sa_delete

                            from app.documents.models import Embedding
                            from app.search.vector_index import VECTOR_INDEX

                            await session.execute(
                                sa_delete(Embedding).where(Embedding.document_id == doc.id)
                            )
                            VECTOR_INDEX.invalidate()
```

(Die Imports stattdessen an den Dateianfang ziehen, wenn sie durch Task 9 dort schon vorhanden sind — dann hier nur die zwei Statements.)

- [ ] **Step 4: Auto-Trigger nach Crawl implementieren**

Im CRAWL-Zweig von `worker.py`, direkt nach `store.complete_job(...)`:

```python
                        # Neue/geaenderte Dokumente automatisch embedden
                        if result.processed > 0:
                            from app.jobs import router as jobs_router_mod

                            if jobs_router_mod._queue is not None:
                                embed_job = store.create_job(JobType.EMBED, {})
                                await jobs_router_mod._queue.put(embed_job)
                                logger.info("Auto-queued EMBED job after crawl")
```

- [ ] **Step 5: Alle Job-Tests laufen lassen**

Run: `cd backend && uv run pytest tests/test_embed_job.py tests/test_ingest_parallel.py -v`
Expected: alle PASS (test_ingest_parallel als Regressionsnetz für den CRAWL-Zweig)

- [ ] **Step 6: Commit**

```bash
git add backend/app/jobs/worker.py backend/tests/test_embed_job.py
git commit -m "feat: Auto-EMBED nach Crawl + Embedding-Invalidierung bei Rescan (Task 10)"
```

---

### Task 11: Stats — Embedding-Zähler

**Files:**
- Modify: `backend/app/documents/router.py` (`get_stats`, Zeilen 36–77)
- Test: `backend/tests/test_similar_api.py` (erweitern — hat bereits das API-Client-Fixture)

**Interfaces:**
- Produces: `GET /api/stats` enthält zusätzlich `"embeddings": {"embedded": int, "embeddable": int}` — `embedded` = Embeddings zu nicht-excludeten Dokumenten, `embeddable` = `has_text.yes` (bestehender Wert).

- [ ] **Step 1: Failing Test schreiben (an `test_similar_api.py` anhängen)**

```python
async def test_stats_contains_embedding_counts(client, db_session):
    await _insert(db_session, 1, [1.0, 0.0])
    resp = await client.get("/api/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["embeddings"] == {"embedded": 1, "embeddable": 3}
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `cd backend && uv run pytest tests/test_similar_api.py::test_stats_contains_embedding_counts -v`
Expected: FAIL mit `KeyError: 'embeddings'`

- [ ] **Step 3: Implementieren**

In `get_stats` nach der bestehenden Query:

```python
    emb_row = await db.execute(text(
        "SELECT COUNT(*) FROM embeddings e"
        " JOIN documents d ON d.id = e.document_id WHERE d.excluded = 0"
    ))
    embedded_count = emb_row.scalar() or 0
```

Und im Rückgabe-Dict (nach `"has_text": {...}`):

```python
        "embeddings": {
            "embedded": embedded_count,
            "embeddable": r["has_text_yes"] or 0,
        },
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `cd backend && uv run pytest tests/test_similar_api.py -v`
Expected: alle PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/documents/router.py backend/tests/test_similar_api.py
git commit -m "feat: Embedding-Zaehler in /api/stats (Task 11)"
```

---

### Task 12: Frontend — Suchmodus (types, api, useSearch, Toggle in Navbar)

**Files:**
- Modify: `frontend/src/lib/types.ts` (SearchMode-Typ)
- Modify: `frontend/src/lib/api.ts` (`searchDocuments`, Zeilen 5–37)
- Modify: `frontend/src/hooks/useSearch.ts`
- Create: `frontend/src/components/SearchModeToggle.tsx`
- Modify: `frontend/src/components/layout/AppNavbar.tsx` (Zeilen 46–54)
- Modify: `frontend/src/components/layout/AppShell.tsx` (AppNavbar-Aufruf, Zeilen 77–86)
- Modify: `frontend/src/i18n/translations.ts` (Keys in `de` und ggf. `en`-Objekt)

**Interfaces:**
- Consumes: `GET /api/search?mode=semantic` (Task 7)
- Produces: `type SearchMode = 'fts' | 'semantic'` in types.ts; `searchDocuments(query, filters, offset, limit, sort, includeFacets, mode)`; `useSearch()` liefert zusätzlich `{ mode, setMode }`; `SearchModeToggle`-Komponente. Im semantischen Modus ignoriert das Backend den `sort`-Parameter (Relevanz fix); die UI-Deaktivierung des Sortier-Dropdowns übernimmt Task 13.

- [ ] **Step 1: types.ts erweitern**

```typescript
export type SearchMode = 'fts' | 'semantic';
```

- [ ] **Step 2: api.ts erweitern**

Signatur von `searchDocuments` ändern und `mode` übertragen:

```typescript
export async function searchDocuments(
  query: string,
  filters: SearchFilters = {},
  offset = 0,
  limit = 25,
  sort = 'date_desc',
  includeFacets = true,
  mode: SearchMode = 'fts',
): Promise<SearchResponse> {
```

Nach `if (!includeFacets) params.set('include_facets', 'false');` einfügen:

```typescript
  if (mode !== 'fts') params.set('mode', mode);
```

`SearchMode` in den Type-Import der Datei aufnehmen.

- [ ] **Step 3: useSearch erweitern**

```typescript
  const [mode, setMode] = useState<SearchMode>('fts');
```

- Im Reset-Effekt: `searchDocuments(query, filters, 0, resultsPerPage, sort)` → `searchDocuments(query, filters, 0, resultsPerPage, sort, true, mode)` und `mode` in die Dependency-Liste des `useEffect` aufnehmen.
- In `loadMore`: `searchDocuments(query, filters, nextOffset, resultsPerPage, sort, false, mode)` und `mode` in die `useCallback`-Deps.
- In `refresh`: analog `(query, filters, 0, resultsPerPage, sort, true, mode)` + Deps.
- Return erweitern: `return { query, setQuery, filters, setFilters, sort, setSort, mode, setMode, results, loading, offset, loadMore, refresh };`
- `SearchMode` importieren aus `@/lib/types`.

- [ ] **Step 4: SearchModeToggle-Komponente**

```tsx
// frontend/src/components/SearchModeToggle.tsx
import { Sparkles, Type } from 'lucide-react';
import { useTranslation } from '@/i18n';
import type { SearchMode } from '@/lib/types';

interface Props {
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
}

export function SearchModeToggle({ mode, onModeChange }: Props) {
  const { t } = useTranslation();
  const base = 'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors';
  const active = 'bg-zinc-700 text-zinc-100';
  const inactive = 'text-zinc-400 hover:text-zinc-200';
  return (
    <div className="flex items-center gap-0.5 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 shrink-0">
      <button
        type="button"
        onClick={() => onModeChange('fts')}
        className={`${base} ${mode === 'fts' ? active : inactive}`}
        title={t('search.modeExactHint')}
      >
        <Type className="size-3" />
        {t('search.modeExact')}
      </button>
      <button
        type="button"
        onClick={() => onModeChange('semantic')}
        className={`${base} ${mode === 'semantic' ? active : inactive}`}
        title={t('search.modeSemanticHint')}
      >
        <Sparkles className="size-3" />
        {t('search.modeSemantic')}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: In AppNavbar einbauen**

Props erweitern (`searchMode: SearchMode; onSearchModeChange: (m: SearchMode) => void;` in `AppNavbarProps` + Destrukturierung) und den Suchleisten-Block ersetzen:

```tsx
      {/* Search bar (center, flexible) */}
      <div className="flex-1 max-w-2xl mx-auto flex items-center gap-2">
        <div className="flex-1">
          <SearchBar
            query={query}
            onQueryChange={onQueryChange}
            resultCount={resultCount}
            compact
          />
        </div>
        <SearchModeToggle mode={searchMode} onModeChange={onSearchModeChange} />
      </div>
```

Imports: `import { SearchModeToggle } from '@/components/SearchModeToggle';` und `SearchMode` zu den Type-Imports.

In `AppShell.tsx` beim `<AppNavbar ...>`-Aufruf ergänzen:

```tsx
        searchMode={search.mode}
        onSearchModeChange={search.setMode}
```

- [ ] **Step 6: i18n-Keys ergänzen**

In `translations.ts` im `de`-Objekt (und falls ein `en`-Objekt existiert, dort mit englischen Werten analog):

```typescript
  // Semantic search
  "search.modeExact": "Exakt",
  "search.modeSemantic": "Semantisch",
  "search.modeExactHint": "Volltextsuche (exakte Wörter)",
  "search.modeSemanticHint": "Semantische Suche (nach Bedeutung)",
```

- [ ] **Step 7: Verify**

Run: `cd frontend && npx tsc -b && npm run lint`
Expected: 0 Fehler

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useSearch.ts frontend/src/components/SearchModeToggle.tsx frontend/src/components/layout/AppNavbar.tsx frontend/src/components/layout/AppShell.tsx frontend/src/i18n/translations.ts
git commit -m "feat: Suchmodus-Umschalter Exakt/Semantisch in der Navbar (Task 12)"
```

---

### Task 13: Frontend — Score-Anzeige + Summary-Fallback in der Trefferliste

**Files:**
- Modify: `frontend/src/components/ResultRow.tsx`
- Modify: `frontend/src/components/ResultsList.tsx`
- Modify: `frontend/src/components/DocumentToolbar.tsx`
- Modify: `frontend/src/pages/DocumentsPage.tsx` (Zeile 20: `const { search } = useOutletContext<ShellContext>();`; `<DocumentToolbar ...>` Zeile ~202, `<ResultsList ...>` Zeile ~208)
- Modify: `frontend/src/i18n/translations.ts`

**Interfaces:**
- Consumes: `search.mode` aus dem Shell-Context (Task 12), `doc.rank` (semantischer Score 0..1), `doc.summary`
- Produces: `ResultRow` mit optionalem Prop `semanticScore?: number` (zeigt Prozent-Badge) und Summary-Klartext-Fallback, wenn kein `text_snippet` vorhanden ist und `semanticScore` gesetzt ist; `ResultsList` mit optionalem Prop `searchMode?: SearchMode` (reicht Score nur im semantischen Modus durch, erweitert den Empty-State um einen Embedding-Hinweis); `DocumentToolbar` mit optionalem Prop `sortDisabled?: boolean` (Spec: Sortierung ist im semantischen Modus auf Relevanz fixiert).

- [ ] **Step 1: ResultRow erweitern**

Props:

```typescript
interface ResultRowProps {
  doc: SearchDocument;
  onSelect: (id: number) => void;
  selected?: boolean;
  onToggleSelect?: (id: number) => void;
  onFilterAdd?: FilterAddHandler;
  semanticScore?: number;
}
```

Destrukturierung um `semanticScore` ergänzen. Im Titel-Block nach dem `doc.doc_type`-Badge einfügen:

```tsx
            {semanticScore !== undefined && (
              <Badge className="text-xs border bg-indigo-900/50 text-indigo-300 border-indigo-800">
                {Math.round(semanticScore * 100)} %
              </Badge>
            )}
```

Den `text_snippet`-Block ersetzen (Summary NUR als Klartext — kein `dangerouslySetInnerHTML`, LLM-generierter Text):

```tsx
          {doc.text_snippet ? (
            <p
              className="mt-1 text-xs text-zinc-400 line-clamp-2 [&_mark]:bg-amber-400/30 [&_mark]:text-amber-200 [&_mark]:rounded-sm"
              dangerouslySetInnerHTML={{ __html: doc.text_snippet }}
            />
          ) : semanticScore !== undefined && doc.summary ? (
            <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{doc.summary}</p>
          ) : null}
```

- [ ] **Step 2: ResultsList durchreichen + Empty-State-Hinweis**

Props um `searchMode?: SearchMode` erweitern (`import type { ..., SearchMode } from '@/lib/types';`), Destrukturierung ergänzen. Im `table`-Zweig:

```tsx
        <ResultRow
          key={doc.id}
          doc={doc}
          onSelect={onSelect}
          selected={selectedIds?.has(doc.id)}
          onToggleSelect={onToggleSelect}
          onFilterAdd={onFilterAdd}
          semanticScore={searchMode === 'semantic' ? doc.rank : undefined}
        />
```

(Grid-/Large-Card bleiben unverändert — Score-Anzeige nur in der Tabellenansicht, YAGNI.)

Den Empty-State-Block (`if (!documents || documents.length === 0)`) erweitern — Spec-Fehlerfall „0 Dokumente embedded":

```tsx
  if (!documents || documents.length === 0) {
    return (
      <div className="py-12 text-center text-zinc-500 text-sm">
        {t('results.noResults')}
        {searchMode === 'semantic' && (
          <p className="mt-2 text-xs text-zinc-600">{t('results.noResultsSemanticHint')}</p>
        )}
      </div>
    );
  }
```

- [ ] **Step 3: Sortierung im semantischen Modus deaktivieren (DocumentToolbar)**

`DocumentToolbarProps` um `sortDisabled?: boolean` erweitern, Destrukturierung ergänzen, und den `SortControls`-Aufruf wrappen:

```tsx
        <div className={sortDisabled ? 'opacity-50 pointer-events-none' : ''}>
          <SortControls value={sort} onSortChange={onSortChange} />
        </div>
```

- [ ] **Step 4: DocumentsPage durchreichen**

In `DocumentsPage.tsx` (Context ist dort `const { search } = useOutletContext<ShellContext>();`, Zeile 20):

- `<DocumentToolbar ...>`-Aufruf (Zeile ~202) um `sortDisabled={search.mode === 'semantic'}` ergänzen
- `<ResultsList ...>`-Aufruf (Zeile ~208) um `searchMode={search.mode}` ergänzen

- [ ] **Step 5: i18n-Key ergänzen**

Im `de`-Objekt von `translations.ts`:

```typescript
  "results.noResultsSemanticHint": "Semantischer Modus: Falls noch keine Embeddings erzeugt wurden, im Dashboard „Embeddings erzeugen" starten.",
```

(Analog `en`, falls vorhanden: "Semantic mode: if no embeddings have been generated yet, run 'Generate embeddings' from the dashboard.")

- [ ] **Step 6: Verify**

Run: `cd frontend && npx tsc -b && npm run lint`
Expected: 0 Fehler

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ResultRow.tsx frontend/src/components/ResultsList.tsx frontend/src/components/DocumentToolbar.tsx frontend/src/pages/DocumentsPage.tsx frontend/src/i18n/translations.ts
git commit -m "feat: Score-Badge, Summary-Fallback + fixierte Sortierung im semantischen Modus (Task 13)"
```

---

### Task 14: Frontend — „Ähnliche Dokumente"-Tab in der Detailansicht

**Files:**
- Modify: `frontend/src/lib/api.ts` (neue Funktion), `frontend/src/lib/types.ts` (neuer Typ)
- Create: `frontend/src/components/detail/SimilarTab.tsx`
- Modify: `frontend/src/components/detail/DocumentDetailPage.tsx` (TabId Zeile 17, tabs-Array Zeilen 93–98, Tab-Rendering im JSX ab Zeile 100)
- Modify: `frontend/src/i18n/translations.ts`

**Interfaces:**
- Consumes: `GET /api/documents/{id}/similar` (Task 8)
- Produces: `getSimilarDocuments(docId: number): Promise<SimilarResponse>` mit `interface SimilarDocument { id, title, authors, year, doc_type, file_path, file_type, summary, rank }` und `interface SimilarResponse { embedded: boolean; similar: SimilarDocument[] }`; neuer Tab „Ähnliche" auf der Detailseite (Top 10, Klick navigiert).

- [ ] **Step 1: Typ + API-Funktion**

In `types.ts`:

```typescript
export interface SimilarDocument {
  id: number;
  title: string | null;
  authors: string | null;
  year: number | null;
  doc_type: string | null;
  file_path: string;
  file_type: string;
  summary: string | null;
  rank: number;
}

export interface SimilarResponse {
  embedded: boolean;
  similar: SimilarDocument[];
}
```

In `api.ts` (Typ-Import ergänzen):

```typescript
export async function getSimilarDocuments(docId: number): Promise<SimilarResponse> {
  const res = await fetch(`${BASE}/documents/${docId}/similar`);
  if (!res.ok) throw new Error(`Similar fetch failed: ${res.status}`);
  return res.json() as Promise<SimilarResponse>;
}
```

- [ ] **Step 2: SimilarTab-Komponente**

```tsx
// frontend/src/components/detail/SimilarTab.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Sparkles } from 'lucide-react';
import { getSimilarDocuments } from '@/lib/api';
import type { SimilarResponse } from '@/lib/types';
import { useTranslation } from '@/i18n';

interface Props {
  docId: number;
}

export function SimilarTab({ docId }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState<SimilarResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    getSimilarDocuments(docId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [docId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-zinc-400 text-sm">
        <Loader2 className="size-4 animate-spin" />
        {t('detail.similarLoading')}
      </div>
    );
  }

  if (!data || !data.embedded) {
    return (
      <div className="p-6 text-sm text-zinc-500">
        <Sparkles className="size-4 inline mr-1.5" />
        {t('detail.similarNotEmbedded')}
      </div>
    );
  }

  if (data.similar.length === 0) {
    return <div className="p-6 text-sm text-zinc-500">{t('detail.similarNone')}</div>;
  }

  return (
    <div className="flex flex-col">
      {data.similar.map((doc) => (
        <button
          key={doc.id}
          type="button"
          onClick={() => navigate(`/documents/${doc.id}`)}
          className="text-left border-b border-zinc-800 p-4 hover:bg-zinc-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-100 text-sm leading-snug">
              {doc.title || doc.file_path.replace(/\\/g, '/').split('/').pop()}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded border bg-indigo-900/50 text-indigo-300 border-indigo-800 shrink-0">
              {Math.round(doc.rank * 100)} %
            </span>
          </div>
          {(doc.authors || doc.year) && (
            <p className="mt-0.5 text-xs text-zinc-400">
              {doc.authors}
              {doc.authors && doc.year ? ' · ' : ''}
              {doc.year}
            </p>
          )}
          {doc.summary && (
            <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{doc.summary}</p>
          )}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: In DocumentDetailPage einbauen**

- `type TabId = 'details' | 'content' | 'metadata' | 'notes' | 'similar';` (Zeile 17)
- Import: `import { SimilarTab } from './SimilarTab';`
- tabs-Array (Zeilen 93–98) ergänzen: `{ id: 'similar', label: t('detail.tabSimilar') },`
- Im Tab-Content-Block (Zeilen ~258–271) nach dem `notes`-Zweig einfügen:

```tsx
                {activeTab === 'notes' && (
                  <NotesTab />
                )}
                {activeTab === 'similar' && (
                  <SimilarTab docId={docId} />
                )}
```

- [ ] **Step 4: i18n-Keys**

```typescript
  "detail.tabSimilar": "Ähnliche",
  "detail.similarLoading": "Suche ähnliche Dokumente…",
  "detail.similarNotEmbedded": "Für dieses Dokument existiert noch kein Embedding. Embedding-Job über das Dashboard starten.",
  "detail.similarNone": "Keine ähnlichen Dokumente gefunden.",
```

(Analog im `en`-Objekt, falls vorhanden: "Similar", "Finding similar documents…", "No embedding exists for this document yet. Start the embedding job from the dashboard.", "No similar documents found.")

- [ ] **Step 5: Verify**

Run: `cd frontend && npx tsc -b && npm run lint`
Expected: 0 Fehler

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/types.ts frontend/src/components/detail/SimilarTab.tsx frontend/src/components/detail/DocumentDetailPage.tsx frontend/src/i18n/translations.ts
git commit -m "feat: Tab 'Aehnliche Dokumente' in der Detailansicht (Task 14)"
```

---

### Task 15: Frontend — Stats-Anzeige + Embed-Button; Gesamt-Verifikation

**Files:**
- Modify: `frontend/src/lib/api.ts` (`embedBatch`), `frontend/src/lib/types.ts` (`DashboardStats` um `embeddings` erweitern)
- Modify: `frontend/src/components/StatsPanel.tsx` (Buttons ab Zeile ~237)
- Modify: `frontend/src/components/dashboard/StatsWidget.tsx` (Buttons ab Zeile ~263)
- Modify: `frontend/src/i18n/translations.ts`

**Interfaces:**
- Consumes: `POST /api/documents/embed-batch` (Task 9), `stats.embeddings` (Task 11)
- Produces: `embedBatch(): Promise<{ job_id: string }>`; Anzeige „X von Y embedded" + Aktions-Button in StatsPanel und StatsWidget (exakt dem `classifyBatch`-Muster der jeweiligen Datei folgen: gleiche `runAction`-Helper, gleiche Button-Klassen).

- [ ] **Step 1: API + Typ**

In `api.ts` (nach `classifyBatch`):

```typescript
export async function embedBatch(): Promise<{ job_id: string }> {
  const res = await fetch(`${BASE}/documents/embed-batch`, { method: 'POST' });
  if (!res.ok) throw new Error(`Embed batch failed: ${res.status}`);
  return res.json() as Promise<{ job_id: string }>;
}
```

In `types.ts` das `DashboardStats`-Interface um das Feld erweitern:

```typescript
  embeddings: { embedded: number; embeddable: number };
```

- [ ] **Step 2: StatsPanel + StatsWidget erweitern**

Beide Dateien sind strukturell parallel (bekannte, bewusste Duplikation — NICHT in diesem Paket entdoppeln) und nutzen dieselben lokalen Helfer `StatCard` und `ActionButton`. In BEIDEN Dateien:

1. `embedBatch` in den bestehenden api-Import aufnehmen; `Database` in den lucide-react-Import.
2. Im StatCard-Grid (StatsPanel Zeilen 184–223, StatsWidget analog) als weitere Karte ergänzen:

```tsx
            <StatCard
              label={t('stats.embedded')}
              count={stats.embeddings.embedded}
              total={stats.embeddings.embeddable}
              icon={<Database size={13} />}
            />
```

3. Im Action-Button-Block (StatsPanel Zeilen 231–256 nach dem classify-`ActionButton`, StatsWidget Zeilen 257–282 analog):

```tsx
        <ActionButton
          label={t('stats.embedBatch')}
          icon={<Database size={11} />}
          feedbackText={feedback['embed'] ?? null}
          errorText={t('jobs.error')}
          onClick={() => runAction('embed', embedBatch)}
          accent="emerald"
        />
```

- [ ] **Step 3: i18n-Keys**

```typescript
  "stats.embedded": "Embeddings",
  "stats.embedBatch": "Embeddings erzeugen",
```

(Analog `en`: "Embeddings", "Generate embeddings".)

- [ ] **Step 4: Frontend-Verify**

Run: `cd frontend && npx tsc -b && npm run lint`
Expected: 0 Fehler

- [ ] **Step 5: Backend-Gesamtlauf**

Run: `cd backend && uv run pytest -v`
Expected: alle Tests PASS (alte + neue; keine Regression)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/types.ts frontend/src/components/StatsPanel.tsx frontend/src/components/dashboard/StatsWidget.tsx frontend/src/i18n/translations.ts
git commit -m "feat: Embedding-Statistik + Embed-Batch-Button im Dashboard (Task 15)"
```

---

## Manueller Smoke-Test (nach Abschluss, mit dem User)

Nicht Teil der automatisierten Tasks — erfordert die echte App + einmaligen Modell-Download (~550 MB):

1. Backend starten, im Dashboard „Embeddings erzeugen" klicken → Job läuft mit Fortschritt (Erstlauf: Modell-Download + 30–90 min CPU-Indexierung für ~4.000 Dokumente).
2. Navbar auf „Semantisch" umschalten, thematische Query eingeben (z. B. „Geräuschverhalten von Getrieben") → Treffer mit Prozent-Badges, Facetten/Filter funktionieren.
3. Dokument öffnen → Tab „Ähnliche" zeigt Top 10 mit Scores.
4. `config.json` prüfen: `embedding_max_chars` optional erhöhen und Re-Embedding-Verhalten beobachten (kein Re-Embed nötig — Wert wirkt nur auf neue Embeddings; Modellwechsel dagegen triggert Re-Embed).
