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
