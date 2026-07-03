"""TDD test for IngestService.apply_classification_result (Task 21).

RED state: method does not exist yet → AttributeError.
GREEN state: method is implemented and persists fields + tags + categories.

Review-fix additions (Task 21 review):
  - test_worker_classify_batch_orchestration: parallel batch logic + concurrency
  - test_worker_classify_batch_apply_failure_resilience: per-doc rollback robustness
  - test_apply_classification_result_persists_categories: Category/DocumentCategory rows
"""

import asyncio
import json
import pytest
from sqlalchemy import select

from app.classification.schemas import ClassificationResult
from app.classification.service import ClassificationService
from app.config import Settings
from app.documents.models import Category, Document, DocumentCategory, DocumentTag, Tag
from app.ingest.service import IngestService
from app.jobs import worker as _worker_mod
from app.jobs.models import JobStatus, JobStore, JobType


# ---------------------------------------------------------------------------
# Helpers shared by orchestration tests
# ---------------------------------------------------------------------------

class _FakeOllama:
    """No-op OllamaClient — prevents any HTTP during worker tests."""
    def __init__(self, *a, **kw):
        pass
    async def close(self):
        pass


class _SessionCM:
    """Wraps an existing AsyncSession as an async context manager without closing it."""
    def __init__(self, session):
        self._s = session
    async def __aenter__(self):
        return self._s
    async def __aexit__(self, *a):
        pass  # lifecycle managed by the db_session fixture


@pytest.mark.asyncio
async def test_apply_classification_result_persists_fields(db_session):
    """apply_classification_result writes document fields to the Document row (no HTTP)."""
    result = await db_session.execute(
        select(Document).where(Document.file_path == "a/kegelrad.pdf")
    )
    doc = result.scalar_one()

    classification = ClassificationResult(
        title="Kegelrad Tragfähigkeit Studie",
        authors=["Max Mustermann"],
        year=2020,
        doc_type="paper",
        source="Journal of Gears",
        summary="Eine Studie über Kegelrad-Tragfähigkeit.",
        tags=["kegelrad", "tragfähigkeit"],
        categories=[],
        confidence=0.9,
    )

    settings = Settings()
    svc = IngestService(db_session, settings, ollama=None)
    # RED: this method does not exist until the refactor is applied.
    await svc.apply_classification_result(doc, classification, "auto")

    assert doc.title == "Kegelrad Tragfähigkeit Studie"
    assert doc.year == 2020
    assert doc.doc_type == "paper"
    assert doc.source == "Journal of Gears"
    assert doc.summary == "Eine Studie über Kegelrad-Tragfähigkeit."
    assert doc.classification_confidence == 0.9
    assert doc.classification_source == "ai"
    assert json.loads(doc.authors) == ["Max Mustermann"]


@pytest.mark.asyncio
async def test_apply_classification_result_creates_tags(db_session):
    """apply_classification_result creates Tag rows and DocumentTag links."""
    result = await db_session.execute(
        select(Document).where(Document.file_path == "a/stirnrad.pdf")
    )
    doc = result.scalar_one()

    classification = ClassificationResult(
        title="Stirnrad NVH",
        authors=[],
        year=2021,
        doc_type="paper",
        source=None,
        summary="NVH.",
        tags=["stirnrad", "nvh", "getriebe"],
        categories=[],
        confidence=0.88,
    )

    settings = Settings()
    svc = IngestService(db_session, settings, ollama=None)
    await svc.apply_classification_result(doc, classification, "auto")
    await db_session.flush()

    tag_result = await db_session.execute(
        select(DocumentTag).where(DocumentTag.document_id == doc.id)
    )
    doc_tags = tag_result.scalars().all()
    assert len(doc_tags) == 3

    # Verify the Tag rows exist
    for tag_name in ["stirnrad", "nvh", "getriebe"]:
        t_result = await db_session.execute(select(Tag).where(Tag.name == tag_name))
        assert t_result.scalar_one_or_none() is not None, f"Tag '{tag_name}' not found"


@pytest.mark.asyncio
async def test_apply_classification_result_idempotent_tags(db_session):
    """Calling apply_classification_result twice does not duplicate DocumentTag rows."""
    result = await db_session.execute(
        select(Document).where(Document.file_path == "b/norm.pdf")
    )
    doc = result.scalar_one()

    classification = ClassificationResult(
        title="ISO 10300 Rev",
        authors=[],
        year=2014,
        doc_type="norm",
        source=None,
        summary="Norm.",
        tags=["iso", "norm"],
        categories=[],
        confidence=0.91,
    )

    settings = Settings()
    svc = IngestService(db_session, settings, ollama=None)
    await svc.apply_classification_result(doc, classification, "auto")
    await db_session.flush()
    # Call again — must not create duplicate links
    await svc.apply_classification_result(doc, classification, "auto")
    await db_session.flush()

    tag_result = await db_session.execute(
        select(DocumentTag).where(DocumentTag.document_id == doc.id)
    )
    doc_tags = tag_result.scalars().all()
    assert len(doc_tags) == 2, "Duplicate DocumentTag rows must not be created"


