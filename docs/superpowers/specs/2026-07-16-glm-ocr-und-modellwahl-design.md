# LitVault: GLM-OCR statt EasyOCR + umschaltbares Klassifikations-Modell

**Datum:** 2026-07-16
**Status:** Freigegeben (Ansatz A — synchroner Ollama-HTTP-Call, EasyOCR wird ersetzt; Modellwahl als festes Zwei-Optionen-Dropdown)
**Scope:** Zwei kleine, klar getrennte Teile in einem Paket: (1) OCR-Engine-Wechsel EasyOCR → `glm-ocr:latest` via Ollama, (2) Settings-Option zum Wechsel des Klassifikations-Modells zwischen `qwen3:4b` und `gemma4:31b-cloud`. **Ausgeklammert:** umschaltbare OCR-Engines (EasyOCR fliegt ersatzlos raus), dynamisches Modell-Listing von Ollama, parallele Seiten-OCR (Ansatz B — verworfen, GPU serialisiert ohnehin).

## Kontext

- OCR läuft heute über EasyOCR (`pdf_parser.py`: lazy Reader, `_ocr_lock`, numpy/PIL-Bildpfad, GPU-Detection via torch). Trigger: Seiten mit <10 Zeichen Text oder Buchstabenanteil <0,15; max. 250 OCR-Seiten pro Dokument; bei OCR-Fehler Fallback auf `page.get_text()`.
- Klassifikation läuft über `OllamaClient` (`/api/chat`, `think:false`, `format`-Fallback-Loop) mit `settings.ollama_model` — der CLASSIFY-Worker instanziiert den Client **pro Job** frisch, und der Settings-PUT ruft bereits `get_settings.cache_clear()` auf. Ein Modellwechsel greift damit ohne Neustart ab dem nächsten Job.
- Modell-Tags vom User per Ollama-Modellseite bestätigt: `glm-ocr:latest` (2,2 GB, 128K Kontext, Input Text+Image; latest = bf16) und `gemma4:31b-cloud` (Cloud-gehostet, 256K Kontext).

## Entscheidungen

| # | Entscheidung | Begründung |
|---|-------------|------------|
| 1 | **`glm-ocr:latest`** (bf16), nicht q8_0 | Bei 8 GB VRAM ist der 0,6-GB-Unterschied egal; für Texterkennung zählt Präzision. |
| 2 | **EasyOCR ersatzlos ersetzen** | Kein Doppelbetrieb zweier OCR-Engines; kleinster Wartungsaufwand. `easyocr` fliegt aus `pyproject.toml`, GPU-Detection-Code entfällt. |
| 3 | **Synchroner HTTP-Client** (Ansatz A) | `parse_pdf` bleibt synchron (läuft via `asyncio.to_thread`); kein Async-Umbau. Parallelisierung brächte nichts — Ollama bedient das GPU-Modell seriell (gleiche Physik wie beim Performance-Umbau M6 belegt). |
| 4 | **Dropdown mit genau zwei festen Modell-Optionen** | User will gezielt qwen3:4b ↔ gemma4:31b-cloud vergleichen (Testzwecke). Kein Freitext, kein `/api/tags`-Listing (Cloud-Modelle erscheinen dort erst nach Pull) — YAGNI; ein drittes Modell wäre eine Ein-Zeilen-Ergänzung. |
| 5 | **Cloud-Hinweis im UI** | Bei `gemma4:31b-cloud` verlassen Dokumentinhalte (erste `classification_max_chars` Zeichen) den Rechner — als Hinweistext unter dem Dropdown sichtbar. |

## Teil 1: GLM-OCR

### GlmOcrClient (neu: `app/ingest/glm_ocr_client.py`)

- **Synchroner** `httpx.Client` gegen `settings.ollama_url` (der Aufrufer sitzt im Parser-Thread; bewusst NICHT der async `OllamaClient`).
- `ocr_image(png_bytes: bytes) -> str`: `POST /api/chat` mit `model = settings.ocr_model`, einer User-Message mit festem Extraktions-Prompt (exakt: `"Extract all text from this page exactly as written. Preserve the reading order. Output only the extracted text, no commentary."`) und dem Seitenbild base64-codiert im `images`-Feld; `options: {temperature: 0}`, `stream: false`, `keep_alive: -1`. Rückgabe: `message.content` als String.
- Timeout **120 s pro Seite** (eigener Client-Timeout, unabhängig vom Dokument-Timeout).
- Lazy-Singleton im Modul (wie der bisherige EasyOCR-Reader): ein `httpx.Client` pro Prozess, thread-safe genug unter dem bestehenden `_ocr_lock`.

