---
phase: 01-foundation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/pyproject.toml
  - backend/app/__init__.py
  - backend/app/documents/__init__.py
  - backend/app/search/__init__.py
  - backend/app/workers/__init__.py
  - backend/app/ai/__init__.py
  - backend/app/jobs/__init__.py
  - frontend/package.json
  - frontend/vite.config.ts
  - frontend/tsconfig.json
  - frontend/src/main.tsx
  - frontend/src/App.tsx
  - frontend/index.html
  - frontend/tailwind.config.js
  - frontend/postcss.config.js
  - config.json
  - .gitignore
autonomous: true
user_setup: []

must_haves:
  truths:
    - "uv sync installs all Python dependencies without errors"
    - "npm install installs all frontend dependencies without errors"
    - "Project directory structure matches monorepo layout"
  artifacts:
    - backend/pyproject.toml
    - backend/app/__init__.py
    - frontend/package.json
    - frontend/vite.config.ts
    - config.json
    - .gitignore
  key_links:
    - "pyproject.toml lists all required backend dependencies"
    - "vite.config.ts proxies /api to backend port 8000"
---

<objective>
Scaffold the LitVault monorepo with backend (Python/uv) and frontend (React/Vite/Tailwind) projects, install all dependencies, and create the directory structure.

Purpose: Establish the project foundation so all subsequent plans can build on a working environment.
Output: Complete monorepo skeleton with all dependencies installed.
</objective>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/research/STACK.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create backend project with uv and all dependencies</name>
  <files>
    backend/pyproject.toml
    backend/app/__init__.py
    backend/app/documents/__init__.py
    backend/app/search/__init__.py
    backend/app/workers/__init__.py
    backend/app/ai/__init__.py
    backend/app/jobs/__init__.py
  </files>
  <action>
  1. Create backend/ directory
  2. Run `uv init` in backend/
  3. Create pyproject.toml with these dependencies:
     - fastapi>=0.115
     - uvicorn[standard]
     - sqlalchemy[asyncio]>=2.0
     - aiosqlite
     - alembic
     - pydantic-settings
     - pymupdf4llm
     - python-docx
     - python-pptx
     - pytesseract
     - langdetect
     - sentence-transformers
     - ollama
     - watchfiles
     - openpyxl (for Excel export)
  4. Run `uv sync` to install
  5. Create empty __init__.py files in all app/ subdirectories:
     app/, app/documents/, app/search/, app/workers/, app/ai/, app/jobs/
  </action>
  <verify>
  Run `cd backend && uv sync` — must complete without errors.
  Run `uv run python -c "import fastapi; import sqlalchemy; import pymupdf4llm; print('OK')"` — must print OK.
  </verify>
  <done>All Python dependencies installed, all module directories exist with __init__.py</done>
</task>

<task type="auto">
  <name>Task 2: Create frontend project with React, Vite, Tailwind, shadcn/ui</name>
  <files>
    frontend/package.json
    frontend/vite.config.ts
    frontend/tsconfig.json
    frontend/src/main.tsx
    frontend/src/App.tsx
    frontend/index.html
    frontend/tailwind.config.js
    frontend/postcss.config.js
  </files>
  <action>
  1. Run `npm create vite@latest frontend -- --template react-ts` in the project root
  2. cd frontend && npm install
  3. Install Tailwind: `npm install -D tailwindcss @tailwindcss/vite`
  4. Configure tailwind in vite.config.ts (import @tailwindcss/vite plugin)
  5. Add Tailwind directives to src/index.css: @import "tailwindcss"
  6. Configure vite.config.ts with proxy: /api → http://localhost:8000
  7. Replace App.tsx with a minimal "LitVault" placeholder
  8. Run `npx shadcn@latest init` — select: New York style, Zinc color, CSS variables yes
  9. Install TanStack Table: `npm install @tanstack/react-table`
  </action>
  <verify>
  Run `cd frontend && npm run build` — must complete without errors.
  Verify vite.config.ts has proxy configuration for /api.
  </verify>
  <done>Frontend builds successfully, Tailwind + shadcn/ui + TanStack Table installed</done>
</task>

<task type="auto">
  <name>Task 3: Create config.json and .gitignore</name>
  <files>
    config.json
    .gitignore
  </files>
  <action>
  1. Create config.json in project root:
     ```json
     {
       "watch_folders": [],
       "ollama_url": "http://localhost:11434",
       "ollama_model": "qwen3:8b",
       "embedding_model": "nomic-ai/nomic-embed-text-v1.5",
       "db_path": "litvault.db",
       "thumbnails_dir": "thumbnails",
       "log_level": "INFO",
       "poll_interval_seconds": 10
     }
     ```
  2. Create .gitignore with:
     - Python: __pycache__, *.pyc, .venv, *.egg-info
     - Node: node_modules/, dist/
     - SQLite: *.db, *.db-wal, *.db-shm
     - Thumbnails: thumbnails/
     - IDE: .vscode/, .idea/
     - OS: .DS_Store, Thumbs.db
     - Env: .env
  </action>
  <verify>Verify config.json is valid JSON. Verify .gitignore exists.</verify>
  <done>config.json with all settings, .gitignore covers all generated files</done>
</task>

</tasks>

<verification>
1. `cd backend && uv run python -c "import fastapi; print('backend OK')"` → prints "backend OK"
2. `cd frontend && npm run build` → builds without errors
3. All directories exist: backend/app/{documents,search,workers,ai,jobs}/
4. config.json is valid JSON
5. .gitignore exists
</verification>

<success_criteria>
- uv sync succeeds with all dependencies
- npm install + npm run build succeeds
- Monorepo structure matches planned layout
- config.json loadable
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundation/01-01-SUMMARY.md`
</output>
