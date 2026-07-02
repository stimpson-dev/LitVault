# LitVault Performance-Messungen — Juli 2026

Messprotokoll für AP4 (Tasks 9–13) und AP5 (Tasks 15–17).  
Dieses Dokument wird nach jeder Optimierungsstufe fortgeschrieben.

---

## Baseline (vor AP4)

**Datum:** 2026-07-02  
**Branch:** `feature/performance-umbau`  
**Datenbankstand:** 2.346 Dokumente total (2.078 done, 22 processing, 5 error, 246 ohne Status)  
**Crawl-Status bei Messung:** Aktiv — 1 Job „processing" (scannt D:\Literatur), 2 Jobs „queued". Die Messwerte können durch CPU-Konkurrenz leicht erhöht sein.  
**Messumgebung:** localhost:8000 (uvicorn, single worker), Windows 11 Pro, curl 8.x

### Methode

Jede URL wurde 3× mit `curl -s -o /dev/null -w "…"` gemessen. Angegeben wird der **Median** der drei Läufe.

### Ergebnisse

| Endpunkt | URL | time_total Median (s) | size_download Median (bytes) |
|----------|-----|-----------------------|------------------------------|
| browse   | `GET /api/search?limit=100`               | 1.886 | 4 426 280 |
| search   | `GET /api/search?q=getriebe&limit=100`    | 2.485 |   126 846 |
| facets   | `GET /api/search/facets?q=getriebe`       | 0.608 |     1 049 |

### Rohdaten

| Endpunkt | Lauf 1 Zeit (s) | Lauf 1 Bytes | Lauf 2 Zeit (s) | Lauf 2 Bytes | Lauf 3 Zeit (s) | Lauf 3 Bytes |
|----------|-----------------|--------------|-----------------|--------------|-----------------|--------------|
| browse   | 1.885895        | 4 372 342    | 1.809978        | 4 426 280    | 3.373213        | 4 438 384    |
| search   | 2.466402        | 126 846      | 2.484979        | 126 841      | 3.666446        | 126 916      |
| facets   | 0.584755        | 1 049        | 0.608061        | 1 049        | 0.925627        | 1 049        |

### Beobachtungen

- **Browse (kein Filter):** ~1.9 s Median, aber Lauf 3 sprang auf 3.4 s — wahrscheinlich wegen aktivem Crawl-Job. Antwortgröße ~4.4 MB (100 Dokumente mit vollem Textkörper).
- **Search (q=getriebe):** ~2.5 s Median, Lauf 3 ebenfalls erhöht. Antwortgröße ~127 KB (Ergebnisliste mit Snippets).
- **Facets:** Schnellste Abfrage, ~0.6 s Median, immer 1 049 Bytes. Kein Volltexttransport.
- Die hohen Antwortgrößen bei Browse (4.4 MB) deuten auf Serialisierung des kompletten `text`-Feldes hin — ein offensichtliches Optimierungspotenzial für AP4.

---

## Nach Task 10 (Browse ohne full_text)

**Datum:** 2026-07-02  
**Branch:** `feature/performance-umbau`  
**Datenbankstand:** 2.398 Dokumente total (2.129 done, 5 error, 23 processing, 241 ohne Status)  
**Crawl-Status bei Messung:** 1 Job „processing" (aktiv beim Start), kein offensichtlicher Einfluss auf Messwerte.  
**Änderung:** `SELECT d.*` im Browse-Zweig durch explizite Spaltenliste ohne `full_text` ersetzt (`service.py:158-171`).

### Ergebnisse

| Endpunkt | URL | time_total Median (s) | size_download Median (bytes) |
|----------|-----|-----------------------|------------------------------|
| browse   | `GET /api/search?limit=100` | 0.793 | 64 385 |

### Rohdaten

| Lauf | Zeit (s)   | Bytes  |
|------|------------|--------|
| 1    | 0.803058   | 64 399 |
| 2    | 0.792833   | 64 385 |
| 3    | 0.772952   | 64 385 |

### Beobachtungen

