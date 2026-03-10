import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from app.jobs.models import JobStatus, JobStore, JobType

logger = logging.getLogger("litvault.jobs")

_queue: asyncio.Queue | None = None
_store: JobStore | None = None


def init_job_globals(queue: asyncio.Queue, store: JobStore) -> None:
    global _queue, _store
    _queue = queue
    _store = store


router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class CrawlJobRequest(BaseModel):
    folder: str


@router.post("/crawl")
async def create_crawl_job(request: CrawlJobRequest) -> dict:
    from pathlib import Path

    if not Path(request.folder).is_dir():
        raise HTTPException(status_code=400, detail=f"Folder not found: {request.folder}")
    if _store is None or _queue is None:
        raise HTTPException(status_code=503, detail="Job system not initialized")
    job = _store.create_job(JobType.CRAWL, {"folder": request.folder})
    await _queue.put(job)
    return {"job_id": job.id, "status": job.status.value}


@router.get("")
async def list_jobs(status: str | None = None) -> list[dict]:
    if _store is None:
        raise HTTPException(status_code=503, detail="Job system not initialized")
    filter_status: JobStatus | None = None
    if status is not None:
        try:
            filter_status = JobStatus(status)
        except ValueError:
            filter_status = None
    jobs = _store.list_jobs(filter_status)
    return [
        {
            "id": j.id,
            "type": j.type.value,
            "status": j.status.value,
            "progress_current": j.progress_current,
            "progress_total": j.progress_total,
            "progress_message": j.progress_message,
            "created_at": j.created_at,
            "started_at": j.started_at,
            "finished_at": j.finished_at,
            "error": j.error,
        }
        for j in jobs
    ]


@router.get("/{job_id}")
async def get_job(job_id: str) -> dict:
    if _store is None:
        raise HTTPException(status_code=503, detail="Job system not initialized")
    job = _store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "id": job.id,
        "type": job.type.value,
        "status": job.status.value,
        "progress_current": job.progress_current,
        "progress_total": job.progress_total,
        "progress_message": job.progress_message,
        "result": job.result,
        "created_at": job.created_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "error": job.error,
    }


@router.post("/{job_id}/cancel")
async def cancel_job(job_id: str) -> dict:
    if _store is None:
        raise HTTPException(status_code=503, detail="Job system not initialized")
    job = _store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    cancelled = _store.cancel_job(job_id)
    if not cancelled:
        raise HTTPException(status_code=400, detail="Job cannot be cancelled")
    return {"cancelled": True}


@router.get("/{job_id}/progress")
async def job_progress(job_id: str) -> StreamingResponse:
    if _store is None:
        raise HTTPException(status_code=503, detail="Job system not initialized")
    job = _store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_stream():
        while True:
            current_job = _store.get_job(job_id)
            if current_job is None:
                break
            data = json.dumps(
                {
                    "status": current_job.status.value,
                    "current": current_job.progress_current,
                    "total": current_job.progress_total,
                    "message": current_job.progress_message,
                    "result": current_job.result,
                    "error": current_job.error,
                }
            )
            yield f"data: {data}\n\n"
            if current_job.status in (JobStatus.DONE, JobStatus.ERROR, JobStatus.CANCELLED):
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
