import asyncio
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
from app.ingest.parsers.models import ParseResult
from app.ingest.thumbnail import generate_thumbnail_async
from app.search.facet_cache import FACET_CACHE

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
        self.classifier = ClassificationService(ollama, max_chars=settings.classification_max_chars) if ollama else None

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
        skipped = 0

        if total_found == 0:
            return IngestResult(
                total_found=0,
                new_files=0,
                processed=0,
                errors=0,
                skipped=skipped,
            )

        # Producer/Consumer: N parallele Parse-Worker (Semaphore) + genau EIN
        # DB-Schreiber (SQLite ist single-writer, AsyncSession ist nicht thread-safe).
        parse_sem = asyncio.Semaphore(self.settings.parse_parallelism)
        results_q: asyncio.Queue = asyncio.Queue(maxsize=self.settings.parse_parallelism * 2)

        async def produce(meta: dict) -> None:
            """Parst (+ Thumbnail) OHNE DB-Zugriff; Ergebnis in die Queue."""
            async with parse_sem:
                if is_cancelled and is_cancelled():
                    await results_q.put((meta, None, None))
                    return
                try:
                    parse_result = await parse_document(
                        Path(meta["file_path"]), meta["file_type"]
                    )
                    thumb = None
                    if meta["file_type"] == "pdf" and not parse_result.error:
                        thumb = await generate_thumbnail_async(
                            Path(meta["file_path"]), Path(self.settings.thumbnails_dir)
                        )
                    await results_q.put((meta, parse_result, thumb))
                except Exception as exc:  # Parser-Absturz -> als Fehler-Ergebnis melden
                    await results_q.put((meta, ParseResult(error=str(exc)), None))

        async def write_all() -> tuple[int, int]:
            """Einziger DB-Schreiber: konsumiert Ergebnisse, committed sequenziell."""
            done = 0
            failed = 0
            handled = 0
            while handled < total_found:
                meta, parse_result, _thumb = await results_q.get()
                handled += 1
                if parse_result is None:  # cancelled -> als behandelt zaehlen
                    if on_progress:
                        on_progress(handled, total_found, f"Cancelled: {meta['file_path']}")
                    continue
                try:
                    doc = await self._upsert_document(meta)
                    if parse_result.error:
                        doc.processing_status = "error"
                        doc.summary = parse_result.error
                        failed += 1
                        logger.warning(
                            "Parse error for %s: %s", meta["file_path"], parse_result.error
                        )
                    else:
                        doc.full_text = parse_result.text
                        doc.has_text = parse_result.has_text
                        doc.page_count = parse_result.page_count
                        doc.processing_status = "done"
                        doc.indexed_at = datetime.now(timezone.utc).isoformat()
                        done += 1

                        # Filename-basierte Metadaten als Basis (AI kann unten ueberschreiben)
                        meta_from_name = extract_from_filename(Path(meta["file_path"]).name)
                        if meta_from_name.title and not doc.title:
                            doc.title = meta_from_name.title
                        if meta_from_name.year and not doc.year:
                            doc.year = meta_from_name.year
                        if meta_from_name.doc_type and not doc.doc_type:
                            doc.doc_type = meta_from_name.doc_type
                        if not doc.classification_source:
                            doc.classification_source = "filename"

                        try:
                            await self._apply_classification(doc, parse_result.text)
                        except Exception as cls_err:
                            logger.warning(
                                "Classification failed for '%s': %s",
                                Path(meta["file_path"]).name, cls_err,
                            )
                    await self.db.commit()
                    FACET_CACHE.invalidate()
                except Exception as exc:
                    logger.error("Unexpected error ingesting %s: %s", meta["file_path"], exc)
                    failed += 1
                    try:
                        await self.db.rollback()
                    except Exception:
                        pass
                if on_progress:
                    on_progress(handled, total_found, f"Processed: {meta['file_path']}")
            return done, failed

        producers = [asyncio.create_task(produce(meta)) for meta in new_files]
        writer = asyncio.create_task(write_all())

        # return_exceptions=True: falls ein Producer trotz interner try/except
        # unerwartet abstuerzt, wuerde der Writer sonst ewig auf die Queue warten.
        # Fuer jeden abgestuerzten Producer wird ein Fehler-Ergebnis nachgereicht,
        # damit der Writer die erwartete Anzahl (total_found) erreicht und terminiert.
        gather_results = await asyncio.gather(*producers, return_exceptions=True)
        for meta, res in zip(new_files, gather_results):
            if isinstance(res, BaseException):
                logger.error(
                    "Producer crashed unexpectedly for %s: %s", meta["file_path"], res
                )
                await results_q.put((meta, ParseResult(error=str(res)), None))

        processed, errors = await writer

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
