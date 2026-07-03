import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.database import engine
from app.documents import models  # noqa: F401 — register models with Base
from app.migrations import run_startup_migrations
from app.documents.router import router as documents_router
from app.documents.files_router import router as document_files_router
from app.documents.actions_router import router as document_actions_router
from app.search.router import router as search_router
from app.jobs.models import JobStore, JobType
from app.jobs.worker import worker_loop
from app.jobs.watcher import watch_folders
from app.jobs.router import router as jobs_router, init_job_globals
from app.settings.router import router as settings_router

logging.getLogger("litvault").setLevel(logging.INFO)
if not logging.getLogger("litvault").handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(levelname)-5.5s [%(name)s] %(message)s"))
    logging.getLogger("litvault").addHandler(_h)
logger = logging.getLogger("litvault")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: run Alembic migrations (stamp + upgrade)
    await asyncio.to_thread(run_startup_migrations)

    settings = get_settings()
    queue = asyncio.Queue()
    store = JobStore()
    init_job_globals(queue, store)

    # Start background tasks
    crawl_lock = asyncio.Lock()
    worker_tasks = [
        asyncio.create_task(worker_loop(queue, store, settings, crawl_lock))
        for _ in range(settings.worker_count)
    ]
    watcher_task = asyncio.create_task(watch_folders(settings.watch_folders, queue, store))

    # Initial crawl: queue a crawl job for each watch folder on startup
    for folder in settings.watch_folders:
        if folder and Path(folder).is_dir():
            job = store.create_job(JobType.CRAWL, {"folder": folder})
            await queue.put(job)
            logger.info("Queued initial crawl for: %s", folder)

    logger.info("LitVault started (%d workers + watcher active)", settings.worker_count)
    yield

    # Shutdown: cancel everything immediately
    logger.info("Shutting down...")
    for task in (*worker_tasks, watcher_task):
        task.cancel()
    for task in (*worker_tasks, watcher_task):
        try:
            await asyncio.wait_for(task, timeout=2.0)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass

    await engine.dispose()
    logger.info("LitVault stopped")


app = FastAPI(
    title="LitVault",
    description="Local literature navigator for engineering documents",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "litvault"}


app.include_router(documents_router)
app.include_router(document_files_router)
app.include_router(document_actions_router)
app.include_router(jobs_router)
app.include_router(search_router)
app.include_router(settings_router)

# Serve frontend static files in production (after all API routes)
frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")
