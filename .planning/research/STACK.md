# LitVault Stack Decision Summary

## Final Stack (post-research)

| Layer | Technology | Rationale |
|---|---|---|
| **Backend** | Python 3.12+ / FastAPI | Async-native, best DX |
| **Package Manager** | uv | Faster than pip/poetry, modern standard |
| **Database** | SQLite + FTS5 (WAL mode) | Local-first, no server needed, handles 10k+ docs |
| **Vector Search** | sqlite-vec (v2) | Same DB file, no extra infrastructure |
| **ORM** | SQLAlchemy 2.x + aiosqlite | Async, Alembic-compatible |
| **Migrations** | Alembic (render_as_batch=True) | SQLite ALTER workaround |
| **PDF Parsing** | pymupdf4llm | Markdown output, auto-OCR, best quality |
| **DOCX** | python-docx | Standard |
| **PPTX** | python-pptx | Standard |
| **OCR** | Tesseract via pytesseract (deu+eng) | Local, free, adequate |
| **AI Classification** | Qwen3:8b via Ollama (local GPU) | Structured JSON output, NVIDIA accelerated |
| **Embeddings** | nomic-embed-text-v1.5 via sentence-transformers | 8192 token context, Matryoshka dims |
| **Frontend** | React + Vite + TailwindCSS | Modern, fast DX |
| **UI Components** | shadcn/ui + TanStack Table v8 | Tailwind-native, data-table ready |
| **File Watcher** | watchfiles (Rust-based) | Async-native, uvicorn dependency |
| **Background Jobs** | asyncio.Queue + worker coroutine | No Redis needed |
| **Progress** | SSE (StreamingResponse) | One-directional, browser-native reconnect |
| **Language Detection** | langdetect | Lightweight |

## Key Architecture Decisions
- External-content FTS5 table with triggers (no duplicate text storage)
- Single writer thread for SQLite (asyncio.Queue serializes writes)
- Embeddings in separate table as BLOB (migrate to sqlite-vec in v2)
- Frontend built by Vite, served by FastAPI StaticFiles in production
- Config via config.json + Pydantic Settings
