import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import inspect, select

from app.classification.ollama_client import OllamaClient
from app.classification.service import detect_language
from app.config import Settings
from app.database import async_session_factory
from app.documents.models import Document
from app.ingest.service import IngestService
from app.jobs.models import Job, JobStatus, JobStore, JobType
from app.search.facet_cache import FACET_CACHE

logger = logging.getLogger("litvault.worker")


async def process_job(job: Job, store: JobStore, settings: Settings, crawl_lock: asyncio.Lock) -> None:
    job.status = JobStatus.PROCESSING
    job.started_at = datetime.now(timezone.utc).isoformat()

    try:
        async with async_session_factory() as session:
            match job.type:
                case JobType.CRAWL:
                    async with crawl_lock:  # nur ein Crawl gleichzeitig (Ordner-Exklusivität)
                        service = IngestService(session, settings, ollama=None)
                        folder = job.payload["folder"]
                        store.update_progress(job.id, 0, 0, f"Scanning: {folder}")

                        def on_progress(current: int, total: int, message: str) -> None:
                            store.update_progress(job.id, current, total, message)

                        result = await service.ingest_folder(
                            folder,
                            on_progress=on_progress,
                            is_cancelled=lambda: store.is_cancelled(job.id),
                        )
                        store.complete_job(
                            job.id,
                            {
                                "total_found": result.total_found,
                                "new_files": result.new_files,
                                "processed": result.processed,
                                "errors": result.errors,
                                "skipped": result.skipped,
                            },
                        )
                case JobType.CLASSIFY:
                    ollama = OllamaClient(
                        base_url=settings.ollama_url,
                        model=settings.ollama_model,
                        num_ctx=settings.ollama_num_ctx,
                    )
                    try:
                        doc_id = job.payload.get("document_id")
                        if doc_id:
                            result = await session.execute(
                                select(Document).where(Document.id == doc_id)
                            )
                            doc = result.scalar_one_or_none()
                            if doc and doc.full_text:
                                service = IngestService(session, settings, ollama=ollama)
                                await service._apply_classification(doc, doc.full_text)
                                await session.commit()
                                FACET_CACHE.invalidate()
                                store.complete_job(job.id, {"classified": 1})
                            else:
                                store.fail_job(job.id, f"Document {doc_id} not found or has no text")
                        else:
                            result = await session.execute(
                                select(Document).where(
                                    Document.processing_status == "done",
                                    Document.classification_source.is_(None),
                                    Document.has_text.is_(True),
                                    Document.excluded == False,
                                )
                            )
                            docs = result.scalars().all()
                            svc = IngestService(session, settings, ollama=ollama)

                            # Semaphore limits concurrent Ollama HTTP requests.
                            # Actual concurrency also depends on the Ollama server's
                            # OLLAMA_NUM_PARALLEL env-var (default usually allows 2+).
                            sem = asyncio.Semaphore(settings.classify_parallelism)

                            async def classify_only(doc: Document, text: str, filename: str):
                                """HTTP + language detection run in parallel (no DB I/O)."""
                                async with sem:
                                    try:
                                        lang = detect_language(text)
                                        # Pass full text; ClassificationService.classify()
                                        # truncates internally (avoid double-slice here).
                                        cls_result, tier = await svc.classifier.classify_document(
                                            text,
                                            filename=filename,
                                        )
                                        return doc, lang, cls_result, tier, None
                                    except Exception as exc:
                                        return doc, None, None, None, exc

                            classified = 0
                            # full_text/file_path werden EAGER beim Task-Erzeugen gelesen:
                            # Nach einem session.rollback() im seriellen Teil (Fehlerpfad
                            # unten) wären alle Instanzen expired und sync-Attributzugriff
                            # im Task würde außerhalb des Greenlet-Kontexts fehlschlagen.
                            tasks = [
                                asyncio.create_task(
                                    classify_only(d, d.full_text, Path(d.file_path).name)
                                )
                                for d in docs
                            ]
                            for i, fut in enumerate(asyncio.as_completed(tasks)):
                                doc, lang, cls_result, tier, err = await fut
                                # session.rollback() expired ALLE Instanzen der Session.
                                # Vor jedem Attributzugriff (doc.id etc.) explizit im
                                # Greenlet-Kontext nachladen, sonst MissingGreenlet.
                                if inspect(doc).expired:
                                    await session.refresh(doc)
                                if err is not None:
                                    logger.warning(
                                        "Classification failed for doc %s: %s", doc.id, err
                                    )
                                    continue
                                # DB writes are strictly serial on the single session.
                                try:
                                    doc.language = lang
                                    await svc.apply_classification_result(doc, cls_result, tier)
                                    await session.commit()
                                    FACET_CACHE.invalidate()
                                    classified += 1
                                    store.update_progress(
                                        job.id, i + 1, len(docs), f"Classified: {doc.file_path}"
                                    )
                                except Exception as e:
                                    logger.warning(
                                        "Classification apply failed for doc %s: %s", doc.id, e
                                    )
                                    await session.rollback()
                                    continue
                            store.complete_job(job.id, {"classified": classified, "total": len(docs)})
                    finally:
                        await ollama.close()
                case JobType.RESCAN:
                    doc_id = job.payload["document_id"]
                    file_path = job.payload["file_path"]
                    file_type = job.payload["file_type"]

                    result = await session.execute(
                        select(Document).where(Document.id == doc_id)
                    )
                    doc = result.scalar_one_or_none()
                    if not doc:
                        store.fail_job(job.id, f"Document {doc_id} not found")
                    else:
                        from app.ingest.parsers import parse_document
                        from app.classification.filename_extractor import extract_from_filename

                        parse_result = await parse_document(Path(file_path), file_type)
                        if parse_result.error:
                            doc.processing_status = "error"
                            doc.summary = parse_result.error
                            store.fail_job(job.id, parse_result.error)
                        else:
                            doc.full_text = parse_result.text
                            doc.has_text = parse_result.has_text
                            doc.processing_status = "done"

                            fname_meta = extract_from_filename(Path(file_path).name)
                            if fname_meta.title and not doc.title:
                                doc.title = fname_meta.title
                            if fname_meta.year and not doc.year:
                                doc.year = fname_meta.year
                            if fname_meta.doc_type and not doc.doc_type:
                                doc.doc_type = fname_meta.doc_type

                            store.complete_job(job.id, {"rescanned": True})
                        await session.commit()
                        FACET_CACHE.invalidate()
                case JobType.EMBED:
                    from sqlalchemy import delete

                    from app.documents.models import Embedding
                    from app.search import embedding_service as emb_mod
                    from app.search.embedding_service import build_embed_text, vector_to_blob
                    from app.search.vector_index import VECTOR_INDEX

                    emb_service = emb_mod.get_embedding_service()
                    result = await session.execute(
                        select(Document)
                        .outerjoin(Embedding, Embedding.document_id == Document.id)
                        .where(
                            Document.has_text.is_(True),
                            Document.excluded == False,
                            (Embedding.document_id.is_(None))
                            | (Embedding.model != settings.embedding_model),
                        )
                    )
                    docs = result.scalars().all()
                    # Texte EAGER aufbauen — keine ORM-Attributzugriffe mehr im
                    # Loop noetig (rollback wuerde Instanzen expiren, s. CLASSIFY).
                    items = [
                        (d.id, build_embed_text(d.title, d.summary, d.full_text,
                                                settings.embedding_max_chars), d.file_path)
                        for d in docs
                    ]
                    embedded = 0
                    errors = 0
                    try:
                        for i, (item_id, embed_text_str, file_path) in enumerate(items):
                            if store.is_cancelled(job.id):
                                break
                            try:
                                vecs = await emb_service.encode_documents([embed_text_str])
                                await session.execute(
                                    delete(Embedding).where(Embedding.document_id == item_id)
                                )
                                session.add(Embedding(
                                    document_id=item_id,
                                    model=settings.embedding_model,
                                    vector=vector_to_blob(vecs[0]),
                                ))
                                await session.commit()
                                embedded += 1
                            except emb_mod.ModelLoadError:
                                raise  # fatal — ohne Modell ist der ganze Job sinnlos
                            except Exception as exc:
                                logger.warning("Embedding failed for doc %s: %s", item_id, exc)
                                await session.rollback()
                                errors += 1
                            store.update_progress(job.id, i + 1, len(items), f"Embedded: {file_path}")
                        store.complete_job(job.id, {
                            "embedded": embedded, "errors": errors, "total": len(items),
                        })
                    finally:
                        VECTOR_INDEX.invalidate()
                case _:
                    store.fail_job(job.id, f"Unknown job type: {job.type}")
    except Exception as e:
        logger.error("Job %s failed: %s", job.id, e)
        store.fail_job(job.id, str(e))


async def worker_loop(queue: asyncio.Queue, store: JobStore, settings: Settings, crawl_lock: asyncio.Lock) -> None:
    while True:
        job = await queue.get()
        try:
            await process_job(job, store, settings, crawl_lock)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error("Unexpected error in worker_loop for job %s: %s", job.id, e)
        finally:
            queue.task_done()
