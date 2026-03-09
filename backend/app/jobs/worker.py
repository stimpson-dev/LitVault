import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.classification.ollama_client import OllamaClient
from app.config import Settings
from app.database import async_session_factory
from app.documents.models import Document
from app.ingest.service import IngestService
from app.jobs.models import Job, JobStatus, JobStore, JobType

logger = logging.getLogger("litvault.worker")


async def process_job(job: Job, store: JobStore, settings: Settings) -> None:
    job.status = JobStatus.PROCESSING
    job.started_at = datetime.now(timezone.utc).isoformat()

    try:
        async with async_session_factory() as session:
            match job.type:
                case JobType.CRAWL:
                    ollama = OllamaClient(
                        base_url=settings.ollama_url,
                        model=settings.ollama_model,
                    )
                    try:
                        service = IngestService(session, settings, ollama=ollama)

                        def on_progress(current: int, total: int, message: str) -> None:
                            store.update_progress(job.id, current, total, message)

                        result = await service.ingest_folder(job.payload["folder"], on_progress=on_progress)
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
                    finally:
                        await ollama.close()
                case JobType.CLASSIFY:
                    ollama = OllamaClient(
                        base_url=settings.ollama_url,
                        model=settings.ollama_model,
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
                                store.complete_job(job.id, {"classified": 1})
                            else:
                                store.fail_job(job.id, f"Document {doc_id} not found or has no text")
                        else:
                            result = await session.execute(
                                select(Document).where(
                                    Document.processing_status == "done",
                                    Document.classification_source.is_(None),
                                    Document.has_text.is_(True),
                                )
                            )
                            docs = result.scalars().all()
                            service = IngestService(session, settings, ollama=ollama)
                            classified = 0
                            for i, doc in enumerate(docs):
                                try:
                                    await service._apply_classification(doc, doc.full_text)
                                    await session.commit()
                                    classified += 1
                                    store.update_progress(job.id, i + 1, len(docs), f"Classified: {doc.file_path}")
                                except Exception as e:
                                    logger.warning("Classification failed for doc %s: %s", doc.id, e)
                                    await session.rollback()
                            store.complete_job(job.id, {"classified": classified, "total": len(docs)})
                    finally:
                        await ollama.close()
                case _:
                    store.fail_job(job.id, f"Unknown job type: {job.type}")
    except Exception as e:
        logger.error("Job %s failed: %s", job.id, e)
        store.fail_job(job.id, str(e))


async def worker_loop(queue: asyncio.Queue, store: JobStore, settings: Settings) -> None:
    while True:
        job = await queue.get()
        try:
            await process_job(job, store, settings)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error("Unexpected error in worker_loop for job %s: %s", job.id, e)
        finally:
            queue.task_done()
