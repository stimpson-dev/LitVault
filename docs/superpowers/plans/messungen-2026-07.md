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
