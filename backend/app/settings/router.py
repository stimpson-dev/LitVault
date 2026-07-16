import json
from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel
from app.config import get_settings, CONFIG_PATH
from app.jobs.watcher import WATCHER

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsUpdate(BaseModel):
    language: str | None = None
    theme: str | None = None
    start_page: str | None = None
    results_per_page: int | None = None
    default_sort: str | None = None
    view_mode: str | None = None
    show_favorites_sidebar: bool | None = None
    watch_folders: list[str] | None = None
    poll_interval_seconds: int | None = None
    ollama_model: str | None = None


def _settings_response(s) -> dict:
    return {
        "language": s.language,
        "theme": s.theme,
        "start_page": s.start_page,
        "results_per_page": s.results_per_page,
        "default_sort": s.default_sort,
        "view_mode": s.view_mode,
        "show_favorites_sidebar": s.show_favorites_sidebar,
        "watch_folders": s.watch_folders,
        "poll_interval_seconds": s.poll_interval_seconds,
        "ollama_model": s.ollama_model,
        "db_path": s.db_path,
        "thumbnails_dir": s.thumbnails_dir,
        "log_level": s.log_level,
    }


@router.get("")
async def get_current_settings() -> dict:
    return _settings_response(get_settings())


@router.put("")
async def update_settings(body: SettingsUpdate) -> dict:
    # Read existing config
    config = {}
    if CONFIG_PATH.exists():
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))

    # Merge updates
    updates = body.model_dump(exclude_none=True)
    config.update(updates)

    # Write back
    CONFIG_PATH.write_text(json.dumps(config, indent=2, ensure_ascii=False), encoding="utf-8")

    # Clear settings cache
    get_settings.cache_clear()

    # watch_folders greifen sonst erst beim nächsten App-Start: Watcher neu
    # starten und neue, existierende Ordner sofort crawlen.
    if "watch_folders" in updates:
        old_folders = set(WATCHER.folders)
        new_folders = [f for f in updates["watch_folders"] if f]
        await WATCHER.start(new_folders)
        for folder in new_folders:
            if folder not in old_folders and Path(folder).is_dir():
                await WATCHER.queue_crawl(folder)

    return _settings_response(get_settings())
