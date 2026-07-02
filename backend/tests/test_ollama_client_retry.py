"""TDD tests for OllamaClient retry-on-parse-failure logic (Task 20b).

Strategy: monkeypatch ``client._client.post`` with an async fake that returns
objects exposing ``.raise_for_status()`` and ``.json()``.
"""

import json
import pytest
import httpx

from app.classification.ollama_client import OllamaClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class _FakeResponse:
    """Mimics the subset of httpx.Response used by OllamaClient."""

    def __init__(self, content_text: str, status_code: int = 200):
        self._content = content_text
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                f"HTTP {self.status_code}",
                request=httpx.Request("POST", "http://localhost"),
                response=httpx.Response(self.status_code),
            )

    def json(self) -> dict:
        return {"message": {"content": self._content}}


def _make_post_mock(responses: list[_FakeResponse]):
    """Return an async callable that yields responses in order, tracking calls."""
    call_count = 0
    calls = []

    async def _post(url: str, **kwargs):
        nonlocal call_count
        calls.append(kwargs)
        resp = responses[call_count]
        call_count += 1
        return resp

    _post.calls = calls
    _post.call_count_ref = lambda: call_count
    return _post


# ---------------------------------------------------------------------------
# Test 1 (RED → GREEN): schema-format response is free Markdown → retry with
# "json" format succeeds → generate() returns the parsed dict, 2 POST calls.
# ---------------------------------------------------------------------------

async def test_retry_on_parse_failure_succeeds_on_second(monkeypatch):
    """First attempt returns un-parseable Markdown; second (json format) returns
    valid JSON in a fence → should succeed and make exactly 2 POST requests."""
    fake_markdown = "**TITLE**: Some Book\n**YEAR**: 2024"  # not JSON
    fake_json_fenced = '```json\n{"a": 1}\n```'

    responses = [
        _FakeResponse(fake_markdown),      # first call: schema format
        _FakeResponse(fake_json_fenced),   # second call: json format
    ]
    mock_post = _make_post_mock(responses)

    client = OllamaClient()
    monkeypatch.setattr(client._client, "post", mock_post)

    schema = {"type": "object", "properties": {"a": {"type": "integer"}}}
    result = await client.generate("describe this", json_schema=schema)

    assert result == {"a": 1}
    assert mock_post.call_count_ref() == 2, "Expected exactly 2 POST calls (schema + json retry)"


# ---------------------------------------------------------------------------
# Test 2 (RED → GREEN): both responses un-parseable → ValueError raised,
# but both formats MUST be tried (2 POST calls).
# ---------------------------------------------------------------------------

async def test_retry_both_unparseable_raises_value_error(monkeypatch):
    """Both schema- and json-format responses are un-parseable → ValueError;
    importantly, BOTH formats must be attempted (2 POST calls)."""
    bad_content = "this is not JSON at all"

    responses = [
        _FakeResponse(bad_content),  # first call: schema format
        _FakeResponse(bad_content),  # second call: json format
    ]
    mock_post = _make_post_mock(responses)

    client = OllamaClient()
    monkeypatch.setattr(client._client, "post", mock_post)

    schema = {"type": "object"}
    with pytest.raises(ValueError, match="non-JSON"):
        await client.generate("describe this", json_schema=schema)

    assert mock_post.call_count_ref() == 2, "Expected both formats to be tried (2 POST calls)"


# ---------------------------------------------------------------------------
# Test 3 (GREEN even before change): first response already valid JSON →
# returns immediately, exactly 1 POST call.
# ---------------------------------------------------------------------------

async def test_no_retry_when_first_response_is_valid_json(monkeypatch):
    """If schema-format response is valid JSON, return immediately — no retry."""
    valid_json = '{"title": "Some Book", "year": 2024}'

    responses = [
        _FakeResponse(valid_json),   # first call: schema format → parse OK
        _FakeResponse("should never be called"),  # must not be reached
    ]
    mock_post = _make_post_mock(responses)

    client = OllamaClient()
    monkeypatch.setattr(client._client, "post", mock_post)

    schema = {"type": "object"}
    result = await client.generate("describe this", json_schema=schema)

    assert result == {"title": "Some Book", "year": 2024}
    assert mock_post.call_count_ref() == 1, "No retry expected when first response parses OK"


# ---------------------------------------------------------------------------
# Test 4: num_predict must be 1024 in the request body.
# ---------------------------------------------------------------------------

async def test_num_predict_is_1024(monkeypatch):
    """generate() must send num_predict=1024 in the options body."""
    valid_json = '{"a": 1}'
    responses = [_FakeResponse(valid_json)]
    mock_post = _make_post_mock(responses)

    client = OllamaClient()
    monkeypatch.setattr(client._client, "post", mock_post)

    await client.generate("test", json_schema={"type": "object"})

    assert mock_post.calls, "Expected at least one POST call"
    body = mock_post.calls[0]["json"]
    assert body["options"]["num_predict"] == 1024, (
        f"Expected num_predict=1024, got {body['options'].get('num_predict')}"
    )
