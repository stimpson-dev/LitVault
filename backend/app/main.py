import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.database import engine, Base
from app.documents import models  # noqa: F401 — register models with Base
from app.documents.router import router as documents_router
from app.search.router import router as search_router
from app.jobs.models import JobStore
from app.jobs.worker import worker_loop
from app.jobs.watcher import watch_folders
from app.jobs.router import router as jobs_router, init_job_globals
from app.settings.router import router as settings_router

logger = logging.getLogger("litvault")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    settings = get_settings()
    queue = asyncio.Queue()
    store = JobStore()
    init_job_globals(queue, store)

    # Start background tasks
    worker_task = asyncio.create_task(worker_loop(queue, store, settings))
    watcher_task = asyncio.create_task(watch_folders(settings.watch_folders, queue, store))

    logger.info("LitVault started (worker + watcher active)")
    yield

    # Shutdown: cancel watcher, drain queue, cancel worker
    watcher_task.cancel()
    try:
        await asyncio.wait_for(watcher_task, timeout=5.0)
    except (asyncio.CancelledError, asyncio.TimeoutError):
        pass

    if not queue.empty():
        logger.info("Draining job queue...")
        try:
            await asyncio.wait_for(queue.join(), timeout=30.0)
        except asyncio.TimeoutError:
            logger.warning("Queue drain timeout, forcing shutdown")

    worker_task.cancel()
    try:
        await asyncio.wait_for(worker_task, timeout=5.0)
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
app.include_router(jobs_router)
app.include_router(search_router)
app.include_router(settings_router)

# Serve frontend static files in production (after all API routes)
frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")
