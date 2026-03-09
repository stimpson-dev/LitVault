# LitVault Project State

## Current Position
- **Phase**: 6 (Frontend — Search UI) — COMPLETE
- **Next Step**: `/gsd:plan-phase 7`
- **Milestone**: M2 COMPLETE (Phases 4-5 done), M3 in progress

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

## Key Decisions
- Stack: FastAPI + React + SQLite/FTS5 + Ollama/Qwen3
- pymupdf4llm for PDF extraction (not raw PyMuPDF)
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
- Per-page OCR detection before extraction
- FTS5 query sanitization (hyphens!)
- File operation timeouts (30s max)
- Windows long paths (registry key)
- Ollama structured output (JSON schema)
- German text: NFC normalize + hyphen rejoining
