"""Gedrosselte Scan-Fortschrittsmeldungen aus scan_folder/find_new_files."""
import pytest

import app.ingest.crawler as crawler_mod
from app.ingest.crawler import find_new_files


@pytest.fixture
def pdf_dir(tmp_path):
    """Drei Mini-'PDFs' (Inhalt egal — nur Hashing/Meta, kein Parsen)."""
    for i in range(3):
        (tmp_path / f"doc{i}.pdf").write_bytes(b"%PDF-fake " + bytes([i]))
    (tmp_path / "notes.txt").write_text("ignored")  # nicht unterstuetzt
    return tmp_path


class _FakeClock:
    """Kontrollierbare time.monotonic-Quelle."""
    def __init__(self, start: float = 100.0, step: float = 0.0):
        self.now = start
        self.step = step

    def __call__(self) -> float:
        value = self.now
        self.now += self.step
        return value


async def test_scan_reports_path_and_counter(pdf_dir, db_session, monkeypatch):
    # Zeit schreitet pro Abfrage um 2s fort -> jede Datei meldet
    monkeypatch.setattr(crawler_mod.time, "monotonic", _FakeClock(step=2.0))
    calls: list[tuple[int, int, str]] = []

    result = await find_new_files(pdf_dir, db_session, on_progress=lambda c, t, m: calls.append((c, t, m)))

    assert len(result) == 3  # txt wird ignoriert
    assert len(calls) == 3
    for i, (current, total, message) in enumerate(calls, start=1):
        assert (current, total) == (0, 0)
        assert message.startswith("Scanning: ")
        assert message.endswith(f"({i} checked)")
        assert ".pdf" in message


async def test_scan_throttles_to_one_report_per_second(pdf_dir, db_session, monkeypatch):
    # Zeit steht still -> nur die erste Datei meldet (100.0 - 0.0 >= 1.0)
    monkeypatch.setattr(crawler_mod.time, "monotonic", _FakeClock(step=0.0))
    calls: list[str] = []

    result = await find_new_files(pdf_dir, db_session, on_progress=lambda c, t, m: calls.append(m))

    assert len(result) == 3
    assert len(calls) == 1
    assert calls[0].endswith("(1 checked)")


async def test_scan_without_callback_unchanged(pdf_dir, db_session):
    result = await find_new_files(pdf_dir, db_session)
    assert len(result) == 3
