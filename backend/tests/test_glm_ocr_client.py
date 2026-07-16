import base64
import json

import httpx
import pytest

from app.ingest.glm_ocr_client import GlmOcrClient, OCR_PROMPT


def _client_with_handler(handler) -> GlmOcrClient:
    client = GlmOcrClient("http://test", "glm-ocr:latest")
    client._client = httpx.Client(
        base_url="http://test", transport=httpx.MockTransport(handler)
    )
    return client


def test_ocr_image_builds_correct_request():
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        return httpx.Response(200, json={"message": {"content": "erkannt"}})

    client = _client_with_handler(handler)
    result = client.ocr_image(b"\x89PNG-fake-bytes")

    assert result == "erkannt"
    assert captured["model"] == "glm-ocr:latest"
    assert captured["stream"] is False
    assert captured["options"] == {"temperature": 0}
    assert captured["keep_alive"] == -1
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
