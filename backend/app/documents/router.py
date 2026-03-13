import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select, delete, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.documents.models import Document, Tag, DocumentTag, Favorite
from app.jobs.models import JobType
from app.jobs import router as jobs_router_mod

router = APIRouter(prefix="/api", tags=["documents"])


class CrawlRequest(BaseModel):
    folder: str


class BatchIdsRequest(BaseModel):
    ids: list[int]


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
        "needs_ai": r["needs_ai"] or 0,
        "needs_ocr": r["needs_ocr"] or 0,
        "errors": r["error"] or 0,
    }


@router.post("/crawl")
async def crawl(request: CrawlRequest) -> dict:
    """Submit a crawl job (async). Use GET /api/jobs/{job_id} to check status."""
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


@router.get("/documents/{doc_id}/thumbnail")
async def get_document_thumbnail(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    """Serve the thumbnail image for a document."""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    thumb_path = Path("thumbnails") / f"{Path(doc.file_path).stem}_thumb.jpg"
    if not thumb_path.exists():
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return FileResponse(path=str(thumb_path), media_type="image/jpeg")


@router.get("/documents/{doc_id}/file")
async def get_document_file(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    """Stream the actual document file for inline viewing."""
    import os

    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = doc.file_path
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    ext = os.path.splitext(file_path)[1].lower()
    content_types = {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".txt": "text/plain",
        ".doc": "application/msword",
        ".ppt": "application/vnd.ms-powerpoint",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".xls": "application/vnd.ms-excel",
    }
    media_type = content_types.get(ext, "application/octet-stream")

    return FileResponse(
        path=file_path,
        media_type=media_type,
        headers={"Content-Disposition": "inline"},
    )


@router.post("/documents/{doc_id}/open-folder")
async def open_document_folder(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Open the file's parent folder in the system file explorer and select the file."""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    file_path = Path(doc.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    if sys.platform == "win32":
        subprocess.Popen(["explorer", "/select,", str(file_path)])
    return {"opened": True}


@router.post("/documents/{doc_id}/open")
async def open_document_file(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Open the file with the system default application."""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    file_path = Path(doc.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    if sys.platform == "win32":
        import os
        os.startfile(str(file_path))
    return {"opened": True}


@router.post("/documents/{doc_id}/classify")
async def classify_document(doc_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    """Queue AI classification for a single document."""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.full_text:
        raise HTTPException(status_code=400, detail="Document has no text to classify")

    queue = jobs_router_mod._queue
    store = jobs_router_mod._store
    if queue is None or store is None:
        raise HTTPException(status_code=503, detail="Job system not initialized")

    job = store.create_job(JobType.CLASSIFY, {"document_id": doc_id})
    await queue.put(job)
    return {"job_id": job.id, "status": "queued"}


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


@router.post("/documents/{doc_id}/rescan")
async def rescan_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Re-scan a single document (re-parse the file)."""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

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

    job = store.create_job(
        JobType.RESCAN,
        {"document_id": doc_id, "file_path": doc.file_path, "file_type": doc.file_type},
    )
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

    queued = 0
    for doc in reachable:
        job = store.create_job(
            JobType.RESCAN,
            {"document_id": doc.id, "file_path": doc.file_path, "file_type": doc.file_type},
        )
        await queue.put(job)
        queued += 1

    return {"queued": queued, "skipped_unreachable": skipped}


@router.delete("/documents/{doc_id}")
async def exclude_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Soft-delete: mark document as excluded so it won't reappear on next crawl."""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    doc.excluded = True
    await db.commit()
    return {"excluded": True, "id": doc_id}


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
    return {"excluded": len(docs)}


@router.post("/documents/{doc_id}/restore")
async def restore_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Undo exclusion: make document visible again."""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    doc.excluded = False
    await db.commit()
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
        return {"favorited": False}
    db.add(Favorite(document_id=doc_id))
    await db.commit()
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


class TagAddRequest(BaseModel):
    name: str


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
    return {"deleted": True}
