# Phase 1 Summary: Foundation & Database

## Status: COMPLETE

## What was built
1. **Monorepo structure** — `backend/` (Python/uv) + `frontend/` (React/Vite/Tailwind)
2. **Backend dependencies** — FastAPI, SQLAlchemy, pymupdf4llm, Ollama, sentence-transformers, etc.
3. **Frontend setup** — React + Vite + TailwindCSS v4 + shadcn/ui + TanStack Table
4. **Config system** — Pydantic Settings loading from `config.json` with `JsonConfigSettingsSource`
5. **Database models** — 8 SQLAlchemy models (Document, Tag, Category, DocumentTag, DocumentCategory, SavedSearch, Favorite, Embedding)
6. **FTS5 search index** — External content table with 3 sync triggers (INSERT/UPDATE/DELETE)
7. **Alembic migrations** — Initial migration with all tables, FTS5, triggers, 10 seed categories
8. **FastAPI app** — Lifespan handler, health endpoint, CORS, static files mount

## Key files
- `backend/app/main.py` — FastAPI app entry point
- `backend/app/config.py` — Pydantic Settings
- `backend/app/database.py` — SQLAlchemy async engine with WAL pragmas
- `backend/app/documents/models.py` — All ORM models
- `backend/app/deps.py` — FastAPI dependency injection
- `backend/alembic/versions/001_initial_schema.py` — Initial migration
- `frontend/vite.config.ts` — Vite config with Tailwind + API proxy

## Deviations
- uv was not pre-installed → installed via `pip install uv`
- Vite created an embedded .git in frontend/ → removed before commit
- shadcn/ui required explicit path alias in tsconfig before init
- pydantic-settings `json_file` in model_config is silently ignored → used `settings_customise_sources` override

## Verification
- `uv run uvicorn app.main:app` starts without errors
- `GET /api/health` returns `{"status": "ok", "service": "litvault"}`
- DB auto-created on startup with all 8 tables
- `npm run build` succeeds for frontend
