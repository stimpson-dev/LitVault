import httpx
import json
import logging

logger = logging.getLogger("litvault.ollama")


class OllamaClient:
    def __init__(self, base_url: str = "http://localhost:11434", model: str = "qwen3:8b"):
        self.base_url = base_url
        self.model = model
        self._client = httpx.AsyncClient(base_url=base_url, timeout=120.0)

    async def generate(self, prompt: str, json_schema: dict | None = None) -> dict:
        # Try with structured schema first, fall back to plain JSON on 500 errors
        for fmt in ([json_schema, "json"] if json_schema else ["json"]):
            body = {
                "model": self.model,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0, "num_predict": 2048},
                "format": fmt,
                "keep_alive": -1,
            }
            try:
                response = await self._client.post("/api/generate", json=body)
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
        raw = data["response"]

        try:
            return json.loads(raw)
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