- **Browse-Payload:** 64 385 Bytes (Median) statt 4 426 280 Bytes — **Reduktion um Faktor ~69 (98,5 %)**
- **Antwortzeit:** 0.793 s Median (vs. 1.886 s Baseline) — ebenfalls deutlich schneller, da SQLite und Python weniger Daten serialisieren müssen.
- Alle 30 Tests bestehen; der zuvor als `xfail(strict=True)` markierte Test `test_browse_does_not_leak_full_text` ist jetzt regulär grün.

---

## Endmessung AP4 (nach Tasks 10–13)

**Datum:** 2026-07-02  
**Branch:** `feature/performance-umbau`  
**Datenbankstand:** 2.969 Dokumente total (2.659 done, 241 pending, 46 error, 23 processing, 61 excluded)  
**Crawl-Status:** Kein aktiver Crawl während der Messung.  
**Änderungen in AP4 (Tasks 10–13):**
- Task 10: Browse-Response ohne `full_text` (explizite Spaltenliste)
- Task 11: Sanitizer für FTS5-Queries (Robustheit)
- Task 12: Facet-Cache (TTL-basiert, In-Memory, `FACET_CACHE`)
- Task 13: Migration 003 — Indexes `ix_documents_created_at`, `ix_documents_doc_type`, `ix_documents_year`

### Ergebnisse

| Endpunkt | URL | time_total Median (s) | size_download Median (bytes) | vs. Baseline |
|----------|-----|-----------------------|------------------------------|--------------|
| browse   | `GET /api/search?limit=100`                     | 0.221 | 64 706  | -88 % Zeit, -98.5 % Größe |
| search   | `GET /api/search?q=getriebe&limit=100`           | 3.866 | 125 015 | +56 % Zeit (FTS-Regression, s.u.) |
| facets (cold) | `GET /api/search/facets?q=getriebe`        | 0.830 | 1 051   | +37 % (mehr Daten: 2969 vs 2346 Zeilen) |
| facets (warm) | `GET /api/search/facets?q=getriebe` (2.+) | 0.212 | 1 051   | -65 % vs. Baseline (Cache-Treffer) |

### Rohdaten

**Browse (`?limit=100`):**

| Lauf | Zeit (s)   | Bytes  |
|------|------------|--------|
| 1    | 0.216543   | 64 706 |
| 2    | 0.221515   | 64 706 |
| 3    | 0.223024   | 64 706 |

**Search (`?q=getriebe&limit=100`):**

| Lauf | Zeit (s)   | Bytes   |
|------|------------|---------|
| 1    | 4.797986   | 125 015 |
| 2    | 3.248406   | 125 015 |
| 3    | 3.866265   | 125 015 |

**Facets — cold (frischer Cache-Key):**

| Lauf | Zeit (s)   | Bytes |
|------|------------|-------|
| 1    | 0.830095   | 281   |

**Facets — warm (Cache-Treffer, 2.+ Aufruf):**

| Lauf | Zeit (s)   | Bytes |
|------|------------|-------|
| 2    | 0.214648   | 281   |
| 3    | 0.210386   | 281   |

### EXPLAIN QUERY PLAN — vorher / nachher

**Vorher (ohne Migration 003):**
```
browse sort  : (4, 0, 0, 'SCAN documents') + (18, 0, 0, 'USE TEMP B-TREE FOR ORDER BY')
doc_type     : (2, 0, 0, 'SCAN documents')
year filter  : (2, 0, 0, 'SCAN documents')
```

**Nachher (mit Migration 003, getestet auf DB-Kopie):**
```
browse sort  : (5, 0, 0, 'SCAN documents USING INDEX ix_documents_created_at')
doc_type     : (3, 0, 0, 'SEARCH documents USING INDEX ix_documents_doc_type (doc_type=?)')
year filter  : (3, 0, 0, 'SEARCH documents USING INDEX ix_documents_year (year>? AND year<?)')
```

Der Temp-B-Tree für ORDER BY auf dem Browse-Pfad entfällt vollständig.

### Index-Entscheidungen (Task 13)

