"""Unit tests for the markdown-fence stripping helper in OllamaClient."""

import json
import pytest

from app.classification.ollama_client import strip_markdown_fence


def test_strips_json_fence():
    raw = '```json\n{"title": "Foo", "year": 2024}\n```'
    result = strip_markdown_fence(raw)
    assert result == '{"title": "Foo", "year": 2024}'
    # Must be valid JSON after stripping
    parsed = json.loads(result)
    assert parsed["title"] == "Foo"


def test_strips_plain_fence():
    raw = '```\n{"key": "value"}\n```'
    result = strip_markdown_fence(raw)
    assert result == '{"key": "value"}'


def test_passthrough_when_no_fence():
    raw = '{"key": "value"}'
    assert strip_markdown_fence(raw) == raw


def test_passthrough_partial_fence():
    raw = '```json\n{"key": "value"}'
    # No closing fence → unchanged
    assert strip_markdown_fence(raw) == raw


def test_strips_fence_with_surrounding_whitespace():
    raw = '  ```json\n{"x": 1}\n```  '
    result = strip_markdown_fence(raw)
    assert result == '{"x": 1}'
