from app.classification.service import ClassificationService, CONFIDENCE_AUTO, CONFIDENCE_REVIEW


def _svc() -> ClassificationService:
    return ClassificationService(ollama=None)  # type: ignore[arg-type]

def test_tier_auto():
    assert _svc().get_confidence_tier(CONFIDENCE_AUTO) == "auto"
    assert _svc().get_confidence_tier(0.99) == "auto"

def test_tier_needs_review():
    assert _svc().get_confidence_tier(CONFIDENCE_REVIEW) == "needs-review"
    assert _svc().get_confidence_tier(0.7) == "needs-review"

def test_tier_unclassified():
    assert _svc().get_confidence_tier(0.54) == "unclassified"
    assert _svc().get_confidence_tier(0.0) == "unclassified"