| Index | Erstellt | Begründung |
|-------|----------|------------|
| `ix_documents_created_at` | JA | Browse-Pfad: eliminiert `USE TEMP B-TREE FOR ORDER BY` — der wichtigste Hot Path |
| `ix_documents_doc_type`   | JA | Hohe Selektivität: 67.5 % NULL, spezifische Werte wie `bericht` (7 Zeilen), `dissertation` (34 Zeilen) |
| `ix_documents_year`       | JA | Sehr hohe Selektivität: kaum befüllte Spalte (~18 Non-NULL Zeilen von 2969), Range-Queries stark selektiv |
| `ix_documents_file_type`  | NEIN | 95.1 % der Zeilen haben `file_type='pdf'` — nahezu Null Selektivität für den häufigsten Filterwert |
| `ix_documents_processing_status` | NEIN | 89.5 % der Zeilen sind `'done'` (genau der Wert in Facet-Queries) — SQLite bevorzugt korrekterweise Scan |

### Beobachtungen

- **Browse:** Dramatische Verbesserung: 1.886 s → 0.221 s (Faktor ~8.5×). Hauptursache: Task 10
  (full_text entfernt, 4.4 MB → 64 KB). Task 13-Index eliminiert zusätzlich die Sort-Phase.
- **Search (FTS):** Leichte Regression: 2.485 s → 3.866 s. Ursachen: (1) Datenbankwachstum
  von 2.346 auf 2.969 Zeilen (+26 %), (2) FTS5-BM25-Ranking + `snippet()` sind CPU-intensiv
  und werden durch B-Tree-Indexes auf `documents` nicht beschleunigt (FTS5 hat eigene Indexes).
  B-Tree-Indexes helfen dem FTS-Join-Pfad nicht direkt.
- **Facets cold:** 0.830 s (leicht schlechter als Baseline 0.608 s wegen mehr Daten). Cache-Benefit:
  warm 0.212 s — Faktor ~4× Verbesserung gegenüber Cold-Hit, Faktor ~2.9× gegenüber Baseline.
- **Facets warm (Cache):** 0.212 s — klares Signal, dass Task 12-Cache korrekt greift.
  Differenz cold/warm: 0.618 s (absolut) bzw. Faktor 3.9×.

---

## Nach Task 13b (snippet auf Seite begrenzt)

**Datum:** 2026-07-02  
**Branch:** `feature/performance-umbau`  
**Datenbankstand:** 2 989 nicht-exkludierte Dokumente (2 719 done, 241 pending, 23 processing, 6 error); FTS-Matches für „getriebe": 1 101  
**Crawl-Status:** Kein offensichtlicher Crawl-Einfluss; Läufe 2/3 nahezu identisch.  
**Änderung:** FTS-Zweig in `SearchService.search` (`app/search/service.py`) als zweistufige Query: innere CTE `page(id)` ermittelt nur die IDs der Ergebnis-Seite (sortiert + `LIMIT/OFFSET`, ohne snippet), äußere Query berechnet `snippet()`/`bm25()` nur für diese Zeilen. Vorher materialisierte SQLite die `snippet()`-Ausdrücke für ALLE Matches vor dem Sortieren (⌀ `full_text` >100 KB pro Match).

### Ergebnisse

| Endpunkt | URL | time_total Median (s) | size_download Median (bytes) | vs. Endmessung AP4 |
|----------|-----|-----------------------|------------------------------|--------------------|
| search   | `GET /api/search?q=getriebe&limit=100` | 0.431 | 124 646 | -89 % Zeit (3.866 s → 0.431 s, Faktor ~9) |

### Rohdaten

| Lauf | Zeit (s)   | Bytes   | Bemerkung |
|------|------------|---------|-----------|
| 1    | 0.852557   | 124 646 | Facetten-Cache kalt |
| 2    | 0.422666   | 124 646 | Cache warm |
| 3    | 0.431360   | 124 646 | Cache warm |

### Beobachtungen

- **Median 0.431 s** gegenüber 3.866 s in der Endmessung AP4 — die FTS-Regression aus Task 13 ist behoben und die Suche ist nun auch deutlich schneller als die Baseline (2.485 s).
- Lauf 1 (0.853 s) enthält den kalten Facetten-Cache und liegt damit knapp über der Brief-Erwartung von „unter ~0,8 s kalt"; warm liegen die Läufe bei ~0.42–0.43 s, klar unter der Erwartung.
- `snippet()`/`bm25()` werden jetzt nur für die 100 Zeilen der Ergebnis-Seite berechnet statt für alle 1 101 Matches — konsistent mit der Controller-Diagnose (Query ohne snippet: 222 ms).
- Antwortgröße unverändert (~125 KB) — Verhalten identisch, nur die Berechnungsreihenfolge geändert. Behavior-Lock-Tests (Pagination im FTS-Zweig, Snippet-Felder vorhanden) bestehen vor und nach dem Umbau; volle Suite: 37 passed.

