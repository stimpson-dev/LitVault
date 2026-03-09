import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum


class JobType(str, Enum):
    CRAWL = "crawl"
    CLASSIFY = "classify"


class JobStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    DONE = "done"
    ERROR = "error"


@dataclass
class Job:
    id: str
    type: JobType
    status: JobStatus = JobStatus.QUEUED
    payload: dict = field(default_factory=dict)
    progress_current: int = 0
    progress_total: int = 0
    progress_message: str = ""
    result: dict | None = None
    error: str | None = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    started_at: str | None = None
    finished_at: str | None = None


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}

    def create_job(self, job_type: JobType, payload: dict) -> Job:
        job = Job(id=uuid.uuid4().hex, type=job_type, payload=payload)
        self._jobs[job.id] = job
        return job

    def get_job(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def list_jobs(self, status: JobStatus | None = None) -> list[Job]:
        jobs = list(self._jobs.values())
        if status is not None:
            jobs = [j for j in jobs if j.status == status]
        return sorted(jobs, key=lambda j: j.created_at, reverse=True)

    def update_progress(self, job_id: str, current: int, total: int, message: str = "") -> None:
        job = self._jobs.get(job_id)
        if job is not None:
            job.progress_current = current
            job.progress_total = total
            job.progress_message = message

    def complete_job(self, job_id: str, result: dict) -> None:
        job = self._jobs.get(job_id)
        if job is not None:
            job.status = JobStatus.DONE
            job.result = result
            job.finished_at = datetime.now(timezone.utc).isoformat()

    def fail_job(self, job_id: str, error: str) -> None:
        job = self._jobs.get(job_id)
        if job is not None:
            job.status = JobStatus.ERROR
            job.error = error
            job.finished_at = datetime.now(timezone.utc).isoformat()
