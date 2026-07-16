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


async def test_stats_contains_embedding_counts(client, db_session):
    await _insert(db_session, 1, [1.0, 0.0])
    resp = await client.get("/api/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["embeddings"] == {"embedded": 1, "embeddable": 3}
