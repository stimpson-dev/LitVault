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
