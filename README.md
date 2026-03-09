# LitVault — Lokaler Literatur-Navigator

LitVault ist ein lokaler Literatur-Navigator für technische Dokumente (Verzahnungstechnik, FEM-Simulation, Werkstoffkunde). Das System crawlt Ordner, extrahiert Text und Metadaten aus PDFs/DOCX/PPTX, klassifiziert Dokumente automatisch via KI (Ollama/Qwen3) und bietet eine professionelle Suchoberfläche.

Alles läuft lokal — kein Docker, keine Cloud.

---

## Inhaltsverzeichnis

- [Voraussetzungen](#voraussetzungen)
- [Installation](#installation)
- [Konfiguration](#konfiguration)
- [Starten](#starten)
- [Benutzerhandbuch](#benutzerhandbuch)
  - [Dokumente einlesen](#dokumente-einlesen)
  - [Suchen und Filtern](#suchen-und-filtern)
  - [Dokumentdetails und Bearbeitung](#dokumentdetails-und-bearbeitung)
  - [Tags verwalten](#tags-verwalten)
  - [Favoriten](#favoriten)
  - [Review-Queue](#review-queue)
  - [Gespeicherte Suchen](#gespeicherte-suchen)
  - [CSV-Export](#csv-export)
  - [Einstellungen](#einstellungen)
  - [Job-Fortschritt](#job-fortschritt)
- [Architektur](#architektur)
  - [Technologie-Stack](#technologie-stack)
  - [Projektstruktur](#projektstruktur)
  - [Datenbank-Schema](#datenbank-schema)
  - [Verarbeitungs-Pipeline](#verarbeitungs-pipeline)
  - [KI-Klassifikation](#ki-klassifikation)
  - [Volltextsuche](#volltextsuche)
- [API-Referenz](#api-referenz)
- [Fehlerbehebung](#fehlerbehebung)
- [Entwicklung](#entwicklung)

---

## Voraussetzungen

| Software | Version | Zweck |
|----------|---------|-------|
| **Python** | 3.11+ | Backend |
| **Node.js** | 18+ | Frontend |
| **uv** | latest | Python-Paketmanager |
| **Ollama** | latest | KI-Klassifikation |
| **Tesseract OCR** | 5.x | OCR für gescannte PDFs |

### Ollama einrichten

Ollama kann lokal oder auf einem Server laufen (z.B. TrueNAS).

```powershell
# Lokal installieren: https://ollama.com/download
# Modell herunterladen:
ollama pull qwen3:8b
```

Für einen Remote-Server (z.B. `http://192.168.178.43:30068`) wird die URL in der Konfiguration eingetragen.

### Tesseract installieren (optional, für OCR)

Nur nötig wenn gescannte PDFs vorkommen.

1. Installer herunterladen: https://github.com/UB-Mannheim/tesseract/wiki
2. Installieren mit deutschen Sprachdaten (`deu`)
3. Sicherstellen dass `tesseract` im PATH ist:
   ```powershell
   tesseract --version
   ```

---

## Installation

### 1. Repository klonen/vorbereiten

```powershell
cd C:\Coding\LitVault
```

### 2. Backend-Dependencies installieren

```powershell
cd backend
uv sync
```

Das erstellt eine virtuelle Umgebung unter `backend/.venv/` und installiert alle Python-Pakete:
- FastAPI, Uvicorn (Webserver)
- SQLAlchemy, aiosqlite (Datenbank)
- pymupdf4llm (PDF-Extraktion)
- python-docx, python-pptx (Office-Extraktion)
- pytesseract (OCR)
- langdetect (Spracherkennung)
- watchfiles (Dateiüberwachung)
- Alembic (Datenbankmigrationen)

### 3. Frontend-Dependencies installieren

```powershell
cd ..\frontend
npm install
```

### 4. Konfiguration anlegen

```powershell
cd C:\Coding\LitVault
```

Erstelle `config.json` im Projektroot:

```json
{
  "watch_folders": [
    "C:/Dokumente/Literatur",
    "Z:/Abteilung/Berechnungen/Literatur"
  ],
  "ollama_url": "http://localhost:11434",
  "ollama_model": "qwen3:8b",
  "db_path": "litvault.db",
  "thumbnails_dir": "thumbnails",
  "log_level": "INFO",
  "poll_interval_seconds": 10
}
```

### 5. Datenbank initialisieren

Die Datenbank wird beim ersten Start automatisch erstellt. Alternativ manuell:

```powershell
cd backend
uv run alembic upgrade head
```

---

## Konfiguration

Die Konfiguration liegt in `config.json` im Projektroot. Alle Einstellungen können auch über die Web-Oberfläche unter **Einstellungen** geändert werden.

| Einstellung | Typ | Standard | Beschreibung |
|------------|-----|----------|--------------|
| `watch_folders` | `string[]` | `[]` | Ordner die automatisch überwacht werden. Lokale und Netzlaufwerke. |
| `ollama_url` | `string` | `http://localhost:11434` | Ollama-Server URL |
| `ollama_model` | `string` | `qwen3:8b` | Ollama-Modell für Klassifikation |
| `embedding_model` | `string` | `nomic-ai/nomic-embed-text-v1.5` | Embedding-Modell (für v2 vorbereitet) |
| `db_path` | `string` | `litvault.db` | Pfad zur SQLite-Datenbank |
| `thumbnails_dir` | `string` | `thumbnails` | Ordner für PDF-Thumbnails |
| `log_level` | `string` | `INFO` | Log-Level: DEBUG, INFO, WARNING, ERROR |
| `poll_interval_seconds` | `int` | `10` | Intervall für Dateiüberwachung (Sekunden) |

### Beispiel: Remote Ollama (TrueNAS)

```json
{
  "ollama_url": "http://192.168.178.43:30068",
  "ollama_model": "qwen3:8b"
}
```

### Beispiel: Mehrere Watch-Ordner

```json
{
  "watch_folders": [
    "C:/Dokumente/Papers",
    "C:/Dokumente/Normen",
    "Z:/Berechnungen/Literatur",
    "//server/share/Forschung"
  ]
}
```

> **Hinweis**: Forward-Slashes (`/`) funktionieren auch unter Windows. UNC-Pfade (`//server/share`) werden unterstützt.

---

## Starten

### Entwicklungsmodus (zwei Terminals)

**Terminal 1 — Backend:**
```powershell
cd C:\Coding\LitVault\backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 — Frontend:**
```powershell
cd C:\Coding\LitVault\frontend
npm run dev
```

Anschließend im Browser öffnen: **http://localhost:5173**

Das Frontend leitet alle `/api`-Anfragen automatisch an das Backend (Port 8000) weiter.

### Produktionsmodus

```powershell
# 1. Frontend bauen
cd C:\Coding\LitVault\frontend
npm run build

# 2. Backend starten (served Frontend aus frontend/dist/)
cd C:\Coding\LitVault\backend
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Im Produktionsmodus served FastAPI das gebaute Frontend direkt unter **http://localhost:8000**.

### Was passiert beim Start?

1. Datenbanktabellen werden erstellt (falls nicht vorhanden)
2. FTS5-Volltextindex wird initialisiert
3. Background-Worker startet (verarbeitet Jobs aus der Queue)
4. File-Watcher startet (überwacht konfigurierte Ordner)
5. API ist bereit unter `/api/health`

---

## Benutzerhandbuch

### Dokumente einlesen

Es gibt drei Wege um Dokumente einzulesen:

#### 1. Automatisch via File Watcher

Konfiguriere `watch_folders` in den Einstellungen. Neue oder geänderte Dateien (PDF, DOCX, PPTX) werden automatisch erkannt und verarbeitet.

#### 2. Manuell via API

```powershell
# Ordner einlesen
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/api/crawl" `
  -ContentType "application/json" `
  -Body '{"folder": "C:/Dokumente/Literatur"}'
```

#### 3. Über die Job-API

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/api/jobs/crawl" `
  -ContentType "application/json" `
  -Body '{"folder": "C:/Dokumente/Literatur"}'
```

#### Unterstützte Dateiformate

| Format | Extraktion | OCR | Thumbnail |
|--------|-----------|-----|-----------|
| **PDF** | pymupdf4llm (Markdown) | Ja (Tesseract, pro Seite) | Ja (Seite 1) |
| **DOCX** | python-docx (Absätze + Tabellen) | Nein | Nein |
| **PPTX** | python-pptx (Folien + Formen) | Nein | Nein |

#### Verarbeitungs-Pipeline

Für jedes Dokument:

1. **Crawl**: Datei gefunden, SHA-256-Hash berechnet
2. **Duplikat-Check**: Hash mit DB vergleichen (nur neue/geänderte Dateien)
3. **Parse**: Text und Metadaten extrahieren
4. **OCR** (bei PDFs): Gescannte Seiten erkennen, per-Seite OCR anwenden
5. **Klassifikation**: KI bestimmt Typ, Kategorie, Tags, Zusammenfassung
6. **Thumbnail**: PDF Seite 1 als JPEG-Thumbnail
7. **Index**: In DB speichern, FTS5-Index aktualisieren

### Suchen und Filtern

#### Volltextsuche

Die Suchleiste oben ist das Hauptelement. Einfach lostippen — die Suche startet automatisch nach 300ms.

**Tastenkürzel**: `Ctrl+K` fokussiert die Suchleiste.

Die Suche durchsucht:
- **Titel** (10× gewichtet)
- **Autoren** (5× gewichtet)
- **Zusammenfassung** (2× gewichtet)
- **Volltext** (1× gewichtet)

Treffer werden nach BM25-Relevanz sortiert. Suchbegriffe werden in den Snippets hervorgehoben.

#### Filter (linke Seitenleiste)

| Filter | Beschreibung |
|--------|-------------|
| **Kategorien** | 10 vordefinierte Kategorien mit Anzahl |
| **Dokumenttyp** | Dissertation, Paper, Norm, Bericht, etc. |
| **Jahr** | Erscheinungsjahr |

Klick auf einen Filter aktiviert ihn. Erneuter Klick deaktiviert ihn. Die Facetten-Zahlen aktualisieren sich dynamisch.

#### Aktive Filter (Chips)

Aktive Filter werden als Chips über der Trefferliste angezeigt. Jeder Chip hat ein X zum Entfernen. **"Alle Filter löschen"** setzt alles zurück.

### Dokumentdetails und Bearbeitung

Klick auf ein Suchergebnis öffnet das Detail-Panel rechts.

**Angezeigt werden:**
- Titel, Autoren, Jahr
- Dokumenttyp (Badge)
- Quelle/Journal
- Sprache
- Dateityp und Größe
- KI-Confidence mit Tier-Label (Hoch/Mittel/Niedrig)
- Zusammenfassung
- Dateipfad
- Tags

**Inline-Bearbeitung:**

Jedes Metadatenfeld hat ein Stift-Icon. Klick darauf schaltet in den Bearbeitungsmodus:
- **Enter** oder Klick außerhalb: Speichert die Änderung
- **Escape**: Bricht ab

Bei Bearbeitung wird `classification_source` auf "Benutzer" gesetzt.

### Tags verwalten

Im Detail-Panel unter "Tags":

- **Tags anzeigen**: AI-Tags (grau) und Benutzer-Tags (blau)
- **Tag hinzufügen**: In das Eingabefeld tippen, Enter drücken
- **Tag entfernen**: X-Button am Tag klicken

Tags werden mit Quelle gespeichert (`ai` oder `user`).

### Favoriten

- **Herz-Icon** auf jedem Suchergebnis und im Detail-Panel
- Klick toggelt den Favoriten-Status
- Favorisierte Dokumente haben ein ausgefülltes rotes Herz
- Favoriten können über die API abgerufen werden: `GET /api/favorites`

### Review-Queue

Über den **"Review"**-Button in der Toolbar erreichbar.

Zeigt Dokumente deren KI-Klassifikation unsicher ist (Confidence < 85%):

- **Confidence-Farben**: Rot (< 55%), Gelb (55-84%)
- **Bestätigen**: Übernimmt die KI-Klassifikation als "vom Benutzer geprüft"
- **Klick auf Dokument**: Öffnet Detail-Panel zum Bearbeiten

### Gespeicherte Suchen

Über den **"Suchen"**-Button in der Toolbar:

- **Aktuelle Suche speichern**: Name eingeben, "Speichern" klicken
- **Gespeicherte Suche laden**: Klick auf den Eintrag — Suchbegriff und Filter werden wiederhergestellt
- **Löschen**: Papierkorb-Icon

### CSV-Export

Über den **"CSV Export"**-Button in der Toolbar:

- Exportiert die aktuelle Suchergebnis-Liste als CSV-Datei
- Spalten: Titel, Autoren, Jahr, Dokumenttyp, Quelle, Sprache, Dateipfad, Dateityp, Dateigröße
- Maximal 1000 Zeilen

### Einstellungen

Über den **"Einstellungen"**-Button in der Toolbar (rechts):

| Feld | Beschreibung |
|------|-------------|
| **Watch-Ordner** | Ordner hinzufügen/entfernen. Neue Dateien werden automatisch erkannt. |
| **Ollama URL** | Adresse des Ollama-Servers (z.B. `http://192.168.178.43:30068`) |
| **Ollama Modell** | Modellname (z.B. `qwen3:8b`) |
| **Poll-Intervall** | Wie oft der Watcher nach neuen Dateien sucht (Sekunden) |

Änderungen werden in `config.json` gespeichert und sofort angewendet.

### Job-Fortschritt

Ein kleiner Indikator unten rechts zeigt den Fortschritt aktiver Jobs:

- **Fortschrittsbalken**: Visuell wie viele Dateien verarbeitet wurden
- **Status-Text**: z.B. "23/150 — Parsing document.pdf"
- **Klick**: Zeigt die letzten 5 Jobs mit Status
- **Status-Farben**: Gelb (läuft), Grün (fertig), Rot (Fehler)

Die Anzeige verschwindet automatisch wenn keine Jobs aktiv sind.

---

## Architektur

### Technologie-Stack

| Ebene | Technologie |
|-------|------------|
| **Frontend** | React 19, TypeScript 5.9, Vite 7, TailwindCSS 4, shadcn/ui |
| **Backend** | FastAPI, Uvicorn, Python 3.11+ |
| **Datenbank** | SQLite (WAL-Modus) + FTS5 Volltext |
| **KI** | Ollama + Qwen3:8b (Structured JSON Output) |
| **OCR** | Tesseract (deu+eng) |
| **PDF** | pymupdf4llm (Markdown-basierte Extraktion) |
| **Office** | python-docx, python-pptx |
| **Dateiüberwachung** | watchfiles (Rust-basiert, async) |
| **Paketmanager** | uv (Python), npm (Node.js) |

### Projektstruktur

```
LitVault/
├── config.json                        # Laufzeit-Konfiguration
│
├── backend/
│   ├── pyproject.toml                 # Python-Dependencies
│   ├── app/
│   │   ├── main.py                    # FastAPI App + Lifespan
│   │   ├── config.py                  # Settings (Pydantic)
│   │   ├── database.py                # SQLite Engine + Pragmas
│   │   ├── deps.py                    # Dependency Injection
│   │   │
│   │   ├── documents/
│   │   │   ├── models.py              # ORM: Document, Tag, Category, Favorite, ...
│   │   │   └── router.py              # REST: /documents, /favorites, /tags
│   │   │
│   │   ├── search/
│   │   │   ├── service.py             # FTS5 + BM25 + Filter + Facetten
│   │   │   ├── sanitizer.py           # Query-Sanitierung (Bindestriche etc.)
│   │   │   └── router.py              # REST: /search, /saved-searches, /export
│   │   │
│   │   ├── jobs/
│   │   │   ├── models.py              # Job, JobType, JobStatus, JobStore
│   │   │   ├── router.py              # REST: /jobs + SSE Progress
│   │   │   ├── worker.py              # Async Worker-Loop
│   │   │   └── watcher.py             # File Watcher (watchfiles)
│   │   │
│   │   ├── ingest/
│   │   │   ├── crawler.py             # Ordner-Scan, SHA-256, Duplikat-Check
│   │   │   ├── service.py             # IngestService Pipeline
│   │   │   ├── thumbnail.py           # PDF-Thumbnails
│   │   │   └── parsers/
│   │   │       ├── models.py          # ParseResult Dataclass
│   │   │       ├── pdf_parser.py      # PDF + OCR
│   │   │       └── office_parser.py   # DOCX + PPTX
│   │   │
│   │   ├── classification/
│   │   │   ├── ollama_client.py       # Async Ollama HTTP Client
│   │   │   ├── schemas.py             # Prompt, Typen, Kategorien
│   │   │   └── service.py             # ClassificationService
│   │   │
│   │   └── settings/
│   │       └── router.py              # REST: /settings
│   │
│   └── alembic/                       # Datenbankmigrationen
│       └── versions/
│           └── 001_initial_schema.py  # Tabellen, FTS5, Trigger, Seed-Daten
│
├── frontend/
│   ├── package.json                   # Node.js Dependencies
│   ├── vite.config.ts                 # Vite + Proxy-Konfiguration
│   └── src/
│       ├── App.tsx                    # Haupt-Layout (3-Spalten)
│       ├── hooks/
│       │   └── useSearch.ts           # Such-State-Hook (debounced)
│       ├── lib/
│       │   ├── api.ts                 # API-Client (alle Endpoints)
│       │   └── types.ts              # TypeScript-Interfaces
│       └── components/
│           ├── SearchBar.tsx          # Suchleiste + Ctrl+K
│           ├── FilterSidebar.tsx      # Facetten-Filter
│           ├── FilterChips.tsx        # Aktive Filter-Pillen
│           ├── ResultsList.tsx        # Trefferliste + Pagination
│           ├── ResultRow.tsx          # Einzelnes Suchergebnis
│           ├── DocumentDetail.tsx     # Detail-Panel + Inline-Edit
│           ├── TagEditor.tsx          # Tag-Verwaltung
│           ├── FavoriteButton.tsx     # Herz-Toggle
│           ├── ReviewQueue.tsx        # Überprüfungs-Queue
│           ├── Toolbar.tsx            # Aktions-Leiste
│           ├── SavedSearches.tsx      # Gespeicherte Suchen
│           ├── SettingsPanel.tsx      # Einstellungen (Modal)
│           ├── ExportButton.tsx       # CSV-Export
│           └── JobProgress.tsx        # Job-Fortschritt (SSE)
│
└── .planning/                         # Planungsdokumente (intern)
```

### Datenbank-Schema

SQLite mit WAL-Modus und FTS5-Volltext:

```
documents (Haupttabelle)
├── id, file_path (unique), file_hash (SHA-256)
├── file_type, file_size, mtime
├── title, authors (JSON), year, doc_type, source
├── language, summary, full_text, has_text
├── doi, processing_status
├── classification_confidence (0.0-1.0)
├── classification_source (ai/user/null)
├── created_at, updated_at, indexed_at
├── → tags (n:m via document_tags)
├── → categories (n:m via document_categories)
├── → favorites (1:1)
└── → embeddings (1:1, für v2)

documents_fts (FTS5 Virtual Table)
├── title, authors, full_text, summary
├── Tokenizer: porter unicode61 remove_diacritics 1
└── Synchronisiert via INSERT/UPDATE/DELETE Trigger

tags (id, name)
categories (id, name) — 10 vordefinierte
document_tags (document_id, tag_id, source)
document_categories (document_id, category_id, source)
saved_searches (id, name, query)
favorites (document_id, added_at)
embeddings (document_id, model, vector)
```

#### Vordefinierte Kategorien (10 Stück)

| # | Name | Beschreibung |
|---|------|-------------|
| 1 | Verzahnungsgrundlagen | Zahnradtheorie, Geometrie, Kinematik |
| 2 | Kegelrad / Hypoid / Stirnrad | Spezifische Zahnradtypen |
| 3 | Tragbild / Kontakt / NVH | Kontaktmuster, Geräusch, Vibration |
| 4 | FEM / Spannungen / Lebensdauer | Finite Elemente, Festigkeit |
| 5 | Werkstoffe / Wärmebehandlung | Stähle, Einsatzhärten, Nitrieren |
| 6 | Fertigung / Schleifen / Honen | Herstellprozesse |
| 7 | Prüfstand / Versuch / Schadensanalyse | Testen, Ausfallanalyse |
| 8 | Normen / ISO / DIN / AGMA / FVA | Standards und Richtlinien |
| 9 | Anwendungen / Differential / E-Achse | Anwendungsfälle |
| 10 | Interne Berichte / Projektdokumente | Firmeninterne Dokumente |

### Verarbeitungs-Pipeline

```
Datei erkannt (Watcher oder manueller Crawl)
        │
        ▼
   SHA-256 Hash berechnen
        │
        ▼
   Duplikat-Check (Hash in DB?)
    ┌───┴───┐
    │ Neu   │ Bekannt → Skip
    ▼
   Text extrahieren
    ├── PDF: pymupdf4llm → Markdown
    │   └── Gescannte Seiten? → Tesseract OCR (deu+eng)
    ├── DOCX: python-docx → Absätze + Tabellen
    └── PPTX: python-pptx → Folientext
        │
        ▼
   KI-Klassifikation (Ollama)
    ├── Sprache erkennen (langdetect)
    ├── Dokumenttyp bestimmen (7 Typen)
    ├── Kategorien zuweisen (1-3 aus 10)
    ├── Tags generieren (3-8 Stück)
    ├── Zusammenfassung erstellen
    ├── Titel/Autoren/Jahr/Quelle extrahieren
    └── Confidence-Score berechnen
        │
        ▼
   In DB speichern + FTS5 indexieren
        │
        ▼
   Thumbnail generieren (nur PDF)
```

### KI-Klassifikation

#### Modell

Standard: **Qwen3:8b** via Ollama mit Structured JSON Output.

Das Modell erhält die ersten 2000 Zeichen des Dokumenttexts und den Dateinamen als Prompt. Die Antwort ist ein JSON-Objekt:

```json
{
  "doc_type": "paper",
  "categories": ["FEM / Spannungen / Lebensdauer"],
  "tags": ["Zahnfußspannung", "Kegelrad", "FEM-Simulation"],
  "summary": "Untersuchung der Zahnfußspannung an Kegelrädern...",
  "title": "FEM-Analyse spiralverzahnter Kegelräder",
  "authors": ["Müller, A.", "Schmidt, B."],
  "year": 2019,
  "source": "FVA-Forschungsheft 1234",
  "confidence": 0.92
}
```

#### Dokumenttypen (7)

| Typ | Beschreibung |
|-----|-------------|
| `dissertation` | Doktorarbeit |
| `paper` | Wissenschaftliche Veröffentlichung |
| `norm` | Standard (DIN, ISO, AGMA, FVA) |
| `bericht` | Technischer Bericht |
| `präsentation` | Präsentation/Vortrag |
| `artikel` | Fachzeitschrift-Artikel |
| `interne_notiz` | Interne Dokumentation |

#### Confidence-Tiers

| Tier | Bereich | Bedeutung | Aktion |
|------|---------|-----------|--------|
| **Hoch** | ≥ 85% | Zuverlässig | Automatisch übernommen |
| **Mittel** | 55-84% | Unsicher | In Review-Queue zur Überprüfung |
| **Niedrig** | < 55% | Unzuverlässig | Als "unklassifiziert" markiert |

#### Fallback-Regeln

Wenn der Text zu kurz ist (< 30 Wörter), werden Dateinamen-Heuristiken verwendet:
- Enthält "DIN", "ISO", "AGMA", "FVA" → `norm` (Confidence 0.3)
- Ansonsten → `unclassified` (Confidence 0.0)

### Volltextsuche

#### FTS5 mit BM25-Ranking

Die Suche nutzt SQLite FTS5 mit gewichteter Relevanz:

| Feld | Gewichtung | Begründung |
|------|-----------|------------|
| Titel | 10× | Wichtigstes Feld |
| Autoren | 5× | Autorensuche häufig |
| Zusammenfassung | 2× | Kompakter Inhalt |
| Volltext | 1× | Basis-Relevanz |

#### Query-Sanitierung

FTS5 hat spezielle Syntax. LitVault sanitiert Benutzereingaben automatisch:

- Bindestriche werden zu Leerzeichen (`Kegel-rad` → `"Kegel" "rad"`)
- Sonderzeichen werden entfernt (`*"():^`)
- Jedes Wort wird gequotet (verhindert FTS5-Operatoren)

#### Facetten

Neben den Suchergebnissen liefert die API Facetten-Zähler:
- Kategorien mit Anzahl
- Dokumenttypen mit Anzahl
- Jahre mit Anzahl

Diese aktualisieren sich dynamisch wenn Filter angewendet werden.

---

## API-Referenz

Base-URL: `http://localhost:8000/api`

### Dokumente

| Methode | Endpoint | Beschreibung |
|---------|----------|-------------|
| `POST` | `/crawl` | Crawl-Job starten. Body: `{"folder": "..."}` |
| `GET` | `/documents` | Dokumente auflisten. Query: `?limit=50&offset=0` |
| `GET` | `/documents/{id}` | Dokumentdetails abrufen |
| `PATCH` | `/documents/{id}` | Metadaten aktualisieren. Body: `{"title": "...", "year": 2024}` |
| `GET` | `/documents/duplicates` | Duplikate finden. Query: `?hash=sha256...` |
| `POST` | `/documents/{id}/favorite` | Favorit toggeln → `{"favorited": true}` |
| `GET` | `/favorites` | Alle Favoriten auflisten |
| `GET` | `/documents/{id}/tags` | Tags eines Dokuments |
| `POST` | `/documents/{id}/tags` | Tag hinzufügen. Body: `{"name": "..."}` |
| `DELETE` | `/documents/{id}/tags/{tag_id}` | Tag entfernen |

### Suche

| Methode | Endpoint | Beschreibung |
|---------|----------|-------------|
| `GET` | `/search` | Volltextsuche. Query: `?q=...&category=...&doc_type=...&year_min=...&year_max=...&language=...&author=...&offset=0&limit=50` |
| `GET` | `/search/facets` | Facetten abrufen (gleiche Filter-Params) |
| `GET` | `/search/export` | CSV-Export (gleiche Filter-Params, max. 1000 Zeilen) |

### Gespeicherte Suchen

| Methode | Endpoint | Beschreibung |
|---------|----------|-------------|
| `POST` | `/saved-searches` | Suche speichern. Body: `{"name": "...", "query": "{\"q\":\"...\"}"}` |
| `GET` | `/saved-searches` | Alle gespeicherten Suchen |
| `GET` | `/saved-searches/{id}` | Einzelne gespeicherte Suche |
| `DELETE` | `/saved-searches/{id}` | Gespeicherte Suche löschen |

### Jobs

| Methode | Endpoint | Beschreibung |
|---------|----------|-------------|
| `POST` | `/jobs/crawl` | Crawl-Job erstellen. Body: `{"folder": "..."}` |
| `GET` | `/jobs` | Jobs auflisten. Query: `?status=processing` |
| `GET` | `/jobs/{id}` | Job-Status abrufen |
| `GET` | `/jobs/{id}/progress` | SSE-Stream für Fortschritt |

### Einstellungen

| Methode | Endpoint | Beschreibung |
|---------|----------|-------------|
| `GET` | `/settings` | Aktuelle Einstellungen |
| `PUT` | `/settings` | Einstellungen aktualisieren. Body: `{"watch_folders": [...]}` |

### Health

| Methode | Endpoint | Beschreibung |
|---------|----------|-------------|
| `GET` | `/health` | `{"status": "ok", "service": "litvault"}` |

---

## Fehlerbehebung

### Backend startet nicht

```
ModuleNotFoundError: No module named 'app'
```
**Lösung**: Aus dem `backend/`-Verzeichnis starten:
```powershell
cd C:\Coding\LitVault\backend
uv run uvicorn app.main:app --reload
```

### Ollama nicht erreichbar

```
Connection refused: http://localhost:11434
```
**Lösung**:
- Prüfe ob Ollama läuft: `ollama list`
- Bei Remote-Server: URL in Einstellungen prüfen
- Klassifikation wird übersprungen wenn Ollama nicht verfügbar ist — Dokumente werden trotzdem eingelesen

### Gescannte PDFs werden nicht erkannt

**Lösung**:
- Tesseract installieren: https://github.com/UB-Mannheim/tesseract/wiki
- Deutsche Sprachdaten installieren (`deu`)
- Prüfen: `tesseract --list-langs` (muss `deu` enthalten)

### Netzlaufwerk nicht erreichbar

```
Folder not found: Z:/...
```
**Lösung**:
- Netzlaufwerk muss beim Start verbunden sein
- UNC-Pfade verwenden (`//server/share/ordner`) statt Laufwerksbuchstaben
- VPN-Verbindung prüfen

### Datenbank gesperrt

```
database is locked
```
**Lösung**: Kann bei vielen gleichzeitigen Schreibzugriffen auftreten.
- Nur eine Backend-Instanz gleichzeitig starten
- WAL-Modus und 30s Timeout sind bereits konfiguriert
- Bei Problemen: Backend neu starten

### Frontend-Build schlägt fehl

```powershell
cd C:\Coding\LitVault\frontend
npm install    # Dependencies nachinstallieren
npm run build  # Erneut versuchen
```

### Hoher Speicherverbrauch bei OCR

Tesseract OCR kann bei großen PDFs viel RAM verbrauchen.
- Pro Seite wird separat OCR angewendet (nicht das ganze Dokument)
- Timeout: 30s pro Datei, dann wird abgebrochen
- Im Log erscheint dann: `processing_status = "error"`

---

## Entwicklung

### Backend-Tests

```powershell
cd C:\Coding\LitVault\backend
uv run pytest
```

### Frontend-Build prüfen

```powershell
cd C:\Coding\LitVault\frontend
npx tsc --noEmit   # TypeScript-Prüfung
npm run build       # Produktions-Build
npm run dev         # Entwicklungsserver
```

### Datenbank zurücksetzen

```powershell
# Datenbank löschen und neu erstellen
Remove-Item C:\Coding\LitVault\backend\litvault.db
cd C:\Coding\LitVault\backend
uv run uvicorn app.main:app  # Erstellt DB automatisch
```

### API testen (PowerShell)

```powershell
# Health Check
Invoke-RestMethod http://localhost:8000/api/health

# Suche
Invoke-RestMethod "http://localhost:8000/api/search?q=Zahnrad&limit=5"

# Einstellungen lesen
Invoke-RestMethod http://localhost:8000/api/settings

# Crawl starten
Invoke-RestMethod -Method POST http://localhost:8000/api/crawl `
  -ContentType "application/json" `
  -Body '{"folder":"C:/Dokumente/Literatur"}'
```

### Log-Level ändern

In `config.json`:
```json
{
  "log_level": "DEBUG"
}
```

Oder über die API:
```powershell
Invoke-RestMethod -Method PUT http://localhost:8000/api/settings `
  -ContentType "application/json" `
  -Body '{"log_level":"DEBUG"}'
```
