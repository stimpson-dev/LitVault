# LitVault Project State

## Current Position
- **Phase**: 9 (App Shell + Sidebar Redesign) — COMPLETE
- **Next Step**: Execute Phase 10 (Document List Upgrade) — Wave 1: 10-01 + 10-02 in parallel
- **Milestone**: M3 COMPLETE, M4 COMPLETE, M5 IN PROGRESS (Phase 9 done, Phases 10-12 remaining)

## Milestone M5: UI Redesign (Phases 9-12)
Inspired by paperless-ngx patterns. Four phases:
- Phase 9: App Shell + Sidebar — COMPLETE
  - 09-01: Router + AppShell + AppNavbar + AppSidebar (slim mode, mobile drawer)
  - 09-02: SavedViewNav + RecentDocuments + collapsible sections
- Phase 10: Document List (3 display modes, horizontal filter bar, bulk editor, click-to-filter)
- Phase 11: Document Detail (split-pane + PDF viewer, keyboard shortcuts, Save & Next)
- Phase 12: Dashboard + Polish (stats widgets, drag-and-drop, skeleton loading, enriched toasts)

## Completed
- [x] PROJECT.md created
- [x] config.json created (YOLO, Standard, Parallel)
- [x] Domain research completed (4 parallel researchers)
- [x] Research synthesized (STACK.md, FEATURES.md, PITFALLS.md)
- [x] REQUIREMENTS.md created (45 requirements)
- [x] ROADMAP.md created (7 phases, 3 milestones)
- [x] STATE.md initialized
- [x] Phase 1 executed: Foundation & Database
  - Plan 01: Monorepo scaffolding (uv, React/Vite/Tailwind/shadcn)
  - Plan 02: Pydantic Settings config system
  - Plan 03: SQLAlchemy models, FTS5, Alembic migrations, 10 seed categories
  - Plan 04: FastAPI app with lifespan, health endpoint, CORS
- [x] Phase 2 executed: Document Parsing & Extraction
  - Plan 01: Folder crawler + SHA-256 incremental + thumbnails
  - Plan 02: PDF parser (pymupdf4llm + OCR), DOCX/PPTX parsers
  - Plan 03: IngestService pipeline + REST API (crawl, documents)
- [x] Phase 3 executed: Background Workers & Progress
  - Plan 01: Job models, JobStore, worker coroutine, progress callback
  - Plan 02: SSE endpoint, file watcher, lifespan wiring, async crawl refactor
- [x] Phase 4 executed: AI Classification
  - Plan 01: Ollama client, classification schemas/prompt, ClassificationService
  - Plan 02: Pipeline integration (IngestService + Worker CLASSIFY jobs)
- [x] Phase 5 executed: Search & Filter API
  - Plan 01: FTS5 query sanitizer, SearchService (BM25, snippets, filters, facets)
  - Plan 02: Search API, saved searches CRUD, duplicate check
- [x] Phase 6 executed: Frontend — Search UI
  - Plan 01: API client, types, useSearch hook, SearchBar, ResultsList
  - Plan 02: FilterSidebar with facets, FilterChips
  - Plan 03: DocumentDetail panel, App.tsx 3-column layout
- [x] Phase 7 executed: Tagging, Favorites & Polish
  - Plan 01: Backend APIs (favorites, tags, PATCH, settings, CSV export) + frontend API/types
  - Plan 02: TagEditor, FavoriteButton, ReviewQueue, enhanced DocumentDetail
  - Plan 03: JobProgress SSE, SavedSearches, SettingsPanel, ExportButton
  - Plan 04: Toolbar + final App.tsx integration

## Phase 8 Progress
- [x] 08-01: Echtzeit-Suche mit Prefix-Matching (already in FTS5 sanitizer)
- [x] 08-02: Metadaten aus Dateinamen extrahieren (filename_extractor.py)
- [x] 08-03: Erweiterte Filter in der Suchmaske (file_size, created_at filters + FilterSidebar Dateigröße section + FilterChips)
- [x] 08-04: Re-Scan fehlgeschlagener Dokumente (rescan-all-errors endpoint + Dashboard button)
- [x] 08-05: Nachträglicher gezielter AI-Scan (classify batch + rescan-no-text endpoints)

## Additional Improvements (outside Phase 8)
- [x] EasyOCR GPU fallback mit Text-Qualitätserkennung (letter ratio ≥15%)
- [x] Ollama /api/chat mit think:false für qwen3 Kompatibilität
- [x] Konfigurierbares LLM-Modell (qwen3:4b default) und num_ctx (4096 default)
- [x] PDF Parse-Timeout erhöht auf 600s (konfigurierbar via parse_timeout_seconds)
- [x] page_count in Document-Modell und Detail-Ansicht
- [x] Dashboard-Panel (StatsPanel) mit Statistiken und Batch-Aktionen
- [x] Jobs-Panel als Toolbar-Dropdown mit SSE-Progress
- [x] Redesign StatsPanel + JobProgress (Glassmorphism)
- [x] ThemeToggle (Dark/Light)
- [x] start.bat nutzt .venv für CUDA torch + easyocr

## Key Decisions
- Stack: FastAPI + React + SQLite/FTS5 + Ollama/Qwen3
- pymupdf4llm for PDF extraction (not raw PyMuPDF)
- EasyOCR (de+en, GPU) als OCR-Fallback bei schlechter Textqualität
- qwen3:4b als Standard-LLM (2.5GB, passt in 8GB VRAM)
- nomic-embed-text-v1.5 for embeddings (not MiniLM)
- shadcn/ui + TanStack Table for frontend
- watchfiles for file monitoring (not watchdog)
- asyncio.Queue for background jobs (no Redis)
- SSE for progress reporting
- uv for Python package management

## Architecture Notes
- Monorepo: backend/ + frontend/
- External-content FTS5 with triggers
- Single writer thread (asyncio.Queue serializes)
- Embeddings as BLOB → sqlite-vec in v2
- Frontend built by Vite, served by FastAPI in production

## Pitfalls to Remember
- WAL mode + timeout=30 on every connection
- Per-page OCR detection: _text_quality() < 0.15 triggers OCR (not just text length)
- pymupdf4llm can extract garbage text (◆◆◆) — always check quality before accepting
- FTS5 query sanitization (hyphens!)
- PDF parse timeout: 600s default (konfigurierbar), nötig für OCR auf 200+ Seiten
- qwen3 models need think:false and num_ctx limit (default 262k → huge KV cache on 8GB VRAM)
- SQLAlchemy create_all() doesn't add columns to existing tables — use ALTER TABLE
- Windows long paths (registry key)
- Ollama structured output (JSON schema with fallback to plain "json")
- German text: NFC normalize + hyphen rejoining
- start.bat must use .venv/Scripts/python (not uv run) for CUDA torch
