# Phase 5 Summary: Search & Filter API

## Status: COMPLETE

## What was built
1. **FTS5 query sanitizer** — Hyphens → spaces, special chars removed, terms quoted to prevent FTS5 operator conflicts, prefix variant for autocomplete
2. **SearchService** — FTS5 MATCH with BM25 ranking (title 10x, authors 5x, summary 2x, full_text 1x), snippet highlighting via snippet(), dynamic metadata filters, facet counts, pagination, total count
3. **Search API** — GET /api/search with all query/filter params, GET /api/search/facets for lightweight facet queries
4. **Saved searches CRUD** — POST/GET/GET-by-id/DELETE for /api/saved-searches (name + JSON filter state)
5. **Duplicate check** — GET /api/documents/duplicates?hash= returns matching documents by SHA-256

## Key files
- `backend/app/search/sanitizer.py` — FTS5 query sanitization
- `backend/app/search/service.py` — SearchService with FTS5, filters, facets
- `backend/app/search/router.py` — Search API + saved searches CRUD
- `backend/app/documents/router.py` — Added duplicates endpoint
- `backend/app/main.py` — Wired search router

## Deviations
None — plan executed as written.

## Verification
- Sanitizer handles hyphens, special chars, empty queries
- SearchService has correct dataclass structure
- All API routes registered (search, facets, saved-searches, duplicates)
- Server starts without errors
