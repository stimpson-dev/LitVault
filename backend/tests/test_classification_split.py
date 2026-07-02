"""TDD test for IngestService.apply_classification_result (Task 21).

RED state: method does not exist yet → AttributeError.
GREEN state: method is implemented and persists fields + tags + categories.
"""

import json
import pytest
from sqlalchemy import select

from app.classification.schemas import ClassificationResult
from app.config import Settings
from app.documents.models import Document, DocumentTag, Tag
from app.ingest.service import IngestService


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
