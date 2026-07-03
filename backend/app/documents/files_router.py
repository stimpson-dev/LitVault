"""
Document file-serving endpoints.

Handles thumbnail, raw file download, open-folder, and open-with-default-app.
"""
import os
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.documents.service import get_document_or_404

router = APIRouter(prefix="/api", tags=["document-files"])


@router.get("/documents/{doc_id}/thumbnail")
async def get_document_thumbnail(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    """Serve the thumbnail image for a document."""
    doc = await get_document_or_404(db, doc_id)
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
    doc = await get_document_or_404(db, doc_id)

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
    doc = await get_document_or_404(db, doc_id)
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
    doc = await get_document_or_404(db, doc_id)
    file_path = Path(doc.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    if sys.platform == "win32":
        os.startfile(str(file_path))
    return {"opened": True}