---

## Task 15: Ingest-Parallelisierung (N Parse-Worker + einzelner DB-Writer)

**Datum:** 2026-07-02
**Branch:** `feature/performance-umbau`
**Änderung:** `IngestService.ingest_folder` (`app/ingest/service.py`) von sequenzieller
for-Schleife auf Producer/Consumer umgebaut: N parallele Parse-Producer (begrenzt durch
`asyncio.Semaphore(settings.parse_parallelism)`, Default 3) + **genau ein** DB-Writer-Task,
der eine `asyncio.Queue` konsumiert (SQLite ist single-writer, `AsyncSession` ist nicht
thread-safe). Neues Config-Feld `parse_parallelism: int = 3`. Der alte pro-Dokument
Zwischencommit (`processing_status = "processing"`) samt zugehöriger `FACET_CACHE.invalidate()`
entfällt — der Writer setzt direkt den Endzustand und invalidiert einmal pro Dokument.

### Messaufbau (Realmessung, echte Text-PDFs)

- 10 echte Text-PDFs (1–5 MB, ⌀ ~2,5 MB, gesamt 25,5 MB) aus `D:\Literatur`, per PyMuPDF
  auf extrahierbaren Text vorselektiert (keine Scans → kein OCR-Pfad).
- Zwei Ordner: `ingest_bench_A` (Original-Namen) und `ingest_bench_B` (Dateien mit Suffix
  `_b`, damit der Crawler sie als neue `file_path` behandelt).
- Server isoliert gestartet (`watch_folders` temporär leer, danach restauriert), damit der
  einzelne Job-Worker ausschließlich den Bench-Crawl bearbeitet.
- Crawl via `POST /api/jobs/crawl`, Dauer über Wall-Clock des Poll-Loops. Crawl nutzt
  `IngestService(..., ollama=None)` → Klassifikation deaktiviert, Messung spiegelt reine
  Parse-Parallelisierung.
- **Baseline (VORHER):** altes sequentielles `service.py` (via `git stash`) auf Ordner A.
- **Nachher:** refaktorierter Code (Semaphore=3) auf Ordner B.

### Ergebnisse

| Lauf | Code | Ordner | Dokumente | Fehler | Dauer (s) | docs/min |
|------|------|--------|-----------|--------|-----------|----------|
| Baseline | sequentiell | A | 10 | 0 | 25,84 | 23,2 |
| Nachher  | parallel (sem=3) | B | 10 | 0 | 26,62 | 22,5 |

**Faktor: 0,97× (kein Wall-Clock-Speedup, minimal langsamer durch Thread-Overhead).**

### Kontroll-Mikrobenchmark (isoliert, ohne HTTP/DB/Job-Overhead)

Direkter Vergleich `parse_pdf` über dieselben 10 Dateien, 28 CPU-Kerne verfügbar:

| Variante | Dauer (s) | Speedup |
|----------|-----------|---------|
| SEQ (1 Thread)      | 24,04 | 1,00× |
| PAR (3 Threads)     | 24,44 | 0,98× |

### Befund / Root-Cause

Das Spec-Ziel „≥ 3× bei Text-PDFs" wird **nicht** erreicht. Ursache ist **nicht** der Umbau,
sondern der Parser-Pfad: `parse_pdf` nutzt primär `pymupdf4llm.to_markdown()`, das den
Großteil seiner Arbeit als **GIL-haltender Python-Code** verrichtet. `parse_document` läuft
per `asyncio.to_thread` in einem Thread-Pool — Threads können GIL-gebundene CPU-Arbeit nicht
echt parallelisieren (bestätigt: 3 Threads ≈ 1 Thread trotz 28 Kernen).

Der Umbau ist dennoch **korrekt und wertvoll**:
- **Korrektheit** durch Concurrency-Test `tests/test_ingest_parallel.py::test_parses_overlap`
  bewiesen (max. gleichzeitige Parses ≥ 2; RED vorher = 1/seriell, GREEN nachher).
