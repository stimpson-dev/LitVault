import numpy as np

from app.search.embedding_service import build_embed_text, vector_to_blob, blob_to_vector


def test_build_embed_text_joins_fields():
    result = build_embed_text("Titel", "Zusammenfassung", "Volltext hier", max_chars=8000)
    assert result == "Titel\nZusammenfassung\nVolltext hier"


def test_build_embed_text_skips_missing_fields():
    assert build_embed_text(None, None, "nur text", max_chars=8000) == "nur text"
    assert build_embed_text("Titel", None, None, max_chars=8000) == "Titel"
    assert build_embed_text(None, None, None, max_chars=8000) == ""


def test_build_embed_text_truncates_full_text():
    result = build_embed_text("T", None, "x" * 10000, max_chars=100)
    assert result == "T\n" + "x" * 100


def test_vector_blob_roundtrip():
    vec = np.array([0.1, -0.5, 0.25], dtype=np.float32)
    blob = vector_to_blob(vec)
    assert isinstance(blob, bytes)
    restored = blob_to_vector(blob)
    assert restored.dtype == np.float32
    np.testing.assert_array_equal(restored, vec)


def test_vector_to_blob_casts_float64():
    vec = np.array([1.0, 2.0])  # float64
    restored = blob_to_vector(vector_to_blob(vec))
    assert restored.dtype == np.float32
    assert len(restored) == 2


def test_embedding_max_chars_default():
    from app.config import Settings
    assert Settings.model_fields["embedding_max_chars"].default == 8000
