"""
Route-existence tests for documents API (Task 22).

These tests verify that all 20+ document-related routes are registered
in the FastAPI app — no DB access needed.
"""
from app.main import app

EXPECTED_PATHS = [
    "/api/stats",
    "/api/crawl",
    "/api/documents",
    "/api/documents/duplicates",
    "/api/documents/{doc_id}/similar",
    "/api/documents/{doc_id}",
    "/api/documents/{doc_id}/thumbnail",
    "/api/documents/{doc_id}/file",
    "/api/documents/{doc_id}/open-folder",
    "/api/documents/{doc_id}/open",
    "/api/documents/{doc_id}/classify",
    "/api/documents/classify-batch",
    "/api/documents/embed-batch",
    "/api/documents/{doc_id}/rescan",
    "/api/documents/rescan-errors",
    "/api/documents/rescan-no-text",
    "/api/documents/exclude-batch",
    "/api/documents/{doc_id}/restore",
    "/api/documents/{doc_id}/favorite",
    "/api/favorites",
    "/api/documents/{doc_id}/tags",
    "/api/documents/{doc_id}/tags/{tag_id}",
]


def test_all_document_routes_exist():
    openapi_paths = set(app.openapi()["paths"].keys())
    missing = [p for p in EXPECTED_PATHS if p not in openapi_paths]
    assert not missing, f"Fehlende Routen: {missing}"