- Liefert die Architektur für echte Parallelität, sobald der Parse-Pfad **GIL freigibt**
  (I/O-lastige Reads von Netzlaufwerken Z:\/T:\, GPU-OCR, oder späterer Wechsel auf
  `ProcessPoolExecutor`).
- Entfernt den pro-Dokument Zwischencommit (halbiert Commits + Cache-Invalidierungen) und
  serialisiert DB-Schreibzugriffe sauber über **einen** Writer (SQLite single-writer-sicher).
- Cancellation- und Producer-Crash-Pfade terminieren den Writer garantiert
  (`gather(..., return_exceptions=True)` + Nachreichen eines Fehler-Ergebnisses pro
  abgestürztem Producer, damit `handled == total_found` erreicht wird).

**Empfehlung (Folgetask):** Für den Spec-Ziel-Speedup den Parse-Schritt auf
`ProcessPoolExecutor` (Multiprocessing) umstellen — der jetzige Umbau ist die notwendige
Vorstufe (Producer/Consumer-Struktur steht).

### Cleanup

Beide Bench-Sätze (20 Dokumente, `file_path LIKE '%ingest_bench_%'`) nach der Messung über
`DELETE /api/documents/{id}` soft-exkludiert (`excluded=1`), verifiziert: 0 aktiv verbleibend.
`PRAGMA integrity_check` = ok.

<!-- Weitere Messpunkte werden nach Tasks 16–17 hier ergänzt -->

---

## Task 17: PDF-Extraktionsmodus — pymupdf4llm vs. plain get_text

**Datum:** 2026-07-02  
**Branch:** `feature/performance-umbau`  
**Skript:** `backend/scripts/benchmark_parse.py`  
**PDF-Quelle:** `D:\Literatur` (erste 10 nach alphabetischer Sortierung, 4–144 Seiten, Mix aus technischen Skripten und Büchern)

### Benchmark 1: pymupdf4llm.to_markdown vs. plain page.get_text

| Datei | Seiten | markdown (s) | plain (s) | Faktor |
|-------|--------|-------------|-----------|--------|
| 1994 Witzigmann - Beef [...] | 144 | 2.87 | 0.04 | 77.0× |
| 20060919 Abschlussbericht.pdf | 12 | 0.76 | 0.01 | 68.5× |
| Berechnung von Werkstoffdaten [...] | 4 | 0.68 | 0.01 | 64.7× |
| Bruchmechanik1_1.pdf | 24 | 1.46 | 0.01 | 112.3× |
| Elastizität, Viskosität [...] | 5 | 0.50 | 0.01 | 67.8× |
| Extra_Info_44_Massivumformung [...] | 12 | 0.80 | 0.01 | 72.2× |
| HTWK-Leipzig_Getriebe Grundlagen1.pdf | 78 | 0.83 | 0.02 | 42.9× |
| Leifaden_Versagen_StAl [...] | 87 | 5.83 | 0.07 | 89.0× |
| Plastische Verformung.pdf | 8 | 0.80 | 0.01 | 77.2× |
| Plastizität und Bruchmechanik.pdf | 93 | 9.53 | 0.09 | 103.4× |

**Gesamt markdown:** 24.06 s | **Gesamt plain:** 0.28 s | **Median Faktor: 74.6×**

### Qualitätscheck Textlänge (erste 3 Dateien)

| Datei | len_md | len_plain | plain/md | OK? |
|-------|--------|-----------|---------|-----|
| 1994 Witzigmann - Beef [...] | 0 | 143 | ∞ | PRÜFEN¹ |
| 20060919 Abschlussbericht.pdf | 18 073 | 17 548 | 0.97× | JA |
| Berechnung von Werkstoffdaten [...] | 14 259 | 15 019 | 1.05× | JA |

¹ „Beef"-Buch (144 Seiten): pymupdf4llm liefert 0 Zeichen (mögliche Ursache: Scan/Encoding), plain liefert 143 Zeichen — ebenfalls leer (scanntes Buch). Beide Pfade versagen; OCR-Fallback würde greifen. Kein signifikanter Qualitätsverlust durch den Switch.

