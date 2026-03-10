from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.documents.models import Document, Tag, DocumentTag, Favorite
from app.jobs.models import JobType
from app.jobs import router as jobs_router_mod

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
        "has_text": doc.has_text,
        "doi": doc.doi,
        "processing_status": doc.processing_status,
        "classification_confidence": doc.classification_confidence,
        "classification_source": doc.classification_source,
        "created_at": doc.created_at,
        "updated_at": doc.updated_at,
        "indexed_at": doc.indexed_at,
    }


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
