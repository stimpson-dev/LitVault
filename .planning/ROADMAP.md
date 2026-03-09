# LitVault Roadmap

## Phase 1: Foundation & Database
**Goal**: Projektstruktur, DB-Schema, Config-System stehen. Backend startet und antwortet.

**Requirements**: REQ-037, REQ-038, REQ-039, REQ-043
**Success Criteria**:
- [ ] Monorepo-Struktur (backend/ + frontend/) erstellt
- [ ] uv-Projekt mit allen Dependencies
- [ ] SQLAlchemy Models für alle Tabellen (documents, tags, categories, etc.)
- [ ] FTS5 Virtual Table + Triggers via Alembic Migration
- [ ] WAL-Mode + Pragmas konfiguriert
- [ ] FastAPI App startet, Health-Endpoint antwortet
- [ ] Alembic Migration läuft durch
- [ ] Config.json wird geladen

---

## Phase 2: Document Parsing & Extraction
**Goal**: Dokumente aus Ordnern einlesen, Text+Metadaten extrahieren, in DB speichern.

**Requirements**: REQ-001 bis REQ-009
**Success Criteria**:
- [ ] Crawl-Service: rekursiv Ordner scannen, Dateimetadaten erfassen
- [ ] Inkrementeller Crawl: nur neue/geänderte Dateien (SHA-256)
- [ ] PDF-Extraktion via pymupdf4llm (Markdown-Output)
- [ ] DOCX/PPTX-Extraktion
- [ ] Per-Page OCR-Erkennung + Tesseract-Fallback
- [ ] Corrupted/encrypted File Handling (Review-Queue)
- [ ] Timeout-Protection (30s)
- [ ] Thumbnail-Generierung (PDF Seite 1)
- [ ] API-Endpoint: POST /api/crawl → startet Job
- [ ] Dokumente in DB mit Volltext + Metadaten gespeichert

---

## Phase 3: Background Workers & Progress
**Goal**: Asynchrone Job-Verarbeitung mit Fortschrittsanzeige.

**Requirements**: REQ-007, REQ-040, REQ-041
**Success Criteria**:
- [ ] asyncio.Queue Job-System mit JobType/JobStatus
- [ ] Worker-Coroutine in FastAPI Lifespan
- [ ] SSE-Endpoint: GET /api/jobs/{id}/progress
- [ ] Job-Store (in-memory) mit Status-Tracking
- [ ] Graceful Shutdown (queue.join + task cancel)
- [ ] File Watcher (watchfiles awatch) als Background Task
- [ ] Crawl → Parse → Queue-Pipeline funktioniert end-to-end

---

## Phase 4: AI Classification
**Goal**: Dokumente automatisch klassifizieren, taggen, zusammenfassen via Qwen/Ollama.

**Requirements**: REQ-010 bis REQ-018
**Success Criteria**:
- [ ] Ollama-Client (async) mit structured JSON output
- [ ] Dokumenttyp-Klassifikation (7 Typen)
- [ ] Kategorie-Vergabe aus 10er-Vokabular
- [ ] Tag-Generierung
- [ ] Kurzsummary-Generierung
- [ ] Titel/Autor/Jahr/Quelle-Extraktion
- [ ] Sprache-Erkennung (langdetect)
- [ ] Confidence-Tiers (auto/review/unclassified)
- [ ] Classification-Source tracking (ai/user/rule)
- [ ] Batch-Pipeline: Crawl → Parse → Classify → Store

---

## Phase 5: Search & Filter API
**Goal**: Volltextsuche + Metadaten-Filter als REST API.

**Requirements**: REQ-019 bis REQ-025
**Success Criteria**:
- [ ] GET /api/search?q=&filters= Endpoint
- [ ] FTS5 MATCH + Metadaten-Filter kombiniert
- [ ] BM25-Ranking mit Column-Weights (Titel 10x, Autoren 5x, Content 1x)
- [ ] Snippet-Highlighting via FTS5 snippet()
- [ ] Query-Sanitization (Bindestriche, Sonderzeichen)
- [ ] Pagination (offset-based)
- [ ] Facet Counts (Anzahl pro Kategorie/Typ/Jahr)
- [ ] Gespeicherte Suchen CRUD
- [ ] Duplikat-Check API (SHA-256)

---

## Phase 6: Frontend - Search UI
**Goal**: Professionelle Suchoberfläche mit React/shadcn/TanStack Table.

**Requirements**: REQ-028 bis REQ-036
**Success Criteria**:
- [ ] React + Vite + TailwindCSS + shadcn/ui Setup
- [ ] Suchfeld mit Cmd+K Shortcut (cmdk Command)
- [ ] Linke Filterspalte mit dynamischen Zählern
- [ ] Active Filter Chips mit Clear-All
- [ ] Trefferliste (TanStack Table): Titel, Autoren, Jahr, Typ-Badge, Tags, Snippet
- [ ] Ergebnisanzahl
- [ ] Detailansicht: PDF-Vorschau, Metadaten, Summary
- [ ] Thumbnail-Anzeige
- [ ] Vite Proxy → FastAPI in Development
- [ ] Production Build served by FastAPI StaticFiles

---

## Phase 7: Tagging, Favorites & Polish
**Goal**: Tagging-Workflow, Favoriten, Export, Review-Queue, File Watcher UI.

**Requirements**: REQ-026, REQ-027, REQ-033, REQ-034, REQ-035, REQ-036, REQ-042, REQ-045
**Success Criteria**:
- [ ] Tagging-Workflow: AI-Vorschläge → User bestätigt/korrigiert
- [ ] Review-Queue für niedrige AI-Confidence
- [ ] Dubletten-UI (Hash-Match → Merge-Dialog)
- [ ] Favoriten / Leseliste
- [ ] Export Trefferliste → CSV
- [ ] File Watcher Status in UI (aktiv/pausiert/Netzwerk-Problem)
- [ ] Embeddings werden gespeichert (nomic-embed-text-v1.5)
- [ ] Settings-Page (Watch-Ordner konfigurieren, Ollama-URL)
- [ ] Gespeicherte Suchen UI
- [ ] Job-Progress-Anzeige in UI (SSE Consumer)

---

## Milestones

| Milestone | Phases | Beschreibung |
|---|---|---|
| **M1: Backend Core** | 1-3 | DB, Parsing, Workers — Dokumente können gecrawlt und gespeichert werden |
| **M2: Intelligence** | 4-5 | AI-Klassifikation + Suche funktionieren end-to-end |
| **M3: Ship v1** | 6-7 | Frontend komplett, polish, ready to use |
