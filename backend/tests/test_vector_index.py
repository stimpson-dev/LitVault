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
