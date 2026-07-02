# LitVault: Performance-Optimierung + struktureller Umbau

**Datum:** 2026-07-02
**Status:** Freigegeben (Ansatz B — struktureller Umbau)
**Scope:** Housekeeping, Test-Fundament, Such-Performance, Ingest-Parallelisierung, LLM-Update, Router-Refactoring. Semantische Suche (Embeddings) ist explizit **ausgeklammert** und wird ein eigenes Folgepaket; Tabelle `embeddings` und Dependency `sentence-transformers` bleiben dafür bestehen.

## Kontext & Motivation

LitVault (FastAPI + React 19 + SQLite/FTS5 + Ollama) ist funktional komplett (Milestones M3–M5), aber dem Nutzer zu langsam — in allen drei Bereichen: Suche/Oberfläche, Ingest/Crawling und KI-Klassifikation. Zusätzlich Altlasten aus dem M5-Redesign (Dead Code, Lint-Fehler, doppeltes Dependency-/Schema-Management) und ein veraltetes LLM (`qwen3:4b`, Generation von vor zwei Releases).

**Bestand:** 2.093 Dokumente (1.962 PDF), DB 243 MB. Hardware: RTX 2000 Ada Laptop, 8 GB VRAM.

## Gemessene / belegte Befunde

| # | Befund | Beleg |
|---|--------|-------|
| 1 | Rohe FTS5-Query ist schnell (1,6 ms) — die DB ist nicht das Problem | Direktmessung |
| 2 | Browse ohne Suchbegriff (Standardfall) macht `SELECT d.*` inkl. `full_text` → ~10 MB JSON pro Seitenaufruf bei 100 Ergebnissen | `search/service.py:160` |
| 3 | 7 sequenzielle DB-Queries pro Suchanfrage (Select, Count, 5× Facetten); jede Facette wiederholt die FTS-MATCH-Subquery; läuft bei jedem Tastendruck und bei `loadMore` | `search/service.py:189`, `useSearch.ts` |
| 4 | Ingest strikt seriell: parse → thumbnail → commit pro Dokument nacheinander; ein OCR-PDF blockiert alles | `ingest/service.py:134` |
| 5 | `pymupdf4llm.to_markdown` parst immer das ganze Dokument (langsamster PyMuPDF-Modus) | `pdf_parser.py:105` |
| 6 | Batch-Klassifikation seriell, ein Ollama-Request nach dem anderen | `jobs/worker.py:80` |
| 7 | Nur die ersten 2.000 Zeichen gehen ins LLM (`MAX_CHARS = 2000`) — Qualitätsdeckel unabhängig vom Modell | `classification/service.py:13` |
| 8 | `num_predict: 2048` für ein kleines Metadaten-JSON | `ollama_client.py:23` |
| 9 | Dead Code: `DocumentDetail.tsx`, `FilterSidebar.tsx`, `Toolbar.tsx`, `FavoritesSidebar.tsx` (~1.100 Zeilen, nirgends importiert) | Import-Analyse |
| 10 | 10 ESLint-Fehler, 4 Warnungen; `tsc -b` sauber | `npm run lint` |
| 11 | Keine Tests, keine CI | Repo-Scan |
| 12 | Doppeltes Schema-Management: Alembic (nur `001_initial_schema`) + `create_all`/`ensure_columns()` im Lifespan | `main.py:27` |
| 13 | Doppeltes Dependency-Management: `requirements.txt` + `pyproject.toml`; `uv.lock` in `.gitignore` | Repo-Scan |
| 14 | `embeddings`-Tabelle: 0 Zeilen — Feature nie gebaut | Direktmessung |

## LLM-Recherche (Stand Juli 2026)

Für 8 GB VRAM gibt es in den neuesten Familien (Qwen 3.6, Gemma 4 dense, Phi-4 14B) keine passenden Varianten — Qwen 3.6 existiert nur ab 27B. Sweet Spot laut mehreren Quellen: **Qwen3.5:9b** (6,6 GB, bereits installiert, läuft komplett in VRAM). Schnellere Alternative: **Qwen3.5:4b** (gleiche Generation, deutlich besser als das alte `qwen3:4b`). Optionaler dritter Kandidat: Gemma 4 E4B (MoE). Entscheidung fällt per Benchmark (AP6), nicht per Bauchgefühl.

## Arbeitspakete (Reihenfolge = Ausführungsreihenfolge)

### AP1 — Housekeeping
- Dead Code löschen: `DocumentDetail.tsx`, `FilterSidebar.tsx`, `Toolbar.tsx`, `FavoritesSidebar.tsx` (vor dem Löschen Import-Freiheit erneut verifizieren)
- 10 ESLint-Fehler beheben: `react-refresh/only-export-components` (cva-Varianten aus `badge.tsx`/`button.tsx` in eigene Dateien, i18n-Hook aus `context.tsx` trennen), `set-state-in-effect` in `DateRangeFilter.tsx:20`
- `config.json`: getracktes `config.example.json` (neutrale Defaults) + reales `config.json` in `.gitignore`; Backend-Fallback prüfen
- `uv.lock` aus `.gitignore` nehmen und versionieren; `requirements.txt` löschen
- Offenen Git-Stand (config.json halb gestaged, STATUS.md untracked) sauber committen

### AP2 — Test-Fundament (Backend)
- `pytest`, `pytest-asyncio`, `httpx` als dev-dependencies
- Tests: FTS5-Sanitizer (pure function, Property-artige Fälle inkl. Sonderzeichen), SearchService gegen Temp-SQLite mit FTS5 (Filter-Kombinationen, leere Query, Sortierung), `filename_extractor`, Confidence-Tier-Logik
- Frontend bleibt bei `tsc` + `eslint` (vitest = eigenes Folgepaket)

