"""
Core document CRUD and listing endpoints.

Other document-related endpoints live in:
- files_router.py  — thumbnail, file download, open-folder, open
- actions_router.py — classify, rescan, exclude/restore, favorites, tags
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.documents.models import Document
from app.jobs.models import JobType
from app.jobs import router as jobs_router_mod
from app.search.facet_cache import FACET_CACHE

router = APIRouter(prefix="/api", tags=["documents"])


class CrawlRequest(BaseModel):
    folder: str


class DocumentUpdate(BaseModel):
    title: str | None = None
    authors: str | None = None
    year: int | None = None
    doc_type: str | None = None
    source: str | None = None
    language: str | None = None
    summary: str | None = None


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)) -> dict:
    """Return aggregate counts for the dashboard overview."""
    rows = await db.execute(text("""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN processing_status = 'done' THEN 1 ELSE 0 END) AS done,
            SUM(CASE WHEN processing_status = 'error' THEN 1 ELSE 0 END) AS error,
            SUM(CASE WHEN processing_status = 'processing' THEN 1 ELSE 0 END) AS processing,
            SUM(CASE WHEN classification_source = 'ai' THEN 1 ELSE 0 END) AS cls_ai,
            SUM(CASE WHEN classification_source = 'filename' THEN 1 ELSE 0 END) AS cls_filename,
            SUM(CASE WHEN classification_source = 'user' THEN 1 ELSE 0 END) AS cls_user,
            SUM(CASE WHEN classification_source IS NULL THEN 1 ELSE 0 END) AS cls_none,
            SUM(CASE WHEN has_text = 1 THEN 1 ELSE 0 END) AS has_text_yes,
            SUM(CASE WHEN has_text = 0 THEN 1 ELSE 0 END) AS has_text_no,
            SUM(CASE WHEN processing_status = 'done' AND has_text = 1 AND (classification_source IS NULL OR classification_source != 'ai') THEN 1 ELSE 0 END) AS needs_ai,
            SUM(CASE WHEN processing_status = 'done' AND has_text = 0 AND (classification_source = 'filename' OR classification_source IS NULL) THEN 1 ELSE 0 END) AS needs_ocr
        FROM documents
        WHERE excluded = 0
    """))
    r = rows.mappings().one()
    from app.config import get_settings

    emb_row = await db.execute(text(
        "SELECT COUNT(*) FROM embeddings e"
        " JOIN documents d ON d.id = e.document_id"
        " WHERE d.excluded = 0 AND e.model = :model"
    ), {"model": get_settings().embedding_model})
    embedded_count = emb_row.scalar() or 0
    return {
        "total": r["total"] or 0,
        "by_status": {
            "done": r["done"] or 0,
            "error": r["error"] or 0,
            "processing": r["processing"] or 0,
        },
        "by_classification": {
            "ai": r["cls_ai"] or 0,
            "filename": r["cls_filename"] or 0,
            "user": r["cls_user"] or 0,
            "none": r["cls_none"] or 0,
        },
        "has_text": {
            "yes": r["has_text_yes"] or 0,
            "no": r["has_text_no"] or 0,
        },
        "embeddings": {
            "embedded": embedded_count,
            "embeddable": r["has_text_yes"] or 0,
        },
        "needs_ai": r["needs_ai"] or 0,
        "needs_ocr": r["needs_ocr"] or 0,
        "errors": r["error"] or 0,
    }


@router.post("/crawl")
async def crawl(request: CrawlRequest) -> dict:
    """Submit a crawl job (async). Use GET /api/jobs/{job_id} to check status."""
    from pathlib import Path
    if not Path(request.folder).is_dir():
        raise HTTPException(status_code=400, detail=f"Folder not found: {request.folder}")
    if jobs_router_mod._store is None or jobs_router_mod._queue is None:
        raise HTTPException(status_code=503, detail="Job system not initialized")
    job = jobs_router_mod._store.create_job(JobType.CRAWL, {"folder": request.folder})
    await jobs_router_mod._queue.put(job)
    return {"job_id": job.id, "status": job.status.value}


@router.get("/documents")
async def list_documents(
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    if limit > 200:
        limit = 200
    result = await db.execute(
        select(Document).where(Document.excluded == False).order_by(Document.created_at.desc()).offset(offset).limit(limit)
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


@router.get("/documents/duplicates")
async def get_duplicates(
    hash: str,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(
        select(Document).where(Document.file_hash == hash)
    )
    docs = result.scalars().all()
    return [
        {
            "id": doc.id,
            "file_path": doc.file_path,
            "file_hash": doc.file_hash,
            "title": doc.title,
            "created_at": doc.created_at,
        }
        for doc in docs
    ]


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


@router.get("/documents/{doc_id}")
async def get_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return {
        "id": doc.id,
        "file_path": doc.file_path,
        "file_hash": doc.file_hash,
        "file_type": doc.file_type,
        "file_size": doc.file_size,
        "mtime": doc.mtime,
        "title": doc.title,
        "authors": doc.authors,
        "year": doc.year,
        "doc_type": doc.doc_type,
        "source": doc.source,
        "language": doc.language,
        "summary": doc.summary,
        "page_count": doc.page_count,
        "has_text": doc.has_text,
        "doi": doc.doi,
        "processing_status": doc.processing_status,
        "classification_confidence": doc.classification_confidence,
        "classification_source": doc.classification_source,
        "created_at": doc.created_at,
        "updated_at": doc.updated_at,
        "indexed_at": doc.indexed_at,
        "excluded": doc.excluded,
    }


@router.patch("/documents/{doc_id}")
async def update_document(
    doc_id: int,
    body: DocumentUpdate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    updates = body.model_dump(exclude_none=True)
    for field, value in updates.items():
        setattr(doc, field, value)
    doc.classification_source = "user"
    await db.commit()
    FACET_CACHE.invalidate()
    await db.refresh(doc)
    return {
        "id": doc.id,
        "file_path": doc.file_path,
        "file_hash": doc.file_hash,
        "file_type": doc.file_type,
        "file_size": doc.file_size,
        "mtime": doc.mtime,
        "title": doc.title,
        "authors": doc.authors,
        "year": doc.year,
        "doc_type": doc.doc_type,
        "source": doc.source,
        "language": doc.language,
        "summary": doc.summary,
        "page_count": doc.page_count,
        "has_text": doc.has_text,
        "doi": doc.doi,
        "processing_status": doc.processing_status,
        "classification_confidence": doc.classification_confidence,
        "classification_source": doc.classification_source,
        "created_at": doc.created_at,
        "updated_at": doc.updated_at,
        "indexed_at": doc.indexed_at,
        "excluded": doc.excluded,
    }
