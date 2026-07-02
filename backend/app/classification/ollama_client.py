import httpx
import json
import logging
import re

logger = logging.getLogger("litvault.ollama")

_FENCE_RE = re.compile(r"^```(?:json)?\s*\n(.*?)\n```\s*$", re.DOTALL)


def strip_markdown_fence(text: str) -> str:
    """Remove optional ```json ... ``` fences that some Ollama models emit.

    If the text is not fenced, it is returned unchanged.
    """
    m = _FENCE_RE.match(text.strip())
    return m.group(1) if m else text


class OllamaClient:
    def __init__(self, base_url: str = "http://localhost:11434", model: str = "qwen3:4b", num_ctx: int = 4096):
        self.base_url = base_url
        self.model = model
        self.num_ctx = num_ctx
        self._client = httpx.AsyncClient(base_url=base_url, timeout=120.0)

    async def generate(self, prompt: str, json_schema: dict | None = None) -> dict:
        # Use /api/chat with think:false to avoid Qwen3 thinking overhead
        for fmt in ([json_schema, "json"] if json_schema else ["json"]):
            body = {
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "stream": False,
                "think": False,
                "options": {"temperature": 0, "num_predict": 512, "num_ctx": self.num_ctx},
                "format": fmt,
                "keep_alive": -1,
            }
            try:
                response = await self._client.post("/api/chat", json=body)
                response.raise_for_status()
                break
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 500 and fmt != "json":
                    logger.warning("Ollama schema format failed (500), retrying with plain JSON")
                    continue
                logger.error("Ollama HTTP error: %s", exc)
                raise
            except httpx.HTTPError as exc:
                logger.error("Ollama HTTP error: %s", exc)
                raise

        data = response.json()
        raw = data["message"]["content"]

        stripped = strip_markdown_fence(raw)
        try:
            return json.loads(stripped)
        except json.JSONDecodeError as exc:
            logger.error("Failed to parse Ollama response as JSON: %s", raw[:200])
            raise ValueError(f"Ollama returned non-JSON response: {exc}") from exc

    async def check_health(self) -> bool:
        try:
            response = await self._client.get("/api/tags")
            return response.status_code == 200
        except httpx.HTTPError:
            return False

    async def close(self):
        await self._client.aclose()
