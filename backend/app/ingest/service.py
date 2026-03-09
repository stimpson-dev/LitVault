import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.documents.models import Document
from app.ingest.crawler import find_new_files
from app.ingest.parsers import parse_document
from app.ingest.thumbnail import generate_thumbnail_async

logger = logging.getLogger("litvault.ingest")


@dataclass
class IngestResult:
    total_found: int
    new_files: int
    processed: int
    errors: int
    skipped: int


class IngestService:
    def __init__(self, db: AsyncSession, settings: Settings) -> None:
        self.db = db
        self.settings = settings

    async def ingest_folder(self, folder: str) -> IngestResult:
        folder_path = Path(folder)
        if not folder_path.is_dir():
            logger.error("Folder not accessible: %s", folder)
            return IngestResult(
                total_found=0,
                new_files=0,
                processed=0,
                errors=0,
                skipped=0,
            )

        new_files = await find_new_files(folder, self.db)
        total_found = len(new_files)
        processed = 0
        errors = 0
        skipped = 0

        for meta in new_files:
            try:
                doc = await self._upsert_document(meta)
                doc.processing_status = "processing"
                await self.db.commit()

                result = await parse_document(Path(meta["file_path"]), meta["file_type"])

                if result.error:
                    doc.processing_status = "error"
                    doc.summary = result.error
                    errors += 1
                    logger.warning("Parse error for %s: %s", meta["file_path"], result.error)
                else:
                    doc.full_text = result.text
                    doc.has_text = result.has_text
                    doc.processing_status = "done"
                    doc.indexed_at = datetime.now(timezone.utc).isoformat()
                    processed += 1

                    if meta["file_type"] == "pdf":
                        thumb_path = await generate_thumbnail_async(
                            Path(meta["file_path"]),
                            Path(self.settings.thumbnails_dir),
                        )
                        if thumb_path is not None:
                            logger.debug("Thumbnail generated: %s", thumb_path)

                await self.db.commit()

            except Exception as exc:
                logger.error("Unexpected error ingesting %s: %s", meta["file_path"], exc)
                errors += 1
                try:
                    await self.db.rollback()
                except Exception:
                    pass

        return IngestResult(
            total_found=total_found,
            new_files=total_found,
            processed=processed,
            errors=errors,
            skipped=skipped,
        )

    async def _upsert_document(self, meta: dict) -> Document:
        result = await self.db.execute(
            select(Document).where(Document.file_path == meta["file_path"])
        )
        doc = result.scalar_one_or_none()

        if doc is not None:
            doc.file_hash = meta["file_hash"]
            doc.file_size = meta["file_size"]
            doc.mtime = meta["mtime"]
            doc.file_type = meta["file_type"]
        else:
            doc = Document(
                file_path=meta["file_path"],
                file_hash=meta["file_hash"],
                file_type=meta["file_type"],
                file_size=meta["file_size"],
                mtime=meta["mtime"],
                processing_status="pending",
            )
            self.db.add(doc)
            await self.db.flush()

        return doc
