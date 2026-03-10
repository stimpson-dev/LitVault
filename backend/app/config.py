from functools import lru_cache
from pathlib import Path
from typing import Any, Tuple, Type

from pydantic_settings import BaseSettings, PydanticBaseSettingsSource, SettingsConfigDict
from pydantic_settings.main import JsonConfigSettingsSource

CONFIG_PATH = Path(__file__).parent.parent.parent / "config.json"


class Settings(BaseSettings):
    watch_folders: list[str] = []
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3:4b"
    ollama_num_ctx: int = 4096
    embedding_model: str = "nomic-ai/nomic-embed-text-v1.5"
    db_path: str = "litvault.db"
    thumbnails_dir: str = "thumbnails"
    log_level: str = "INFO"
    poll_interval_seconds: int = 10
    parse_timeout_seconds: int = 600

    model_config = SettingsConfigDict(
        json_file=CONFIG_PATH if CONFIG_PATH.exists() else None,
    )

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: Type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> Tuple[PydanticBaseSettingsSource, ...]:
        sources: list[Any] = [init_settings, env_settings]
        if CONFIG_PATH.exists():
            sources.append(JsonConfigSettingsSource(settings_cls))
        return tuple(sources)


@lru_cache
def get_settings() -> Settings:
    return Settings()
