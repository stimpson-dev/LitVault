# Phase 7 Summary: Tagging, Favorites & Polish

## Status: COMPLETE

## What was built

### Backend APIs
1. **Favorites** — POST toggle + GET list (uses existing Favorite model)
2. **Tags CRUD** — GET/POST/DELETE per document, get-or-create pattern, source tracking (ai/user)
3. **Document PATCH** — Partial metadata update, sets classification_source="user"
4. **Settings API** — GET/PUT reading/writing config.json, clears lru_cache on update
5. **CSV Export** — GET /api/search/export returns StreamingResponse with text/csv

### Frontend Components
6. **FavoriteButton** — Heart toggle with optimistic state, stopPropagation for row clicks
7. **TagEditor** — Tag pills (AI=zinc, user=blue), add via Enter, remove via X
8. **ReviewQueue** — Lists docs with confidence < 0.85, confirm/edit actions
9. **DocumentDetail enhanced** — Inline editing (EditableCell), favorites, tags, source badge
10. **JobProgress** — SSE consumer, progress bar, 5s polling, job history toggle
11. **SavedSearches** — Save/load/delete, JSON serialization of query+filters
12. **SettingsPanel** — Modal with watch folders, Ollama URL/model, poll interval
13. **ExportButton** — CSV download via window.open
14. **Toolbar** — Action buttons bar (saved searches, review, export, settings)
15. **App.tsx final** — All components integrated, panel state management

## Key files
- `backend/app/documents/router.py` — Extended with favorites, tags, PATCH, duplicates
- `backend/app/search/router.py` — Added CSV export endpoint
- `backend/app/settings/router.py` — New settings API
- `backend/app/main.py` — Wired settings router
- `frontend/src/components/` — 8 new components, 2 modified
- `frontend/src/lib/api.ts` — 14 new API functions
- `frontend/src/lib/types.ts` — 5 new interfaces

## Deviations
- ReviewQueue uses client-side filtering of /api/documents (simpler than adding backend endpoint)
- FavoriteButton on ResultRow renders without initial favorited state (no favorited field in search response)

## Verification
- `npm run build` succeeds (265 KB JS, 34 KB CSS)
- All TypeScript types pass `tsc --noEmit`
- Backend imports verified
