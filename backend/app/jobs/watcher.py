import asyncio
import logging
from pathlib import Path

from watchfiles import awatch

from app.jobs.models import JobStatus, JobStore, JobType

logger = logging.getLogger("litvault.watcher")

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".pptx"}


async def watch_folders(folders: list[str], queue: asyncio.Queue, store: JobStore) -> None:
    if not folders:
        logger.info("No watch folders configured, watcher idle")
        return

    valid_folders = []
    for f in folders:
        p = Path(f)
        if p.is_dir():
            valid_folders.append(str(p))
        else:
            logger.warning("Watch folder not found: %s", f)

    if not valid_folders:
        logger.warning("No valid watch folders, watcher idle")
        return

    logger.info("Watching %d folder(s): %s", len(valid_folders), valid_folders)
    try:
        async for changes in awatch(*valid_folders, poll_delay_ms=10000):
            affected_folders = set()
            for change_type, change_path in changes:
                ext = Path(change_path).suffix.lower()
                if ext in SUPPORTED_EXTENSIONS:
                    for wf in valid_folders:
                        if change_path.startswith(wf) or Path(change_path).is_relative_to(Path(wf)):
                            affected_folders.add(wf)
                            break

            for folder in affected_folders:
                existing = store.list_jobs()
                already_running = any(
                    j.payload.get("folder") == folder
                    and j.status in (JobStatus.QUEUED, JobStatus.PROCESSING)
                    for j in existing
                )
                if not already_running:
                    job = store.create_job(JobType.CRAWL, {"folder": folder})
                    await queue.put(job)
                    logger.info(
                        "File changes detected in %s, queued crawl job %s", folder, job.id
                    )

    except asyncio.CancelledError:
        logger.info("Watcher stopped")
    except Exception as e:
        logger.error("Watcher error: %s", e)
