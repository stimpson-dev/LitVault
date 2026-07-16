"""Roundtrip-Tests fuer den Settings-Router (ollama_model).

CONFIG_PATH wird an drei Stellen auf tmp gepatcht: app.config (Modul-Global,
von settings_customise_sources geprueft), app.settings.router (lokale
Import-Bindung, Schreibziel des PUT) und Settings.model_config["json_file"]
(zur Importzeit gebundene Lese-Quelle der JsonConfigSettingsSource).
"""
import json

import pytest
from httpx import ASGITransport, AsyncClient

import app.config as config_mod
import app.settings.router as settings_router_mod
from app.config import Settings, get_settings
from app.main import app


@pytest.fixture
async def client(tmp_path, monkeypatch):
    cfg = tmp_path / "config.json"
    cfg.write_text('{"ollama_model": "qwen3:4b"}', encoding="utf-8")
    monkeypatch.setattr(config_mod, "CONFIG_PATH", cfg)
    monkeypatch.setattr(settings_router_mod, "CONFIG_PATH", cfg)
    monkeypatch.setitem(Settings.model_config, "json_file", cfg)
    get_settings.cache_clear()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    # Teardown: monkeypatch stellt die Pfade zurueck; Cache leeren, damit
    # nachfolgende Tests nicht die tmp-Settings sehen.
    get_settings.cache_clear()


async def test_get_settings_contains_ollama_model(client):
    resp = await client.get("/api/settings")
    assert resp.status_code == 200
    assert resp.json()["ollama_model"] == "qwen3:4b"


async def test_ollama_model_roundtrip(client, tmp_path):
    resp = await client.put("/api/settings", json={"ollama_model": "gemma4:31b-cloud"})
    assert resp.status_code == 200
    assert resp.json()["ollama_model"] == "gemma4:31b-cloud"

    on_disk = json.loads((tmp_path / "config.json").read_text(encoding="utf-8"))
    assert on_disk["ollama_model"] == "gemma4:31b-cloud"

    resp = await client.get("/api/settings")
    assert resp.json()["ollama_model"] == "gemma4:31b-cloud"


async def test_put_without_ollama_model_leaves_it_unchanged(client, tmp_path):
    resp = await client.put("/api/settings", json={"theme": "light"})
    assert resp.status_code == 200
    assert resp.json()["ollama_model"] == "qwen3:4b"
    on_disk = json.loads((tmp_path / "config.json").read_text(encoding="utf-8"))
    assert on_disk["ollama_model"] == "qwen3:4b"