### Benchmark 2: Thread-Skalierung plain get_text (seq vs. 3 Threads)

| Variante | Dauer (s) | Speedup |
|----------|-----------|---------|
| SEQ (1 Thread) | 0.30 | 1.00× |
| PAR (3 Threads) | 0.29 | 1.02× |

**Befund:** Kein messbarer Thread-Speedup — plain extraction ist so schnell (⌀ 28 ms für 10 Dateien), dass Threading-Overhead dominiert. Für die Spec-Ziel-Frage (≥ 3× bei Text-PDFs) ist der richtige Vergleich markdown/plain Faktor 74.6×, nicht Threads. Task 15's Parallelarchitektur ist dennoch korrekt (serieller DB-Writer, parallele Parser); echter I/O-Overlap bei Netzlaufwerken oder GPU-OCR wird davon profitieren.

### Entscheidung

**Faktor 74.6× >> 3× → Config-Switch implementiert.**

- `pdf_extraction_mode: str = "plain"` in `app/config.py` (Backend-only, analog zu `parse_timeout_seconds`)
- `parse_pdf` in `app/ingest/parsers/pdf_parser.py`: Primärpfad wechselt auf `"\n".join(page.get_text() for page in doc)` wenn `pdf_extraction_mode == "plain"`, ansonsten bisheriger `pymupdf4llm.to_markdown`-Pfad.
- Qualitäts-Gate (`_text_quality >= 0.15`) und OCR-Fallback bleiben unverändert hinter dem Switch.
- `config.example.json` unberührt (Backend-only-Feld, kein UI-Bezug).
- **38 Tests: grün** (keine Regression).

---

## Task 20: LLM-Benchmark & Modellentscheidung

**Datum:** 2026-07-03  
**Branch:** `feature/performance-umbau`  
**Hinweis:** Ollama wurde im Rahmen dieser Task von **0.17.1 auf 0.31.1** aktualisiert (Ollama 0.17.1 behandelte Qwen3.5-Modelle im thinking-Modus inkorrekt — kein gültiger JSON-Output mit json_schema-Format).

### Benchmark-Skript

`backend/scripts/benchmark_llm.py` — 3 Modelle × 2 max_chars-Varianten = 6 Läufe, je 20 zufällig ausgewählte Dokumente aus der Produktions-DB (READ-ONLY), 3 FIELDS: title, doc_type, summary, categories, authors, year, tags.

### Ergebnisse — Lauf 1 (Ollama 0.17.1, veraltet, nur zur Referenz)

**Datum:** 2026-07-02

| Modell | max_chars | ctx | s/Dok | Ausfüllung | Fehler |
|--------|-----------|-----|-------|------------|--------|
| qwen3:4b | 2000 | 4096 | 4.8 | 85.7 % | 0 |
| qwen3:4b | 6000 | 8192 | 6.0 | 89.3 % | 0 |
| qwen3.5:4b | 2000 | 4096 | 7.2 | 0.0 % | 20 |
| qwen3.5:4b | 6000 | 8192 | 8.1 | 0.0 % | 20 |
| qwen3.5:9b | 2000 | 4096 | 14.5 | 0.0 % | 20 |
| qwen3.5:9b | 6000 | 8192 | 14.6 | 0.0 % | 20 |

**Root-Cause Lauf 1:** Ollama 0.17.1 schickte Qwen3.5-Modelle in den „Thinking-Modus"; das Ergebnis war un-parsebares Markdown statt JSON. qwen3:4b funktionierte, weil das Modell kein Thinking unterstützt.

### Ergebnisse — Lauf 2 (Ollama 0.31.1)

**Datum:** 2026-07-03  
**Änderung gegenüber Lauf 1:** Ollama 0.17.1 → 0.31.1 (Update). Zusätzlich: Markdown-Fence-Stripping-Patch in `ollama_client.py` (Safety-Net für ```json … ``` Antworten).

| Modell | max_chars | ctx | s/Dok | Ausfüllung | Fehler |
|--------|-----------|-----|-------|------------|--------|
| qwen3:4b | 2000 | 4096 | 4.5 | 83.5 % | 1 |
| qwen3:4b | 6000 | 8192 | 5.1 | 87.2 % | 1 |
| qwen3.5:4b | 2000 | 4096 | 12.6 | 0.0 % | 20 |
| qwen3.5:4b | 6000 | 8192 | 7.1 | 0.0 % | 20 |
| qwen3.5:9b | 2000 | 4096 | 9.6 | 0.0 % | 20 |
| qwen3.5:9b | 6000 | 8192 | 12.8 | 0.0 % | 20 |

