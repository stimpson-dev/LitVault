from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.documents.models import Document
from app.jobs.models import JobType
from app.jobs.router import _queue, _store

router = APIRouter(prefix="/api", tags=["documents"])


class CrawlRequest(BaseModel):
    folder: str


@router.post("/crawl")
async def crawl(request: CrawlRequest) -> dict:
    """Submit a crawl job (async). Use GET /api/jobs/{job_id} to check status."""
    if not Path(request.folder).is_dir():
        raise HTTPException(status_code=400, detail=f"Folder not found: {request.folder}")
    if _store is None or _queue is None:
        raise HTTPException(status_code=503, detail="Job system not initialized")
    job = _store.create_job(JobType.CRAWL, {"folder": request.folder})
    await _queue.put(job)
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
        select(Document).order_by(Document.created_at.desc()).offset(offset).limit(limit)
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
        "has_text": doc.has_text,
        "doi": doc.doi,
        "processing_status": doc.processing_status,
        "classification_confidence": doc.classification_confidence,
        "classification_source": doc.classification_source,
        "created_at": doc.created_at,
        "updated_at": doc.updated_at,
        "indexed_at": doc.indexed_at,
    }
