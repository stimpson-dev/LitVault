import json
from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel
from app.config import get_settings, CONFIG_PATH

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsUpdate(BaseModel):
    watch_folders: list[str] | None = None
    ollama_url: str | None = None
    ollama_model: str | None = None
    poll_interval_seconds: int | None = None


@router.get("")
async def get_current_settings() -> dict:
    s = get_settings()
    return {
        "watch_folders": s.watch_folders,
        "ollama_url": s.ollama_url,
        "ollama_model": s.ollama_model,
        "db_path": s.db_path,
        "thumbnails_dir": s.thumbnails_dir,
        "log_level": s.log_level,
        "poll_interval_seconds": s.poll_interval_seconds,
    }


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

    # Return fresh settings
    s = get_settings()
    return {
        "watch_folders": s.watch_folders,
        "ollama_url": s.ollama_url,
        "ollama_model": s.ollama_model,
        "db_path": s.db_path,
        "thumbnails_dir": s.thumbnails_dir,
        "log_level": s.log_level,
        "poll_interval_seconds": s.poll_interval_seconds,
    }
