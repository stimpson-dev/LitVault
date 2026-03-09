# Phase 3 Summary: Background Workers & Progress

## Status: COMPLETE

## What was built
1. **Job models** — JobType/JobStatus enums, Job dataclass with progress tracking
2. **JobStore** — In-memory job CRUD (create, get, list, update progress, complete, fail)
3. **Worker coroutine** — Pulls from asyncio.Queue, creates own DB session, processes crawl jobs via IngestService
4. **Progress callback** — IngestService.ingest_folder accepts on_progress callback for per-file updates
5. **SSE endpoint** — GET /api/jobs/{id}/progress streams job progress events (0.5s poll)
6. **Jobs API** — POST /api/jobs/crawl (async), GET /api/jobs (list), GET /api/jobs/{id} (detail)
7. **File watcher** — watchfiles awatch monitors configured folders, auto-queues crawl jobs, deduplicates
8. **Lifespan wiring** — Worker + watcher start on startup, graceful shutdown with queue drain (30s timeout)
9. **API refactor** — POST /api/crawl now async (returns job_id immediately instead of blocking)

## Key files
- `backend/app/jobs/models.py` — JobType, JobStatus, Job, JobStore
- `backend/app/jobs/worker.py` — process_job, worker_loop
- `backend/app/jobs/router.py` — Jobs API + SSE endpoint + init_job_globals
- `backend/app/jobs/watcher.py` — watch_folders with watchfiles
- `backend/app/main.py` — Updated lifespan with worker + watcher lifecycle
- `backend/app/ingest/service.py` — Added on_progress callback
- `backend/app/documents/router.py` — Refactored POST /api/crawl to async

## Deviations
None — plan executed as written.

## Verification
- All imports resolve without errors
- JobStore CRUD works correctly
- IngestService.ingest_folder accepts on_progress callback
- Jobs router has all expected routes (crawl, list, detail, progress SSE)
- Server starts without errors
