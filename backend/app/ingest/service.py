import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.classification.filename_extractor import extract_from_filename
from app.classification.ollama_client import OllamaClient
from app.classification.service import ClassificationService, detect_language
from app.config import Settings
from app.documents.models import Category, Document, DocumentCategory, DocumentTag, Tag
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
    def __init__(self, db: AsyncSession, settings: Settings, ollama: OllamaClient | None = None) -> None:
        self.db = db
        self.settings = settings
        self.classifier = ClassificationService(ollama) if ollama else None

    async def _apply_classification(self, doc: Document, text: str) -> None:
        if self.classifier is None:
            return

        # Detect language
        doc.language = detect_language(text)

        # Classify
        result, tier = await self.classifier.classify_document(
            text, filename=Path(doc.file_path).name
        )

        # Update document fields
        if result.title:
            doc.title = result.title
        doc.authors = json.dumps(result.authors) if result.authors else None
        doc.year = result.year
        doc.doc_type = result.doc_type
        doc.source = result.source
        doc.summary = result.summary
        doc.classification_confidence = result.confidence
        doc.classification_source = "ai"

        # Get-or-create tags
        for tag_name in result.tags:
            tag_result = await self.db.execute(
                select(Tag).where(Tag.name == tag_name)
            )
            tag = tag_result.scalar_one_or_none()
            if tag is None:
                tag = Tag(name=tag_name)
                self.db.add(tag)
                await self.db.flush()

            # Check if link already exists
            link_result = await self.db.execute(
                select(DocumentTag).where(
                    DocumentTag.document_id == doc.id,
                    DocumentTag.tag_id == tag.id,
                )
            )
            if link_result.scalar_one_or_none() is None:
                self.db.add(DocumentTag(document_id=doc.id, tag_id=tag.id, source="ai"))

        # Get-or-create categories
        for cat_name in result.categories:
            cat_result = await self.db.execute(
                select(Category).where(Category.name == cat_name)
            )
            cat = cat_result.scalar_one_or_none()
            if cat is None:
                cat = Category(name=cat_name)
                self.db.add(cat)
                await self.db.flush()

            link_result = await self.db.execute(
                select(DocumentCategory).where(
                    DocumentCategory.document_id == doc.id,
                    DocumentCategory.category_id == cat.id,
                )
            )
            if link_result.scalar_one_or_none() is None:
                self.db.add(DocumentCategory(document_id=doc.id, category_id=cat.id, source="ai"))

        if tier == "needs-review":
            logger.info("Document %s needs manual review (confidence: %.2f)", doc.file_path, result.confidence)

    async def ingest_folder(
        self,
        folder: str,
        on_progress: Callable[[int, int, str], None] | None = None,
        is_cancelled: Callable[[], bool] | None = None,
    ) -> IngestResult:
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

        logger.info("Scanning folder: %s", folder)
        if on_progress:
            on_progress(0, 0, f"Scanning: {folder}")
        new_files = await find_new_files(folder, self.db)
        total_found = len(new_files)
        logger.info("Found %d new/changed files in %s", total_found, folder)
        if on_progress:
            on_progress(0, total_found, f"Found {total_found} files in {folder}")
        processed = 0
        errors = 0
        skipped = 0

        for idx, meta in enumerate(new_files):
            if is_cancelled and is_cancelled():
                logger.info("Crawl cancelled after %d/%d files", idx, total_found)
                break
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
                    doc.page_count = result.page_count
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

                    # Apply filename-based metadata as baseline (AI can override below)
                    meta_from_name = extract_from_filename(Path(meta["file_path"]).name)
                    if meta_from_name.title and not doc.title:
                        doc.title = meta_from_name.title
                    if meta_from_name.year and not doc.year:
                        doc.year = meta_from_name.year
                    if meta_from_name.doc_type and not doc.doc_type:
                        doc.doc_type = meta_from_name.doc_type
                    if not doc.classification_source:
                        doc.classification_source = "filename"

                    # Classify document
                    try:
                        await self._apply_classification(doc, result.text)
                    except Exception as cls_err:
                        logger.warning("Classification failed for '%s': %s", Path(meta["file_path"]).name, cls_err)

                await self.db.commit()

                if on_progress:
                    on_progress(idx + 1, total_found, f"Processed: {meta['file_path']}")

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
