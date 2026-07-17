import asyncio

from app.config import Settings
from app.jobs.models import JobStatus, JobStore, JobType


class _FakeSessionFactory:
    def __init__(self, session):
        self._session = session

    def __call__(self):
        return self

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, *args):
        return False


class _FakeOllamaClient:
    """Captures the kwargs it was constructed with (needs an async close(),
    since the CLASSIFY branch always awaits ollama.close() in its finally)."""

    last_kwargs: dict | None = None

    def __init__(self, base_url, model, num_ctx):
        _FakeOllamaClient.last_kwargs = {
            "base_url": base_url,
            "model": model,
            "num_ctx": num_ctx,
        }

    async def close(self) -> None:
        pass


class _LiveSettingsStub:
    """Stand-in for the LIVE settings the worker must re-read at call time —
    deliberately different from the stale snapshot passed as the `settings`
    parameter, so the test fails if the worker falls back to the snapshot."""

    ollama_model = "gemma4:31b-cloud"
    ollama_url = "http://live-host:11434"
    ollama_num_ctx = 8192


async def test_classify_job_builds_ollama_client_from_live_settings(db_session, monkeypatch):
    """A settings PUT persists a new ollama_model and clears the get_settings
    cache, but the worker was building its OllamaClient from the startup-time
    `settings` PARAMETER — so the model switch only applied after a restart.
    Regression test: process_job must construct the CLASSIFY OllamaClient
    from live settings (app.config.get_settings()), not from the stale
    snapshot handed to it as a function parameter.
    """
    import app.config as config_mod
    from app.jobs import worker as worker_mod

    monkeypatch.setattr(worker_mod, "async_session_factory", _FakeSessionFactory(db_session))
    monkeypatch.setattr(worker_mod, "OllamaClient", _FakeOllamaClient)
    monkeypatch.setattr(config_mod, "get_settings", lambda: _LiveSettingsStub())

    _FakeOllamaClient.last_kwargs = None

    # Stale settings snapshot (as would have been captured at app startup),
    # deliberately carrying the OLD model name.
    stale_settings = Settings(ollama_model="qwen3:4b")

    store = JobStore()
    # Nonexistent document -> job fails cleanly, but only AFTER the
    # OllamaClient has already been constructed. That's all we need to
    # assert the construction kwargs.
    job = store.create_job(JobType.CLASSIFY, {"document_id": 999999})
    await worker_mod.process_job(job, store, stale_settings, asyncio.Lock())

    assert _FakeOllamaClient.last_kwargs == {
        "base_url": "http://live-host:11434",
        "model": "gemma4:31b-cloud",
        "num_ctx": 8192,
    }
    assert job.status == JobStatus.ERROR
    assert "999999" in job.error
