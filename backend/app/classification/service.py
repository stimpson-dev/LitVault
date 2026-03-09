import logging

from langdetect import detect, LangDetectException

from app.classification.ollama_client import OllamaClient
from app.classification.schemas import ClassificationResult, build_prompt

logger = logging.getLogger("litvault.classification")

CONFIDENCE_AUTO = 0.85
CONFIDENCE_REVIEW = 0.55
MIN_WORDS = 30
MAX_CHARS = 2000


def detect_language(text: str) -> str | None:
    try:
        return detect(text)
    except LangDetectException:
        return None


def truncate_text(text: str, max_chars: int = MAX_CHARS) -> str:
    if len(text) <= max_chars:
        return text
    truncated = text[:max_chars]
    last_space = truncated.rfind(" ")
    if last_space > 0:
        truncated = truncated[:last_space]
    return truncated + "..."


def classify_by_filename(filename: str) -> dict | None:
    name_lower = filename.lower()
    result: dict = {}

    if any(pat in filename for pat in ("DIN", "ISO", "AGMA")):
        result["doc_type"] = "norm"
        result["category"] = "Normen / ISO / DIN / AGMA / FVA"
    elif any(pat in name_lower for pat in ("bericht", "report")):
        result["doc_type"] = "bericht"
    elif any(pat in name_lower for pat in ("präsentation", "presentation")):
        result["doc_type"] = "präsentation"

    if "FVA" in filename and "category" not in result:
        result["category"] = "Normen / ISO / DIN / AGMA / FVA"

    return result if result else None


class ClassificationService:
    def __init__(self, ollama: OllamaClient):
        self.ollama = ollama

    async def classify(self, text: str, filename: str = "") -> ClassificationResult:
        word_count = len(text.split())

        if word_count < MIN_WORDS:
            filename_meta = classify_by_filename(filename)
            if filename_meta:
                return ClassificationResult(
                    doc_type=filename_meta.get("doc_type", "artikel"),
                    categories=[filename_meta["category"]] if "category" in filename_meta else [],
                    tags=[],
                    summary="",
                    title=filename,
                    authors=[],
                    confidence=0.3,
                )
            return ClassificationResult(
                doc_type="artikel",
                categories=[],
                tags=[],
                summary="",
                title=filename,
                authors=[],
                confidence=0.0,
            )

        truncated = truncate_text(text)
        prompt = build_prompt(truncated)
        schema = ClassificationResult.model_json_schema()

        try:
            raw = await self.ollama.generate(prompt, json_schema=schema)
            result = ClassificationResult.model_validate(raw)
            result.confidence = max(0.0, min(1.0, result.confidence))
            return result
        except Exception as exc:
            logger.error("Classification failed for '%s': %s", filename, exc)
            return ClassificationResult(
                doc_type="artikel",
                categories=[],
                tags=[],
                summary="",
                title=filename,
                authors=[],
                confidence=0.0,
            )

    def get_confidence_tier(self, confidence: float) -> str:
        if confidence >= CONFIDENCE_AUTO:
            return "auto"
        if confidence >= CONFIDENCE_REVIEW:
            return "needs-review"
        return "unclassified"

    async def classify_document(
        self, text: str, filename: str = ""
    ) -> tuple[ClassificationResult, str]:
        result = await self.classify(text, filename)
        tier = self.get_confidence_tier(result.confidence)
        return result, tier