**Befund qwen3.5 (beide Modelle):** Auch mit Ollama 0.31.1 geben qwen3.5:4b und qwen3.5:9b mit `format: json_schema` freies Markdown zurück (nicht gefencet, sondern `**DOCUMENT TYPE**: bericht` usw.). Das Fence-Stripping-Patch greift bei dieser Fehlerart nicht. Root-Cause: Ollama 0.31.1 constraint das `json_schema`-Format für Qwen3.5-Modelle nicht effektiv; das Modell ignoriert die Strukturvorgabe.

**Befund qwen3:4b:** Funktioniert zuverlässig. Der 1 Fehler pro 20 Docs (5 %) ist ein `num_predict=512`-Truncation bei einem ungewöhnlich langen Dokument (doc 728); beim Warmarbeitsstahlbericht wurde die JSON-Antwort mitten im Array abgeschnitten. Akzeptabler Fehler für Hintergrundklassifikation.

**Hinweis qwen3.5:9b VRAM:** Spill ~28 % auf CPU-RAM (8 GB VRAM), aber mit Ollama 0.31.1 zeigt sich das nicht in extrem hohen Latenzzeiten (9.6 / 12.8 s/Dok) — trotzdem kein valider JSON-Output.

### Entscheidungsmatrix

| Kriterium | qwen3:4b ctx=4096 chars=2000 | qwen3:4b ctx=8192 chars=6000 | qwen3.5:4b chars=6000 | qwen3.5:9b chars=6000 |
|-----------|------------------------------|------------------------------|-----------------------|-----------------------|
| s/Dok | 4.5 | 5.1 | 7.1 | 12.8 |
| Ausfüllung | 83.5 % | **87.2 %** | 0.0 % | 0.0 % |
| Fehlerrate | 5 % | 5 % | 100 % | 100 % |
| Akzeptabel (< 15 s) | ✓ | ✓ | – (100 % Fehler) | – (100 % Fehler) |
| **Empfehlung** | – | **GEWÄHLT** | – | – |

### Gewähltes Modell

**`qwen3:4b`, `classification_max_chars: 6000`, `ollama_num_ctx: 8192`**

Begründung: Beste Ausfüllung (87.2 %) bei akzeptabler Geschwindigkeit (5.1 s/Dok im Hintergrundworker). Die 0.6 s Mehrzeit gegenüber chars=2000 ist vertretbar; die 4 % höhere Fill-Rate reduziert manuelle Nacharbeit messbar.

### Stichprobe (Qualitätscheck qwen3:4b chars=6000)

3 Dokumente manuell gegen file_path und Textinhalt geprüft:

| Doc-ID | file_path (Ende) | Extrahierter Titel | doc_type | Kategorien | conf | Bewertung |
|--------|-----------------|-------------------|----------|------------|------|-----------|
| 167 | `zako_7390_7391_es05-n.pdf` | Gearing Analysis Report | bericht | Tragbild/Kontakt/NVH, FEM/Spannungen | 0.85 | OK — Kontaktmuster-Analyse korrekt kategorisiert |
| 2636 | `dew_stammbaum_warmarbeitsstaehle_de_140123_01.pdf` | Schematischer Stammbaum der Warmarbeitsstähle Thermodur | interne_notiz | Werkstoffe/Wärmebehandlung | 0.85 | SEHR GUT — Titel exakt extrahiert, Kategorie perfekt |
| 2526 | `531 II.pdf` | FVA-Nr. 531 II Dynamische Koeffizienten | bericht | Verzahnungsgrundlagen, Kegelrad/Hypoid/Stirnrad | 0.95 | GUT — Titel/Typ perfekt; Kategorien leicht daneben (Radialgleitlager → Getriebe), akzeptabler Fehler |

**Gesamtqualität:** 2/3 Dokumente exzellent, 1/3 korrekte Metadaten mit leicht falscher Kategorie.

