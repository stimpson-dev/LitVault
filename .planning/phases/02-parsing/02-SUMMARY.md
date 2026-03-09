# Phase 2 Summary: Document Parsing & Extraction

## Status: COMPLETE

## What was built
1. **Folder crawler** — Recursive scan with SHA-256 incremental detection, 60s timeout for network drives
2. **PDF thumbnail generator** — Page 1 → JPEG with aspect-ratio scaling, async with 10s timeout
3. **PDF parser** — pymupdf4llm extraction, per-page OCR detection (GlyphlessFont check), Tesseract fallback, German NFC normalization + hyphen rejoining
4. **DOCX parser** — python-docx extraction (paragraphs + tables)
5. **PPTX parser** — python-pptx extraction (slides → shapes → text)
6. **Parser dispatcher** — Routes by file_type to correct async parser
7. **IngestService** — Orchestrates crawl → parse → store pipeline with per-document commits
8. **REST API** — POST /api/crawl, GET /api/documents (paginated), GET /api/documents/{id}

## Key files
- `backend/app/ingest/crawler.py` — Folder scanning, SHA-256 hashing, incremental detection
- `backend/app/ingest/thumbnail.py` — PDF page 1 → JPEG
- `backend/app/ingest/parsers/pdf_parser.py` — PDF extraction + OCR
- `backend/app/ingest/parsers/office_parser.py` — DOCX/PPTX extraction
- `backend/app/ingest/parsers/__init__.py` — ParseResult dataclass + dispatcher
- `backend/app/ingest/parsers/models.py` — ParseResult (extracted to avoid circular import)
- `backend/app/ingest/service.py` — IngestService pipeline
- `backend/app/documents/router.py` — API endpoints

## Deviations
- ParseResult moved to `parsers/models.py` instead of inline in `__init__.py` to avoid circular imports (pdf_parser/office_parser importing from __init__ which imports them)

## Verification
- All imports resolve without errors
- German text normalization: "Zahn-\nrad" → "Zahnrad"
- Parser dispatcher maps pdf/docx/pptx correctly
- API routes: /api/crawl, /api/documents, /api/documents/{doc_id}
- Backend starts without errors
