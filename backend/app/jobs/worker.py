import asyncio
import logging
from datetime import datetime, timezone

from app.config import Settings
from app.database import async_session_factory
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
                    service = IngestService(session, settings)

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