### AP3 — Alembic konsequent
- Ist-Schema als Migrations-Basis einfrieren (Stamp/Baseline-Migration)
- `create_all` + `ensure_columns()`/`ensure_fts5()` aus dem Lifespan entfernen; FTS5-Setup in Migration überführen
- Startup führt `alembic upgrade head` programmatisch aus (Verhalten für Nutzer unverändert)
- Muss vor AP4, weil neue Indizes als Migration kommen

### AP4 — Such-Performance (größter UI-Hebel)
- Browse-Zweig: explizite Spaltenliste **ohne `full_text`** (identisch zum FTS-Zweig)
- Facetten: 5 Einzelqueries → eine `UNION ALL`-Query mit gemeinsamer CTE für FTS-Match-IDs
- Facetten-Cache: In-Memory mit Generation-Counter; Ingest/Dokument-Updates inkrementieren die Generation → Cache-Miss
- `include_facets`-Parameter im Search-API; `loadMore` im Frontend fordert keine Facetten mehr an
- Index-Migration für `created_at`, `year`, `doc_type`, `file_type`, `processing_status` — nur die, die `EXPLAIN QUERY PLAN` rechtfertigt
- Messung vorher/nachher: Payload-Größe und Server-Zeit für Browse + typische Suchen

### AP5 — Ingest-Parallelisierung
- Parse-Phase: Semaphore-begrenzte Parallelität (konfigurierbar, Default 3) via `asyncio.to_thread`; Thumbnails parallel dazu
- **DB-Writer-Pattern:** genau ein Schreiber-Task konsumiert Parse-Ergebnisse aus einer `asyncio.Queue` → respektiert SQLite-Single-Writer und Session-Thread-Safety
- OCR-Lock: globaler EasyOCR-Reader ist nicht thread-safe; OCR-Aufrufe serialisieren (GPU ist ohnehin seriell)
- Multi-Worker-Jobsystem: N Worker-Tasks statt einem; Regeln: CRAWL exklusiv pro Ordner, CLASSIFY darf parallel zu CRAWL laufen
- Messpunkt `pymupdf4llm` vs. plain `page.get_text()`: wenn Markdown-Modus dominiert, wird der Extraktions-Modus konfigurierbar (Default dann plain, Markdown opt-in)
- Messung: Durchsatz (Dokumente/Minute) an einem Testordner vorher/nachher

### AP6 — Klassifikation: Modell + Tempo + Qualität
- Benchmark-Skript (`backend/scripts/benchmark_llm.py`): ~20 repräsentative Dokumente aus der echten DB; Kandidaten `qwen3:4b` (Ist), `qwen3.5:4b`, `qwen3.5:9b`; Metriken: Sekunden/Dokument, Feld-Ausfüllungsgrad (title/authors/year/doc_type/summary), Stichproben-Qualität
- `MAX_CHARS` konfigurierbar (`classification_max_chars`); Benchmark 2.000 vs. 6.000 Zeichen (bei 6.000: `num_ctx` 8192 nötig)
- `num_predict` 2048 → 512
- Batch-Klassifikation mit Parallelität 2 (konfigurierbar; `OLLAMA_NUM_PARALLEL` dokumentieren)
- Modell-Default in `config.example.json` nach Benchmark-Ergebnis setzen; Entscheidung mit Zahlen im Commit dokumentieren

### AP7 — Router-Refactoring
- `documents/router.py` (607 Zeilen, 24 Endpoints) → Logik in `documents/service.py` (`DocumentService`); drei schlanke Router: CRUD/Listing, Datei-Operationen (thumbnail/file/open/open-folder), Aktionen (classify/rescan/exclude/restore/favorites/tags)
- Keine API-Änderungen: Pfade und Schemas bleiben identisch (Frontend unberührt)

## Erfolgskriterien

- Browse (100 Dokumente): Payload < 100 KB, serverseitig < 200 ms
- Suchanfrage end-to-end < 300 ms
- Crawl-Durchsatz bei Text-PDFs ≥ 3× gegenüber Ist
- LLM-Entscheidung mit Benchmark-Zahlen dokumentiert; Klassifikationszeit/Dokument bekannt
- 0 ESLint-Fehler, `tsc -b` sauber, pytest grün
- Jedes AP = eigener Commit; bei AP4/AP5/AP6 mit Vorher/Nachher-Messung in der Commit-Message

## Risiken & Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|--------|---------------|
| Parallele Writes auf SQLite (AP5) | DB-Writer-Pattern: genau ein Schreiber, WAL-Modus bleibt |
| EasyOCR nicht thread-safe | OCR-Lock; OCR bleibt effektiv seriell |
| Alembic-Baseline auf bestehender DB (AP3) | `alembic stamp` auf Bestandsdatenbanken; frische DBs laufen alle Migrationen |
| Facetten-Cache liefert veraltete Zahlen | Generation-Counter wird bei jedem Ingest-Commit/PATCH inkrementiert; Cache-TTL zusätzlich als Fallback |
| Modellwechsel verschlechtert deutsche Metadaten | Benchmark enthält deutsche Dokumente; Rollback = ein Config-Wert |
| Router-Refactoring bricht Frontend | API-Verträge unverändert; Suite aus AP2 + manueller Smoke-Test |

## Ausgeklammert (bewusst)

- Semantische Suche / Embeddings-Pipeline (eigenes Folgepaket)
- Frontend-Testing mit vitest
- CI-Pipeline (kann später auf die pytest-Suite aufsetzen)
- Virtualisierung der Ergebnisliste (erst messen, ob nach AP4 überhaupt noch nötig)
