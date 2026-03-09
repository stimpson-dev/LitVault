# Phase 6 Summary: Frontend — Search UI

## Status: COMPLETE

## What was built
1. **API client & types** — TypeScript interfaces matching backend (SearchDocument, SearchFilters, SearchFacets, SearchResponse, DocumentDetail), fetch-based API client (searchDocuments, getDocument, getFacets)
2. **useSearch hook** — Debounced (300ms) search with query/filters/offset state, calls searchDocuments API
3. **SearchBar** — Prominent search input with Ctrl+K focus shortcut, result count display
4. **ResultsList + ResultRow** — Document list with title/authors/year, doc_type colored badges, file type icons, `<mark>` snippet highlighting, "Mehr laden" pagination
5. **FilterSidebar** — Left panel with facet counts for categories, document types, years. Toggle selection, German labels
6. **FilterChips** — Removable active filter pills with "Alle Filter löschen" clear-all
7. **DocumentDetail** — Right panel showing metadata grid (authors, year, type, source, language, file size, confidence tier), summary, file path
8. **App.tsx layout** — 3-column layout: FilterSidebar (left, w-72), Results (center, flex-1), DocumentDetail (right, w-400, conditional)

## Key files
- `frontend/src/lib/types.ts` — TypeScript interfaces
- `frontend/src/lib/api.ts` — API client functions
- `frontend/src/hooks/useSearch.ts` — Search hook with debounce
- `frontend/src/components/SearchBar.tsx` — Search input + Ctrl+K
- `frontend/src/components/ResultRow.tsx` — Single result row
- `frontend/src/components/ResultsList.tsx` — Results list + pagination
- `frontend/src/components/FilterSidebar.tsx` — Facet filter sidebar
- `frontend/src/components/FilterChips.tsx` — Active filter chips
- `frontend/src/components/DocumentDetail.tsx` — Document detail panel
- `frontend/src/App.tsx` — Main layout wiring all components

## Deviations
- shadcn `input` and `badge` components installed as prerequisites
- DocumentDetail type import aliased as `DocumentDetailType` to avoid name clash with the component

## Verification
- `npx tsc --noEmit` passes with zero errors
- `npm run build` succeeds (241 KB JS, 29 KB CSS)
- All components use named exports and consistent dark zinc theme
