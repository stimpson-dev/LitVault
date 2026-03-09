# LitVault Requirements

## v1 Requirements

### Ingest & Crawl
- **REQ-001**: Rekursiver Ordner-Crawl (lokal + Netzlaufwerke)
- **REQ-002**: Inkrementeller Crawl via SHA-256 Hash-Vergleich (nur neue/geänderte Dateien)
- **REQ-003**: Dateimetadaten erfassen: Pfad, Typ, Größe, mtime, Hash
- **REQ-004**: Unterstützte Formate: PDF, DOCX, PPTX
- **REQ-005**: Per-Page OCR-Erkennung (Scan vs. Text) mit Tesseract-Fallback (deu+eng)
- **REQ-006**: Text- und Metadaten-Extraktion via pymupdf4llm / python-docx / python-pptx
- **REQ-007**: Processing-Queue mit Status-Tracking (queued/processing/done/error)
- **REQ-008**: Timeout-Protection für jede Dateiverarbeitung (30s max)
- **REQ-009**: Corrupted/encrypted Files erkennen und in Review-Queue loggen

### AI-Klassifikation
- **REQ-010**: Automatische Dokumenttyp-Erkennung (Dissertation, Paper, Norm, Bericht, Präsentation, Artikel, interne Notiz)
- **REQ-011**: Automatische Kategorie-Vergabe aus definiertem Vokabular (10 Kategorien)
- **REQ-012**: Automatische Tag-Generierung
- **REQ-013**: AI-generierter Kurzsummary
- **REQ-014**: Titel, Autor(en), Jahr, Quelle via AI extrahieren
- **REQ-015**: Sprache automatisch erkennen (langdetect)
- **REQ-016**: Confidence-Tiers: ≥0.85 auto-apply, 0.55-0.84 needs-review, <0.55 unclassified
- **REQ-017**: Ollama/Qwen3 structured JSON output (Pydantic schema)
- **REQ-018**: Klassifikations-Ergebnis speichern mit source (ai/user/rule)

### Suche & Filter
- **REQ-019**: FTS5 Volltextsuche mit BM25-Ranking
- **REQ-020**: Snippet-Highlighting in Suchergebnissen
- **REQ-021**: Faceted Filter: Kategorie, Dokumenttyp, Jahresbereich, Sprache, Autor
- **REQ-022**: Active Filter Chips mit Clear-All
- **REQ-023**: Ergebnisanzahl anzeigen ("X Ergebnisse für [query]")
- **REQ-024**: FTS5 Query-Sanitization (Bindestriche, Sonderzeichen, Operatoren)
- **REQ-025**: Gespeicherte Suchabfragen (Name + JSON-Filter-State)

### Dubletten
- **REQ-026**: SHA-256 Hash-basierte Exact-Duplicate-Erkennung beim Crawl
- **REQ-027**: Dubletten-UI: "Dokument existiert bereits" → Anzeigen / Behalten / Löschen

### UI / Frontend
- **REQ-028**: Suchfeld oben (prominent, Cmd+K Shortcut)
- **REQ-029**: Linke Filterspalte mit dynamischen Zählern
- **REQ-030**: Trefferliste: Titel (highlighted), Autoren+Jahr, Typ-Badge, Kategorie-Tags, Snippet, Datei-Icon
- **REQ-031**: Detailansicht: PDF-Vorschau (iframe), Metadaten, Zusammenfassung, Kategorie-Historie
- **REQ-032**: Thumbnail-Generierung (PDF Seite 1 → JPEG)
- **REQ-033**: Tagging-Workflow: AI-Vorschläge anzeigen → User bestätigt/korrigiert
- **REQ-034**: Review-Queue für niedrige AI-Confidence
- **REQ-035**: Favoriten / Leseliste
- **REQ-036**: Export Trefferliste nach CSV

### Backend / Infrastruktur
- **REQ-037**: FastAPI Backend mit async SQLite (aiosqlite)
- **REQ-038**: SQLite WAL-Mode + FTS5 externe Content-Tabelle mit Triggers
- **REQ-039**: Alembic Schema-Migrationen (render_as_batch)
- **REQ-040**: asyncio.Queue Background-Worker (kein Redis/Celery)
- **REQ-041**: SSE für Job-Progress-Streaming
- **REQ-042**: Embeddings speichern (nomic-embed-text-v1.5) als BLOB, v2-ready
- **REQ-043**: Config via config.json + Pydantic Settings
- **REQ-044**: React Frontend gebaut von Vite, served by FastAPI StaticFiles
- **REQ-045**: File Watcher via watchfiles (lokale + Netzwerk-Ordner)

## v2 (deferred)
- Semantische Ähnlichkeitssuche via sqlite-vec + Embeddings
- RAG / Chat über Archivbestand
- DOI-basierte Dubletten-Erkennung
- Title-Similarity Near-Duplicate (MinHash)
- DOCX/PPTX Vorschau (LibreOffice headless)
- Autocomplete / Suchvorschläge
- German Stemming

## Out of Scope
- Multi-User Support
- Cloud Sync
- Mobile App