# ---------------------------------------------------------------------------
# Review-fix tests (Task 21 review)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_worker_classify_batch_orchestration(db_session, monkeypatch):
    """process_job(CLASSIFY batch) classifies all 3 eligible docs; max concurrency >= 2."""
    concurrent = [0]
    max_concurrent = [0]

    async def fake_classify_document(self, text, filename=""):
        concurrent[0] += 1
        if concurrent[0] > max_concurrent[0]:
            max_concurrent[0] = concurrent[0]
        await asyncio.sleep(0.02)  # yield so sibling tasks can start
        concurrent[0] -= 1
        return ClassificationResult(
            title="Auto Title",
            authors=[],
            year=2020,
            doc_type="paper",
            source=None,
            summary="Auto summary.",
            tags=[],
            categories=[],
            confidence=0.92,
        ), "auto"

    monkeypatch.setattr(ClassificationService, "classify_document", fake_classify_document)
    monkeypatch.setattr(_worker_mod, "OllamaClient", _FakeOllama)
    monkeypatch.setattr(_worker_mod, "async_session_factory", lambda: _SessionCM(db_session))

    store = JobStore()
    job = store.create_job(JobType.CLASSIFY, {})
    settings = Settings(classify_parallelism=2)

    await _worker_mod.process_job(job, store, settings, asyncio.Lock())

    assert job.status == JobStatus.DONE
    assert job.result["classified"] == 3  # 3 eligible docs in fixture
    assert max_concurrent[0] >= 2, f"Expected concurrency >= 2, got {max_concurrent[0]}"


@pytest.mark.asyncio
async def test_worker_classify_batch_apply_failure_resilience(db_session, monkeypatch):
    """If apply fails for one doc, the batch completes DONE with classified == total - 1."""
    # Identify the doc ids that the worker will query (same filters as worker.py)
    q = await db_session.execute(
        select(Document).where(
            Document.processing_status == "done",
            Document.classification_source.is_(None),
            Document.has_text.is_(True),
            Document.excluded == False,
        )
    )
    eligible = q.scalars().all()
    fail_id = eligible[0].id
    total = len(eligible)  # 3

    async def fake_classify_document(self, text, filename=""):
        return ClassificationResult(
            title="T", authors=[], year=None, doc_type="paper",
            source=None, summary="S.", tags=[], categories=[], confidence=0.9,
        ), "auto"

    monkeypatch.setattr(ClassificationService, "classify_document", fake_classify_document)

    original_apply = IngestService.apply_classification_result

    async def patched_apply(self, doc, result, tier):
        if doc.id == fail_id:
            raise RuntimeError("Simulated apply failure")
        return await original_apply(self, doc, result, tier)

    monkeypatch.setattr(IngestService, "apply_classification_result", patched_apply)
    monkeypatch.setattr(_worker_mod, "OllamaClient", _FakeOllama)
    monkeypatch.setattr(_worker_mod, "async_session_factory", lambda: _SessionCM(db_session))

    store = JobStore()
    job = store.create_job(JobType.CLASSIFY, {})
    settings = Settings(classify_parallelism=2)

    await _worker_mod.process_job(job, store, settings, asyncio.Lock())

    assert job.status == JobStatus.DONE, f"Job should be DONE, got {job.status} / {job.error}"
    assert job.result["classified"] == total - 1


@pytest.mark.asyncio
async def test_apply_classification_result_persists_categories(db_session):
    """apply_classification_result creates a Category row and DocumentCategory link."""
    q = await db_session.execute(
        select(Document).where(Document.file_path == "a/kegelrad.pdf")
    )
    doc = q.scalar_one()

    classification = ClassificationResult(
        title="Kegelrad Grundlagen",
        authors=[],
        year=2020,
        doc_type="paper",
        source=None,
        summary="Eine Grundlagenstudie.",
        tags=[],
        categories=["Verzahnungsgrundlagen"],
        confidence=0.9,
    )

    svc = IngestService(db_session, Settings(), ollama=None)
    await svc.apply_classification_result(doc, classification, "auto")
    await db_session.flush()

    cat_result = await db_session.execute(
        select(Category).where(Category.name == "Verzahnungsgrundlagen")
    )
    cat = cat_result.scalar_one_or_none()
    assert cat is not None, "Category 'Verzahnungsgrundlagen' must be created"

    link_result = await db_session.execute(
        select(DocumentCategory).where(
            DocumentCategory.document_id == doc.id,
            DocumentCategory.category_id == cat.id,
        )
    )
    assert link_result.scalar_one_or_none() is not None, "DocumentCategory link must exist"
