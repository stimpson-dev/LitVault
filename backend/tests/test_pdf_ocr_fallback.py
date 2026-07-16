"""GLM-OCR-Pfad in parse_pdf: Erfolg und Fallback, ohne echten Ollama-Call."""
import fitz
import pytest

import app.ingest.glm_ocr_client as ocr_mod
from app.ingest.parsers.pdf_parser import parse_pdf


@pytest.fixture
def scanned_pdf(tmp_path):
    """Ein-Seiten-PDF ohne Textebene -> _is_scanned_page() ist True."""
    path = tmp_path / "scan.pdf"
    doc = fitz.open()
    doc.new_page(width=595, height=842)
    doc.save(str(path))
    doc.close()
    return path


class _FakeOcr:
    def __init__(self, result=None, error=None):
        self._result = result
        self._error = error
        self.calls = 0

    def ocr_image(self, png_bytes: bytes) -> str:
        self.calls += 1
        assert png_bytes[:4] == b"\x89PNG"  # echter Render-Output
        if self._error:
            raise self._error
        return self._result


def test_ocr_success_uses_glm_text(scanned_pdf, monkeypatch):
    fake = _FakeOcr(result="ERKANNTER SCAN-TEXT")
    monkeypatch.setattr(ocr_mod, "get_glm_ocr_client", lambda: fake)

    result = parse_pdf(scanned_pdf)

    assert result.error is None
    assert "ERKANNTER SCAN-TEXT" in result.text
    assert result.has_text is True
    assert result.ocr_pages == [0]
    assert fake.calls == 1


def test_ocr_failure_falls_back_to_page_text(scanned_pdf, monkeypatch):
    fake = _FakeOcr(error=RuntimeError("ollama down"))
    monkeypatch.setattr(ocr_mod, "get_glm_ocr_client", lambda: fake)

    result = parse_pdf(scanned_pdf)

    # Kein Crash: Seite bleibt textarm, Dokument wird trotzdem verarbeitet
    assert result.error is None
    assert result.ocr_pages == []
    assert result.has_text is False
    assert fake.calls == 1
