import asyncio
from pathlib import Path

import pytest

from app.jobs.models import JobStore, JobType
from app.jobs.watcher import WatcherManager
from app.settings import router as settings_router


class TestWatcherManager:
    async def test_start_records_folders_and_creates_task(self):
        mgr = WatcherManager()
        mgr.init(asyncio.Queue(), JobStore())
        await mgr.start(["X:/nicht-vorhanden"])
        assert mgr.folders == ["X:/nicht-vorhanden"]
        await mgr.stop()

    async def test_restart_replaces_folders(self):
        mgr = WatcherManager()
        mgr.init(asyncio.Queue(), JobStore())
        await mgr.start(["X:/alt"])
        await mgr.start(["Y:/neu"])
        assert mgr.folders == ["Y:/neu"]
        await mgr.stop()

    async def test_queue_crawl_puts_job(self):
        queue: asyncio.Queue = asyncio.Queue()
        store = JobStore()
        mgr = WatcherManager()
        mgr.init(queue, store)
        await mgr.queue_crawl("X:/ordner")
        job = queue.get_nowait()
        assert job.type == JobType.CRAWL
        assert job.payload == {"folder": "X:/ordner"}


class _FakeWatcher:
    def __init__(self) -> None:
        self.folders: list[str] = []
        self.started_with: list[list[str]] = []
        self.crawls: list[str] = []

    async def start(self, folders: list[str]) -> None:
        self.started_with.append(list(folders))
        self.folders = list(folders)

    async def queue_crawl(self, folder: str) -> None:
        self.crawls.append(folder)


async def test_settings_update_restarts_watcher_and_crawls_new_folder(tmp_path, monkeypatch):
    # Settings-PUT mit geänderten watch_folders muss den Watcher neu starten
    # und für NEUE, existierende Ordner einen Crawl einreihen — ohne App-Neustart.
    config_file = tmp_path / "config.json"
    config_file.write_text('{"watch_folders": ["X:/alt"]}', encoding="utf-8")
    monkeypatch.setattr(settings_router, "CONFIG_PATH", config_file)

    fake = _FakeWatcher()
    fake.folders = ["X:/alt"]
    monkeypatch.setattr(settings_router, "WATCHER", fake)

    new_folder = tmp_path / "literatur"
    new_folder.mkdir()

    body = settings_router.SettingsUpdate(watch_folders=["X:/alt", str(new_folder)])
    await settings_router.update_settings(body)

    assert fake.started_with == [["X:/alt", str(new_folder)]]
    assert fake.crawls == [str(new_folder)]  # nur der neue, existierende Ordner


async def test_settings_update_without_folders_does_not_touch_watcher(tmp_path, monkeypatch):
    config_file = tmp_path / "config.json"
    config_file.write_text('{"watch_folders": ["X:/alt"], "theme": "light"}', encoding="utf-8")
    monkeypatch.setattr(settings_router, "CONFIG_PATH", config_file)

    fake = _FakeWatcher()
    monkeypatch.setattr(settings_router, "WATCHER", fake)

    await settings_router.update_settings(settings_router.SettingsUpdate(theme="dark"))

    assert fake.started_with == []
    assert fake.crawls == []
