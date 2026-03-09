from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from pathlib import Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.deps import get_db, get_settings_dep
from app.documents.models import Document
from app.ingest.service import IngestService

router = APIRouter(prefix="/api", tags=["documents"])


class CrawlRequest(BaseModel):
    folder: str


class CrawlResponse(BaseModel):
    total_found: int
    new_files: int
    processed: int
    errors: int
    skipped: int


@router.post("/crawl", response_model=CrawlResponse)
async def crawl(
    request: CrawlRequest,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
) -> CrawlResponse:
    if not Path(request.folder).is_dir():
        raise HTTPException(status_code=400, detail=f"Folder not found: {request.folder}")
    service = IngestService(db, settings)
    result = await service.ingest_folder(request.folder)
    return CrawlResponse(
        total_found=result.total_found,
        new_files=result.new_files,
        processed=result.processed,
        errors=result.errors,
        skipped=result.skipped,
    )


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
