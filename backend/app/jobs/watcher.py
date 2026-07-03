import asyncio
import logging
from pathlib import Path

from watchfiles import awatch

from app.jobs.models import JobStatus, JobStore, JobType

logger = logging.getLogger("litvault.watcher")

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".pptx"}


class WatcherManager:
    """Hält den laufenden Watcher-Task, damit Settings-Änderungen ihn ohne
    App-Neustart ersetzen können (der Task selbst liest die Ordnerliste nur
    einmal beim Start)."""

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._queue: asyncio.Queue | None = None
        self._store: JobStore | None = None
        self._folders: list[str] = []

    def init(self, queue: asyncio.Queue, store: JobStore) -> None:
        self._queue = queue
        self._store = store

    @property
    def folders(self) -> list[str]:
        return list(self._folders)

    async def start(self, folders: list[str]) -> None:
        await self.stop()
        self._folders = list(folders)
        self._task = asyncio.create_task(watch_folders(self._folders, self._queue, self._store))

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await asyncio.wait_for(self._task, timeout=2.0)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass
            self._task = None

    async def queue_crawl(self, folder: str) -> None:
        job = self._store.create_job(JobType.CRAWL, {"folder": folder})
        await self._queue.put(job)
        logger.info("Queued crawl for newly configured folder: %s", folder)


WATCHER = WatcherManager()


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
