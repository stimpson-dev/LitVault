"""Synchroner OCR-Client gegen Ollama (glm-ocr).

Bewusst synchron: wird aus parse_pdf heraus aufgerufen, das per
asyncio.to_thread in einem Worker-Thread laeuft. Ein Client pro Prozess
(lazy Singleton); Aufrufe sind durch das _ocr_lock des Parsers serialisiert.
"""
import base64

import httpx

OCR_PROMPT = (
    "Extract all text from this page exactly as written. "
    "Preserve the reading order. Output only the extracted text, no commentary."
)

# num_ctx begrenzt: ohne Angabe laedt Ollama das Modell mit dem vollen
# 128K-Modelfile-Kontext (~11 GB KV-Cache -> CPU-Spill auf 8-GB-GPUs,
# Timeouts). 8192 reicht fuer Bild-Tokens + eine volle Textseite und
# haelt das Modell komplett in der GPU (gemessen: 2,3 GB, 100% GPU).
# num_predict deckelt Halluzinations-Schleifen auf (fast) leeren Seiten.
OCR_OPTIONS = {"temperature": 0, "num_ctx": 8192, "num_predict": 2048}


class GlmOcrClient:
    def __init__(self, base_url: str, model: str, timeout: float = 120.0):
        self.base_url = base_url
        self.model = model
        self._client = httpx.Client(base_url=base_url, timeout=timeout)

    def ocr_image(self, png_bytes: bytes) -> str:
        body = {
            "model": self.model,
            "messages": [{
                "role": "user",
                "content": OCR_PROMPT,
                "images": [base64.b64encode(png_bytes).decode("ascii")],
            }],
            "stream": False,
            "options": dict(OCR_OPTIONS),
            "keep_alive": -1,
        }
        response = self._client.post("/api/chat", json=body)
        response.raise_for_status()
        data = response.json()
        content = data.get("message", {}).get("content")
        if content is None:
            raise ValueError(f"Unexpected Ollama response shape: {str(data)[:200]}")
        return content

    def close(self) -> None:
        self._client.close()


_client: GlmOcrClient | None = None


def get_glm_ocr_client() -> GlmOcrClient:
    """Lazy Prozess-Singleton; folgt settings.ollama_url / settings.ocr_model."""
    global _client
    from app.config import get_settings

    settings = get_settings()
    if _client is None or _client.model != settings.ocr_model or _client.base_url != settings.ollama_url:
        if _client is not None:
            _client.close()
        _client = GlmOcrClient(settings.ollama_url, settings.ocr_model)
    return _client
