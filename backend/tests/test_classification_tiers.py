from app.classification.service import ClassificationService, CONFIDENCE_AUTO, CONFIDENCE_REVIEW, truncate_text


def _svc() -> ClassificationService:
    return ClassificationService(ollama=None)

def test_tier_auto():
    assert _svc().get_confidence_tier(CONFIDENCE_AUTO) == "auto"
    assert _svc().get_confidence_tier(0.99) == "auto"

def test_tier_needs_review():
    assert _svc().get_confidence_tier(CONFIDENCE_REVIEW) == "needs-review"
    assert _svc().get_confidence_tier(0.7) == "needs-review"

def test_tier_unclassified():
    assert _svc().get_confidence_tier(0.54) == "unclassified"
    assert _svc().get_confidence_tier(0.0) == "unclassified"

def test_truncate_respects_max_chars():
    text = "wort " * 1000
    out = truncate_text(text, max_chars=100)
    assert len(out) <= 104  # 100 + "..."

def test_service_uses_configured_max_chars():
    svc = ClassificationService(ollama=None, max_chars=500)  # type: ignore[arg-type]
    assert svc.max_chars == 500
