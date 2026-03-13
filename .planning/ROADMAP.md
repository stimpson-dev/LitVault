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
- [x] Per-Page OCR-Erkennung + EasyOCR GPU-Fallback (Text-Qualitätsprüfung)
- [ ] Corrupted/encrypted File Handling (Review-Queue)
- [x] Timeout-Protection (600s, konfigurierbar)
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

## Phase 8: Search & Scan Improvements
**Goal**: Echtzeit-Suche, Metadaten ohne AI, erweiterte Filter, Re-Scan fehlgeschlagener Dokumente.

**Success Criteria**:
- [x] Prefix-Matching: "Zahnr" findet "Zahnrad" während des Tippens
- [x] Dateinamen-basierte Metadaten (Titel, Jahr, Typ) als Fallback ohne AI
- [x] Erweiterte Filter: Dateityp, Größe, Status, Upload-Datum
- [x] Error-Dokumente können einzeln oder in Batch erneut gescannt werden
- [x] Facet-Zähler für neue Filtertypen

**Plans**:
- 08-01: Echtzeit-Suche mit Prefix-Matching
- 08-02: Metadaten aus Dateinamen extrahieren (ohne AI)
- 08-03: Erweiterte Filter in der Suchmaske
- 08-04: Re-Scan fehlgeschlagener Dokumente
- 08-05: Nachträglicher gezielter AI-Scan (einzeln + batch)

**Waves**:
- Wave 1: 08-01, 08-02 (unabhängig)
- Wave 2: 08-03 (braucht Backend-Filter von 08-01)
- Wave 3: 08-04, 08-05 (parallel, unabhängig voneinander)

---

---

## Phase 9: App Shell + Sidebar Redesign
**Goal**: Persistent app shell with collapsible sidebar, client-side routing, saved views as first-class navigation.

**Success Criteria**:
- [ ] App renders with persistent sidebar + top navbar surviving page navigation
- [ ] Sidebar collapses to 50px icon rail (slim mode) with smooth animation
- [ ] Client-side routing: /, /dashboard, /documents/:id, /view/:id routes
- [ ] Saved searches appear as clickable sidebar nav items
- [ ] Recently opened documents tracked in sidebar
- [ ] All sidebar sections collapsible with persisted state
- [ ] Mobile: sidebar as full-width drawer

**Plans**:
- 09-01: Router setup + AppShell + AppNavbar + AppSidebar (slim mode)
- 09-02: Saved views in sidebar + recently opened docs + collapsible sections

**Waves**:
- Wave 1: 09-01 (foundation)
- Wave 2: 09-02 (depends on 09-01)

---

## Phase 10: Document List Upgrade
**Goal**: Three display modes, horizontal filter bar with include/exclude logic, bulk editor, click-to-filter.

**Success Criteria**:
- [ ] 3 display modes: table / small cards / large cards with toolbar toggle
- [ ] Sticky horizontal filter bar with filterable dropdown popovers
- [ ] Each filter dropdown: searchable list, document counts, include/exclude/none toggle
- [ ] Filter state reflected in URL query params (bookmarkable)
- [ ] Bulk editor bar swaps with filter bar when documents selected
- [ ] Click-to-filter on all metadata badges (doc_type, tag, year, author, file_type)
- [ ] Sort controls in toolbar (field + direction)
- [ ] Hover-reveal card actions on all card types
- [ ] Search relevance score visualization bar

**Plans**:
- 10-01: DocumentToolbar + 3 display modes + LargeCard + hover actions + relevance bar
- 10-02: FilterBar + FilterDropdown (include/exclude) + URL sync + replace FilterSidebar
- 10-03: BulkEditor bar + click-to-filter on metadata badges

**Waves**:
- Wave 1: 10-01, 10-02 (independent)
- Wave 2: 10-03 (depends on 10-01 + 10-02)

---

## Phase 11: Document Detail Redesign
**Goal**: Full-page split-pane detail with tabbed form + inline PDF viewer, keyboard shortcuts, navigation flow.

**Success Criteria**:
- [ ] /documents/:id renders split-pane: left tabs (40%) + right PDF viewer (60%)
- [ ] Tabs: Details (inline edit), Content (full text), Metadata, Notes
- [ ] PDF viewer with page navigation and zoom
- [ ] Keyboard shortcuts: Ctrl+S save, Escape close, Ctrl+Arrow navigate
- [ ] Save & Next / Save & Close navigation flow
- [ ] "More like this" button searches similar documents
- [ ] Opens tracked in sidebar "Recently Opened"
- [ ] Mobile: PDF viewer becomes a tab

**Plans**:
- 11-01: DocumentDetailPage split-pane + tabs + PDF viewer
- 11-02: Keyboard shortcuts + Save & Next + More like this + recent docs integration

**Waves**:
- Wave 1: 11-01 (foundation)
- Wave 2: 11-02 (depends on 11-01)

---

## Phase 12: Dashboard + Polish
**Goal**: Dashboard with draggable widgets, shared UI components, skeleton loading, enriched toasts.

**Success Criteria**:
- [ ] /dashboard renders stats widget + draggable saved view widgets
- [ ] Stats: total docs, status breakdown, file type stacked bar, needs_ai/ocr badges
- [ ] Saved view widgets show top 5 documents per view
- [ ] Drag-and-drop reorders widgets (persisted)
- [ ] PageHeader component on all pages
- [ ] Skeleton loading replaces spinners throughout
- [ ] Toast notifications with collapsible error details
- [ ] Consistent styling/spacing across all pages

**Plans**:
- 12-01: DashboardPage + StatsWidget + FileTypeBar + SavedViewWidget + drag-and-drop
- 12-02: PageHeader + Skeleton + enriched Toast + WidgetFrame + final polish

**Waves**:
- Wave 1: 12-01 (dashboard core)
- Wave 2: 12-02 (polish, depends on all prior phases)

---

## Milestones

| Milestone | Phases | Beschreibung |
|---|---|---|
| **M1: Backend Core** | 1-3 | DB, Parsing, Workers — Dokumente können gecrawlt und gespeichert werden |
| **M2: Intelligence** | 4-5 | AI-Klassifikation + Suche funktionieren end-to-end |
| **M3: Ship v1** | 6-7 | Frontend komplett, polish, ready to use |
| **M4: Improvements** | 8 | Suche, Filter, Metadaten, Re-Scan |
| **M5: UI Redesign** | 9-12 | Paperless-ngx-inspired redesign: app shell, filter bar, split detail, dashboard |
