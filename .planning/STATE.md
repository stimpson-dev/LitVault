# LitVault Project State

## Current Position
- **Phase**: 0 (Initialization complete)
- **Next Step**: `/gsd:plan-phase 1`
- **Milestone**: Pre-M1

## Completed
- [x] PROJECT.md created
- [x] config.json created (YOLO, Standard, Parallel)
- [x] Domain research completed (4 parallel researchers)
- [x] Research synthesized (STACK.md, FEATURES.md, PITFALLS.md)
- [x] REQUIREMENTS.md created (45 requirements)
- [x] ROADMAP.md created (7 phases, 3 milestones)
- [x] STATE.md initialized

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
