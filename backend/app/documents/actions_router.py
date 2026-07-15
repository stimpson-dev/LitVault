"""
Document action endpoints.

Handles classify, rescan, exclude/restore, favorites, and tag management.
All mutating endpoints invalidate the facet cache to keep browse filters fresh.

NOTE: Static paths (e.g. /documents/classify-batch) are declared BEFORE parametric
paths (e.g. /documents/{doc_id}/classify) to prevent FastAPI route shadowing.
"""
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.documents.models import Document, Tag, DocumentTag, Favorite
from app.documents.service import get_document_or_404
from app.jobs import router as jobs_router_mod
from app.jobs.models import JobType
from app.search.facet_cache import FACET_CACHE

router = APIRouter(prefix="/api", tags=["document-actions"])


class BatchIdsRequest(BaseModel):
    ids: list[int]


class TagAddRequest(BaseModel):
    name: str


# ---------------------------------------------------------------------------
# Static-path batch/list endpoints (must come before /{doc_id} variants)
# ---------------------------------------------------------------------------

@router.post("/documents/classify-batch")
async def classify_batch(db: AsyncSession = Depends(get_db)) -> dict:
    """Queue AI classification for all unclassified documents with text."""
    queue = jobs_router_mod._queue
    store = jobs_router_mod._store
    if queue is None or store is None:
        raise HTTPException(status_code=503, detail="Job system not initialized")

    # Queue a single CLASSIFY job without document_id — the worker handles batch mode
    job = store.create_job(JobType.CLASSIFY, {})
    await queue.put(job)
    return {"job_id": job.id, "status": "queued"}


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


