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

<!-- Weitere Messpunkte werden nach Tasks 10–13 und 15–17 hier ergänzt -->
