import base64
import json

import httpx
import pytest

from app.ingest.glm_ocr_client import GlmOcrClient, OCR_OPTIONS, OCR_PROMPT


def _client_with_handler(handler) -> GlmOcrClient:
    client = GlmOcrClient("http://test", "glm-ocr:latest")
    client._client = httpx.Client(
        base_url="http://test", transport=httpx.MockTransport(handler)
    )
    return client


def test_ocr_image_builds_correct_request():
    captured: dict = {"method": None, "path": None}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["method"] = request.method
        captured["path"] = request.url.path
        captured.update(json.loads(request.content))
        return httpx.Response(200, json={"message": {"content": "erkannt"}})

    client = _client_with_handler(handler)
    result = client.ocr_image(b"\x89PNG-fake-bytes")

    assert result == "erkannt"
    assert captured["method"] == "POST"
    assert captured["path"] == "/api/chat"
    assert captured["model"] == "glm-ocr:latest"
    assert captured["stream"] is False
    assert captured["options"] == OCR_OPTIONS
    assert captured["options"]["num_ctx"] == 8192  # GPU-Fit: voller 128K-Kontext spillt auf CPU
    # Endliches keep_alive: -1 hielt die Modelle fuer immer im RAM (12 GB
    # llama-server, 94% Systemauslastung, Praxisbefund 2026-07-19)
    assert captured["keep_alive"] == "10m"
    msg = captured["messages"][0]
    assert msg["role"] == "user"
    assert msg["content"] == OCR_PROMPT
    assert base64.b64decode(msg["images"][0]) == b"\x89PNG-fake-bytes"


def test_ocr_image_raises_on_http_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "boom"})

    client = _client_with_handler(handler)
    with pytest.raises(httpx.HTTPStatusError):
        client.ocr_image(b"png")


def test_ocr_image_raises_on_unexpected_response_shape():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"unexpected": True})

    client = _client_with_handler(handler)
    with pytest.raises(ValueError):
        client.ocr_image(b"png")


def test_ocr_model_config_default():
    from app.config import Settings
    assert Settings.model_fields["ocr_model"].default == "glm-ocr:latest"


def test_singleton_follows_settings(monkeypatch):
    import app.ingest.glm_ocr_client as mod
    monkeypatch.setattr(mod, "_client", None)
    c1 = mod.get_glm_ocr_client()
    c2 = mod.get_glm_ocr_client()
    assert c1 is c2
    from app.config import get_settings
    assert c1.model == get_settings().ocr_model


def test_singleton_rebuilds_on_url_change(monkeypatch):
    import app.ingest.glm_ocr_client as mod
    from app.config import get_settings

    # Reset to None and get first client
    monkeypatch.setattr(mod, "_client", None)
    c1 = mod.get_glm_ocr_client()
    original_url = c1.base_url

    # Mock settings to return different URL
    class MockSettings:
        ocr_model = get_settings().ocr_model
        ollama_url = "http://other-host:11434"

    monkeypatch.setattr("app.config.get_settings", lambda: MockSettings())

    # Get client again; should rebuild because URL differs
    c2 = mod.get_glm_ocr_client()
    assert c1 is not c2
    assert c2.base_url == "http://other-host:11434"
    assert c1._client.is_closed is True


class TestCleanOcrOutput:
    """GLM-OCR liefert auf leeren Seiten Meta-Kommentare statt Text und
    halluziniert ---/Fence-Wiederholungen (Praxisbefund 2026-07-17)."""

    def test_blank_page_chatter_becomes_empty(self):
        from app.ingest.glm_ocr_client import clean_ocr_output
        chatter = (
            "The image provided is completely blank with no visible text or content. "
            "Therefore, there is no text to extract from it.\n"
            "No, that's not what I see. The image is completely blank with no visible text.\n"
            "Yes, that is correct. The image is completely blank."
        )
        assert clean_ocr_output(chatter) == ""

    def test_real_text_passes_through(self):
        from app.ingest.glm_ocr_client import clean_ocr_output
        text = "Betriebsfestigkeitsuntersuchungen zur Gruebchenbildung\nan einsatzgehaerteten Stirnradflanken"
        assert clean_ocr_output(text) == text

    def test_dash_runs_are_stripped(self):
        from app.ingest.glm_ocr_client import clean_ocr_output
        text = "Kapitel 9\n---\n---\n---\n---\nDer Versuch zeigt gute Ergebnisse."
        cleaned = clean_ocr_output(text)
        assert "Kapitel 9" in cleaned and "Der Versuch" in cleaned
        assert "---\n---" not in cleaned

    def test_fence_lines_stripped(self):
        from app.ingest.glm_ocr_client import clean_ocr_output
        text = "Echter Text\n```markdown\nEchter Text\n```\n```\n```"
        cleaned = clean_ocr_output(text)
        assert cleaned.startswith("Echter Text")
        assert "```" not in cleaned

    def test_real_text_mentioning_image_kept(self):
        from app.ingest.glm_ocr_client import clean_ocr_output
        # Fachtext der 'image'/'blank' zufaellig erwaehnt darf NICHT geleert werden
        text = ("Die Bildanalyse (image processing) der Verzahnung zeigt deutliche "
                "Verschleissspuren. Weitere Details in Kapitel 4. " * 3)
        assert clean_ocr_output(text) == text.strip()