### Parser-Umbau (`app/ingest/parsers/pdf_parser.py`)

- `_get_ocr()` (EasyOCR-Lazy-Init, torch/GPU-Detection) entfällt komplett; numpy/PIL-Import entfällt aus dem OCR-Pfad.
- `_ocr_page(page)`: rendert wie bisher mit `page.get_pixmap(dpi=200)`, aber gibt PNG-Bytes (`pixmap.tobytes("png")`) an `GlmOcrClient.ocr_image()`.
- **Unverändert:** `_is_scanned_page`, `_text_quality`-Schwelle 0,15, `MAX_OCR_PAGES = 250`, `_ocr_lock`, Fehler-Fallback auf `page.get_text()` pro Seite (deckt „Ollama läuft nicht / Modell nicht gepullt" ab — der Crawl bricht nie ab, die Seite bleibt textarm), `_normalize_german_text`, `parse_timeout_seconds` pro Dokument.
- Neuer Config-Key `ocr_model: str = "glm-ocr:latest"` (Backend-only, nicht in der UI — Konsistenz mit `embedding_model`).

### Betriebshinweise

- Voraussetzung einmalig: `ollama pull glm-ocr:latest` (2,2 GB) — Teil des Smoke-Tests.
- VLM-OCR ist pro Seite langsamer als EasyOCR (grob 2–10 s/Seite auf GPU). Bei Dokumenten mit vielen Scan-Seiten kann `parse_timeout_seconds` (1200 s) knapp werden — im Smoke-Test beobachten, ggf. Config-Wert erhöhen (kein Code-Change nötig).

## Teil 2: Umschaltbares Klassifikations-Modell

### Backend (`app/settings/router.py`)

- `ollama_model: str | None = None` in `SettingsUpdate` aufnehmen; `"ollama_model": s.ollama_model` in `_settings_response`. Persistenz/Cache-Clear/Live-Wirkung existieren bereits (Settings-PUT-Mechanik).

### Frontend (`SettingsPanel.tsx`, `types.ts`, `api.ts`-Typen, i18n)

- Neue Sektion **„KI-Modelle"** im SettingsPanel (nach „Ordner & Synchronisation"): ein Dropdown `ollama_model` mit genau zwei Optionen:
  - `qwen3:4b` — Label „qwen3:4b (lokal)"
  - `gemma4:31b-cloud` — Label „gemma4:31b-cloud (Cloud)"
- Unter dem Dropdown ein permanenter Hinweistext (i18n): „Cloud-Modelle verarbeiten Dokumentinhalte auf externen Servern." — dezent (text-xs, zinc-500), nicht nur bei Cloud-Auswahl (einfacher, immer ehrlich).
- `AppSettings`-Typ um `ollama_model: string` erweitern; DraftSettings entsprechend.

### Fehlerfälle

- Cloud-Modell nicht erreichbar / nicht angemeldet / Quota erschöpft → bestehende per-Dokument-Fehlerbehandlung des CLASSIFY-Jobs greift (Fehler werden gezählt und geloggt, Job läuft weiter). Kein neuer Fehlerpfad nötig.
- Unbekannter Modellwert in config.json (von Hand editiert): wird unverändert an Ollama durchgereicht; Ollama antwortet mit Fehler → gleiche per-Dokument-Fehlerbehandlung.

## Tests

- **GlmOcrClient:** gemockter HTTP-Transport (httpx MockTransport): korrekter Request-Aufbau (Modell, base64-Bild im `images`-Feld, temperature 0), Antwort-Extraktion, Timeout/HTTP-Fehler wirft Exception.
- **Parser:** OCR-Fehlerpfad → Fallback auf `page.get_text()` greift (GlmOcrClient gemockt); kein echter Ollama-Call, kein echtes Modell in CI.
- **Settings:** Roundtrip-Test `ollama_model` (PUT → GET liefert neuen Wert; config.json enthält ihn).
- **Frontend:** `tsc -b` + `npm run lint` (keine Frontend-Unit-Tests im Projekt).

## Ausgeklammert (bewusst)

- OCR-Engine-Umschalter (EasyOCR als Vergleichsoption) — ersatzlos ersetzt.
- Dynamische Modell-Liste von Ollama (`/api/tags`).
- Parallele Seiten-OCR / Async-Parser (Ansatz B).
- OCR-Qualitätsvergleich alt/neu als automatisierter Test — passiert manuell im Smoke-Test (rescan-no-text-Kandidaten).
