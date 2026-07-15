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
