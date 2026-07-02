import asyncio
import pytest
from pathlib import Path

from app.config import Settings
from app.ingest import service as ingest_service
from app.ingest.parsers.models import ParseResult


@pytest.fixture
def fake_files(tmp_path):
    files = []
    for i in range(6):
        p = tmp_path / f"doc{i}.pdf"
        p.write_bytes(b"%PDF-fake")
        files.append({"file_path": str(p), "file_hash": f"h{i}", "file_type": "pdf",
                      "file_size": 9, "mtime": 0.0})
    return files


async def test_parses_overlap(db_session, fake_files, monkeypatch, tmp_path):
    concurrency = {"now": 0, "max": 0}

    async def fake_parse(path, file_type):
        concurrency["now"] += 1
        concurrency["max"] = max(concurrency["max"], concurrency["now"])
        await asyncio.sleep(0.05)
        concurrency["now"] -= 1
        return ParseResult(text="inhalt " * 40, page_count=1, has_text=True, ocr_pages=[])

    async def fake_find(folder, db):
        return fake_files

    async def fake_thumb(src, dst):
        return None

    monkeypatch.setattr(ingest_service, "parse_document", fake_parse)
    monkeypatch.setattr(ingest_service, "find_new_files", fake_find)
    monkeypatch.setattr(ingest_service, "generate_thumbnail_async", fake_thumb)

    settings = Settings(watch_folders=[], thumbnails_dir=str(tmp_path), parse_parallelism=3)
    svc = ingest_service.IngestService(db_session, settings, ollama=None)
    result = await svc.ingest_folder(str(tmp_path))

    assert result.processed == 6
    assert result.errors == 0
    assert concurrency["max"] >= 2  # Beweis der Überlappung