@router.post("/documents/rescan-errors")
async def rescan_all_errors(
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Re-scan all documents with error status."""
    queue = jobs_router_mod._queue
    store = jobs_router_mod._store
    if queue is None or store is None:
        raise HTTPException(status_code=503, detail="Job system not initialized")

    result = await db.execute(
        select(Document).where(
            Document.processing_status == "error",
            Document.excluded == False,
        )
    )
    docs = result.scalars().all()

    # Filter to reachable files only
    reachable = [d for d in docs if Path(d.file_path).exists()]
    skipped = len(docs) - len(reachable)

    for doc in reachable:
        doc.processing_status = "pending"
        doc.full_text = None
        doc.has_text = False
    await db.commit()
    FACET_CACHE.invalidate()

    queued = 0
    for doc in reachable:
        job = store.create_job(
            JobType.RESCAN,
            {"document_id": doc.id, "file_path": doc.file_path, "file_type": doc.file_type},
        )
        await queue.put(job)
        queued += 1

    return {"queued": queued, "skipped_unreachable": skipped}


@router.post("/documents/rescan-no-text")
async def rescan_no_text(
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Re-queue RESCAN jobs for all done documents without extracted text."""
    queue = jobs_router_mod._queue
    store = jobs_router_mod._store
    if queue is None or store is None:
        raise HTTPException(status_code=503, detail="Job system not initialized")

    result = await db.execute(
        select(Document).where(
            Document.processing_status == "done",
            Document.has_text == False,
            Document.excluded == False,
        )
    )
    docs = result.scalars().all()

    reachable = [d for d in docs if Path(d.file_path).exists()]
    skipped = len(docs) - len(reachable)

    for doc in reachable:
        doc.processing_status = "pending"
        doc.full_text = None
    await db.commit()
    FACET_CACHE.invalidate()

    queued = 0
    for doc in reachable:
        job = store.create_job(
            JobType.RESCAN,
            {"document_id": doc.id, "file_path": doc.file_path, "file_type": doc.file_type},
        )
        await queue.put(job)
        queued += 1

    return {"queued": queued, "skipped_unreachable": skipped}


@router.post("/documents/exclude-batch")
async def exclude_batch(
    body: BatchIdsRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Soft-delete multiple documents at once."""
    if not body.ids:
        return {"excluded": 0}
    result = await db.execute(
        select(Document).where(Document.id.in_(body.ids))
    )
    docs = result.scalars().all()
    for doc in docs:
        doc.excluded = True
    await db.commit()
    FACET_CACHE.invalidate()
    return {"excluded": len(docs)}


# ---------------------------------------------------------------------------
# Parametric per-document endpoints
# ---------------------------------------------------------------------------

@router.post("/documents/{doc_id}/classify")
async def classify_document(doc_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    """Queue AI classification for a single document."""
    doc = await get_document_or_404(db, doc_id)
    if not doc.full_text:
        raise HTTPException(status_code=400, detail="Document has no text to classify")

    queue = jobs_router_mod._queue
    store = jobs_router_mod._store
    if queue is None or store is None:
        raise HTTPException(status_code=503, detail="Job system not initialized")

    job = store.create_job(JobType.CLASSIFY, {"document_id": doc_id})
    await queue.put(job)
    return {"job_id": job.id, "status": "queued"}


@router.post("/documents/{doc_id}/rescan")
async def rescan_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Re-scan a single document (re-parse the file)."""
    doc = await get_document_or_404(db, doc_id)

    # Pre-flight: check file is reachable
    if not Path(doc.file_path).exists():
        raise HTTPException(status_code=400, detail="Datei nicht erreichbar (Laufwerk/Pfad nicht verfügbar)")

    queue = jobs_router_mod._queue
    store = jobs_router_mod._store
    if queue is None or store is None:
        raise HTTPException(status_code=503, detail="Job system not initialized")

    doc.processing_status = "pending"
    doc.full_text = None
    doc.has_text = False
    await db.commit()
    FACET_CACHE.invalidate()

    job = store.create_job(
        JobType.RESCAN,
        {"document_id": doc_id, "file_path": doc.file_path, "file_type": doc.file_type},
    )
    await queue.put(job)
    return {"job_id": job.id, "status": "queued"}


@router.delete("/documents/{doc_id}")
async def exclude_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Soft-delete: mark document as excluded so it won't reappear on next crawl."""
    doc = await get_document_or_404(db, doc_id)
    doc.excluded = True
    await db.commit()
    FACET_CACHE.invalidate()
    return {"excluded": True, "id": doc_id}


@router.post("/documents/{doc_id}/restore")
async def restore_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Undo exclusion: make document visible again."""
    doc = await get_document_or_404(db, doc_id)
    doc.excluded = False
    await db.commit()
    FACET_CACHE.invalidate()
    return {"excluded": False, "id": doc_id}


@router.post("/documents/{doc_id}/favorite")
async def toggle_favorite(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(select(Favorite).where(Favorite.document_id == doc_id))
    existing = result.scalar_one_or_none()
    if existing is not None:
        await db.execute(delete(Favorite).where(Favorite.document_id == doc_id))
        await db.commit()
        FACET_CACHE.invalidate()
        return {"favorited": False}
    db.add(Favorite(document_id=doc_id))
    await db.commit()
    FACET_CACHE.invalidate()
    return {"favorited": True}


@router.get("/favorites")
async def list_favorites(
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(
        select(Document)
        .join(Favorite, Favorite.document_id == Document.id)
        .where(Document.excluded == False)
        .order_by(Favorite.added_at.desc())
    )
    docs = result.scalars().all()
    return [
        {
            "id": doc.id,
            "title": doc.title,
            "authors": doc.authors,
            "year": doc.year,
            "doc_type": doc.doc_type,
            "file_path": doc.file_path,
            "file_type": doc.file_type,
            "file_size": doc.file_size,
            "processing_status": doc.processing_status,
            "has_text": doc.has_text,
            "created_at": doc.created_at,
        }
        for doc in docs
    ]


@router.get("/documents/{doc_id}/tags")
async def get_document_tags(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(
        select(Tag, DocumentTag.source)
        .join(DocumentTag, DocumentTag.tag_id == Tag.id)
        .where(DocumentTag.document_id == doc_id)
    )
    rows = result.all()
    return [{"id": tag.id, "name": tag.name, "source": source} for tag, source in rows]


@router.post("/documents/{doc_id}/tags")
async def add_document_tag(
    doc_id: int,
    body: TagAddRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(select(Tag).where(Tag.name == body.name))
    tag = result.scalar_one_or_none()
    if tag is None:
        tag = Tag(name=body.name)
        db.add(tag)
        await db.flush()
    existing = await db.execute(
        select(DocumentTag).where(
            DocumentTag.document_id == doc_id,
            DocumentTag.tag_id == tag.id,
        )
    )
    if existing.scalar_one_or_none() is None:
        db.add(DocumentTag(document_id=doc_id, tag_id=tag.id, source="user"))
    await db.commit()
    FACET_CACHE.invalidate()
    return {"id": tag.id, "name": tag.name}


@router.delete("/documents/{doc_id}/tags/{tag_id}")
async def remove_document_tag(
    doc_id: int,
    tag_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    await db.execute(
        delete(DocumentTag).where(
            DocumentTag.document_id == doc_id,
            DocumentTag.tag_id == tag_id,
        )
    )
    await db.commit()
    FACET_CACHE.invalidate()
    return {"deleted": True}
