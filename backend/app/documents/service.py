"""
Shared document service logic.

Functions here are called from multiple routers and tests — keep them
pure (no HTTP concerns) except for get_document_or_404 which raises HTTPException
on miss (standard FastAPI convention for shared helpers).
"""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.documents.models import Document


async def get_document_or_404(db: AsyncSession, doc_id: int) -> Document:
    """Load a Document by primary key or raise 404."""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc
