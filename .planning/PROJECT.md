# LitVault

## Vision
Lokaler Literatur-Navigator für ingenieurwissenschaftliche Dokumente. Crawlt Ordner (lokal + Netzlaufwerke), extrahiert Metadaten und Volltext, kategorisiert automatisch per AI, und bietet eine professionelle Suchoberfläche mit Filtern, Tagging und Dublettencheck.

## Core Value
**Sofortiger Zugriff auf jedes Dokument im Archiv** — statt manuell durch Ordner zu klicken, Suchfeld öffnen, Stichwort eingeben, Treffer mit Kontext sehen.

## Zielnutzer
Solo-User (Ingenieur im Bereich Verzahnungstechnik / FEM-Simulation), arbeitet mit hunderten bis tausenden Dokumenten aus Forschung, Normen, internen Berichten und Projektdokumentation.

## Fachdomäne / Kategorien
- Verzahnungsgrundlagen
- Kegelrad / Hypoid / Stirnrad
- Tragbild / Kontakt / NVH
- FEM / Spannungen / Lebensdauer
- Werkstoffe / Wärmebehandlung
- Fertigung / Schleifen / Honen / Härten
- Prüfstand / Versuch / Schadensanalyse
- Normen / ISO / DIN / AGMA / FVA
- Anwendungen / Differential / E-Achse / Nutzfahrzeug
- Interne Berichte / Projektdokumente

## Tech Stack
- **Backend**: Python 3.x + FastAPI
- **Datenbank**: SQLite + FTS5 (Volltextsuche)
- **Frontend**: React + Vite + TailwindCSS
- **Dokumenten-Parsing**: PyMuPDF (PDF), python-docx (DOCX), python-pptx (PPTX)
- **OCR-Fallback**: Tesseract via pytesseract
- **AI-Klassifikation**: Qwen via Ollama (lokal, NVIDIA GPU)
- **Embeddings**: all-MiniLM-L6-v2 (sentence-transformers) für Similarity Search
- **Schema-Migration**: Alembic

## Pflichtfelder pro Dokument
| Feld | Quelle |
|---|---|
| Titel | Extraktion / AI |
| Autor(en) | Extraktion / AI |
| Jahr | Extraktion / AI |
| Dokumenttyp | AI-Klassifikation (Dissertation, Paper, Norm, Bericht, Präsentation, Artikel, interne Notiz) |
| Quelle/Journal/Uni | Extraktion / AI |
| Sprache | Erkennung (langdetect) |
| Dateipfad | Crawl |
| Dateityp | Crawl |
| Größe | Crawl |
| Änderungsdatum | Crawl |
| Hash (SHA-256) | Crawl |
| Volltext vorhanden | ja/nein |
| Kategorie(n) | AI + manuelle Korrektur |
| Tags | AI + manuelle Korrektur |
| Kurzsummary | AI-generiert |

## Kernfunktionen (v1)
1. **Ordner-Crawl**: Rekursiv, inkrementell (Hash-basiert), lokale + Netzlaufwerke
2. **Watch-Mode**: Ordner automatisch überwachen auf neue/geänderte Dateien
3. **Text/Metadaten-Extraktion**: PDF, DOCX, PPTX mit OCR-Fallback für Scans
4. **AI-Kategorisierung**: Dokumenttyp, Kategorien, Tags, Kurzsummary via Qwen
5. **Tagging-Workflow**: AI schlägt vor → User bestätigt/korrigiert in UI
6. **Volltextsuche**: FTS5 mit Ranking
7. **Filter**: Autor, Jahr, Kategorie, Dokumenttyp, Sprache
8. **Dublettenerkennung**: via Hash, DOI, Titel-Ähnlichkeit
9. **Gespeicherte Suchen**: z.B. "NVH + Differential + FEM"
10. **Favoriten / Leseliste**
11. **Export**: Trefferliste nach CSV/Excel
12. **Suchoberfläche**: Suchfeld oben, Filter links, Trefferliste mit Metadaten, Detailansicht mit Vorschau

## Explizit nicht in v1
- Chat über Archivbestand (RAG-Pipeline) → v2
- "Ähnliche Dokumente" (nutzt Embeddings, die schon gespeichert werden) → v2
- Cloud-Sync → out of scope

## Deployment
- Lokal auf Windows 11 Arbeits-Laptop (NVIDIA GPU)
- Kein Docker, kein Server — einfach `python` + `npm` starten
- Ollama lokal installiert mit Qwen-Modell

## Projektpfad
`C:\Coding\LitVault`