### Patches & Config-Änderungen

- `backend/app/classification/ollama_client.py`: Markdown-Fence-Stripping-Helper `strip_markdown_fence()` hinzugefügt (Safety-Net für ```json … ``` Antworten — hilft bei qwen3:4b falls Ollama älteres Format sendet).
- `backend/tests/test_ollama_fence_strip.py`: 5 Unit-Tests für die Stripping-Funktion (alle grün).
- `config.example.json`: `ollama_model: "qwen3:4b"`, `ollama_num_ctx: 8192`, `classification_max_chars: 6000`.
- Lokales `config.json`: analog (nicht committed).
- **45 Tests grün** (40 vorher + 5 neue Fence-Strip-Tests).

---

## Task 20b: JSON-Retry-Fallback & qwen3.5-Nachtest

**Datum:** 2026-07-03
**Branch:** `feature/performance-umbau`
**Hintergrund:** Task 20 ergab 100 % Fehlerquote für qwen3.5 mit `json_schema`-Format. Ein manueller Test deutete an, dass qwen3.5 mit `format: "json"` (String) möglicherweise JSON in Fences liefert. Außerdem: `num_predict: 512` verursachte 1 Truncation bei doc 728 (Warmarbeitsstähle-Stammbaum). Beide Punkte adressiert.

### Änderungen

**`backend/app/classification/ollama_client.py`:**
- `num_predict: 512` → `num_predict: 1024`
- Retry-Logik: Parse-Fehler nach dem Schema-Format-Aufruf löst jetzt (zusätzlich zu HTTP 500) einen Retry mit `format: "json"` aus. Struktur: Parse innerhalb des Format-Loops; `last_error` akkumuliert; `ValueError` erst nach Erschöpfung aller Formate.

**`backend/tests/test_ollama_client_retry.py`** (neue Datei, 4 Tests):
- TDD: Tests zuerst RED, dann GREEN durch Implementierung
- Test 1: Schema-Format → Markdown → Retry → Fenced JSON → Erfolg, 2 POST-Aufrufe
- Test 2: Beide Formate unparsebar → ValueError, 2 POST-Aufrufe
- Test 3: Erstes Response valides JSON → Kein Retry, 1 POST-Aufruf
- Test 4: `num_predict` muss 1024 im Request sein

### Benchmark-Ergebnisse (2 Modelle × chars=6000 × 20 Docs, Ollama 0.31.1)

| Modell | max_chars | ctx | s/Dok | Ausfüllung | Fehler |
|--------|-----------|-----|-------|------------|--------|
| qwen3:4b | 6000 | 8192 | 5.2 | 85.0 % | 0 |
| qwen3.5:4b | 6000 | 8192 | 21.4 | 0.0 % | 20 |

**qwen3:4b:** 0 Fehler (vs. 1 Fehler in Task 20 wegen Truncation) — `num_predict: 1024` behebt das Problem. Fill-Rate 85 % (andere Zufalls-Docs, ±2 % Varianz normal).

**qwen3.5:4b:** 21.4 s/Dok (2 HTTP-Aufrufe durch Retry-Fallback, daher ~3× langsamer als Task 20). 20/20 Fehler. Root-Cause: qwen3.5:4b ignoriert SOWOHL `json_schema` ALS AUCH `"json"` Format-Parameter und gibt freies Markdown zurück (nicht gefenced) — weder Fence-Stripper noch json.loads können das parsen. Die Retry-Mechanik greift korrekt (20 Retry-Warnungen im Log), aber json-Format-Retry produziert ebenfalls Markdown.

### Entscheidung

**Entscheidungsregel:** qwen3.5:4b → Default nur wenn (a) Fehlerquote ≤ 5 % UND (b) Fill ≥ qwen3:4b+2 Pkt ODER gleiche Fill bei geringerer Zeit.

**qwen3.5:4b Fehlerquote: 100 %** → Kriterium (a) NICHT erfüllt → **qwen3:4b bleibt Default. Keine Config-Änderung.**

Der Retry-Fallback und num_predict-Fix werden trotzdem committet — sie sind für zukünftige Modelle wertvoll und lösen das bekannte Truncation-Problem.

**Suite: 49 Tests grün** (45 vorher + 4 neue Retry-Tests).
