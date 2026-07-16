# GLM-OCR + umschaltbares Klassifikations-Modell — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** EasyOCR durch `glm-ocr:latest` (via Ollama) ersetzen und das Klassifikations-Modell in den Einstellungen zwischen `qwen3:4b` und `gemma4:31b-cloud` umschaltbar machen.

**Architecture:** Neuer synchroner `GlmOcrClient` (httpx gegen Ollama `/api/chat` mit Bild), der EasyOCR im OCR-Pfad von `parse_pdf` 1:1 ersetzt — Trigger-Logik, Lock, Limits und Fallback bleiben unverändert. Der Modell-Umschalter ist reine Settings-Verdrahtung: der CLASSIFY-Worker liest `settings.ollama_model` bereits pro Job frisch, es fehlen nur Update-Feld, Response-Feld und UI-Dropdown.

**Tech Stack:** FastAPI, httpx (sync Client + MockTransport), PyMuPDF, React 19, pydantic-settings.

**Spec:** `docs/superpowers/specs/2026-07-16-glm-ocr-und-modellwahl-design.md`

## Global Constraints

- Modell-Tags exakt: `glm-ocr:latest` (Default für neuen Config-Key `ocr_model`), Dropdown-Werte `qwen3:4b` und `gemma4:31b-cloud`
- OCR-Prompt exakt: `"Extract all text from this page exactly as written. Preserve the reading order. Output only the extracted text, no commentary."`
- OCR-Request: `POST /api/chat`, Bild base64 im `images`-Feld der User-Message, `options: {temperature: 0}`, `stream: false`, `keep_alive: -1`, Timeout 120 s
- Unverändert bleiben: `_is_scanned_page`, Qualitätsschwelle 0,15, `MAX_OCR_PAGES = 250`, `_ocr_lock`, per-Seite-Fallback auf `page.get_text()`, `_normalize_german_text`
- `easyocr` fliegt aus `backend/pyproject.toml`; `torch` bleibt (sentence-transformers braucht es)
- Tests machen NIE echte Ollama-Calls (httpx.MockTransport bzw. Fake-Client)
- Cloud-Hinweistext (i18n de): „Cloud-Modelle verarbeiten Dokumentinhalte auf externen Servern."
- Backend-Tests: `cd backend && uv run pytest tests/<datei> -v` | Frontend-Verify: `cd frontend && npx tsc -b && npm run lint` (2 bekannte Warnungen in DocumentsPage.tsx sind akzeptabel)

---

### Task 1: GlmOcrClient + Config-Key `ocr_model`

**Files:**
- Create: `backend/app/ingest/glm_ocr_client.py`
- Modify: `backend/app/config.py` (nach `embedding_model`, Zeile ~28)
- Modify: `config.example.json` (Key ergänzen)
- Test: `backend/tests/test_glm_ocr_client.py`

**Interfaces:**
- Produces: `class GlmOcrClient` mit `__init__(base_url: str, model: str, timeout: float = 120.0)`, `ocr_image(png_bytes: bytes) -> str`, `close() -> None`; Modul-Funktion `get_glm_ocr_client() -> GlmOcrClient` (lazy Prozess-Singleton, folgt `settings.ollama_url`/`settings.ocr_model`); Modul-Konstante `OCR_PROMPT`; Settings-Feld `ocr_model: str = "glm-ocr:latest"`

- [ ] **Step 1: Failing Tests schreiben**

```python
# backend/tests/test_glm_ocr_client.py
import base64
import json

import httpx
import pytest

from app.ingest.glm_ocr_client import GlmOcrClient, OCR_PROMPT


def _client_with_handler(handler) -> GlmOcrClient:
    client = GlmOcrClient("http://test", "glm-ocr:latest")
    client._client = httpx.Client(
        base_url="http://test", transport=httpx.MockTransport(handler)
    )
    return client


def test_ocr_image_builds_correct_request():
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        return httpx.Response(200, json={"message": {"content": "erkannt"}})

    client = _client_with_handler(handler)
    result = client.ocr_image(b"\x89PNG-fake-bytes")

    assert result == "erkannt"
    assert captured["model"] == "glm-ocr:latest"
    assert captured["stream"] is False
    assert captured["options"] == {"temperature": 0}
    assert captured["keep_alive"] == -1
    msg = captured["messages"][0]
    assert msg["role"] == "user"
    assert msg["content"] == OCR_PROMPT
    assert base64.b64decode(msg["images"][0]) == b"\x89PNG-fake-bytes"


def test_ocr_image_raises_on_http_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "boom"})

    client = _client_with_handler(handler)
    with pytest.raises(httpx.HTTPStatusError):
        client.ocr_image(b"png")


def test_ocr_model_config_default():
    from app.config import Settings
    assert Settings.model_fields["ocr_model"].default == "glm-ocr:latest"


def test_singleton_follows_settings(monkeypatch):
    import app.ingest.glm_ocr_client as mod
    monkeypatch.setattr(mod, "_client", None)
    c1 = mod.get_glm_ocr_client()
    c2 = mod.get_glm_ocr_client()
    assert c1 is c2
    from app.config import get_settings
    assert c1.model == get_settings().ocr_model
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `cd backend && uv run pytest tests/test_glm_ocr_client.py -v`
Expected: ERROR mit `ModuleNotFoundError: No module named 'app.ingest.glm_ocr_client'`

- [ ] **Step 3: Implementieren**

```python
# backend/app/ingest/glm_ocr_client.py
"""Synchroner OCR-Client gegen Ollama (glm-ocr).

Bewusst synchron: wird aus parse_pdf heraus aufgerufen, das per
asyncio.to_thread in einem Worker-Thread laeuft. Ein Client pro Prozess
(lazy Singleton); Aufrufe sind durch das _ocr_lock des Parsers serialisiert.
"""
import base64
import logging

import httpx

logger = logging.getLogger("litvault.ocr")

OCR_PROMPT = (
    "Extract all text from this page exactly as written. "
    "Preserve the reading order. Output only the extracted text, no commentary."
)


class GlmOcrClient:
    def __init__(self, base_url: str, model: str, timeout: float = 120.0):
        self.model = model
        self._client = httpx.Client(base_url=base_url, timeout=timeout)

    def ocr_image(self, png_bytes: bytes) -> str:
        body = {
            "model": self.model,
            "messages": [{
                "role": "user",
                "content": OCR_PROMPT,
                "images": [base64.b64encode(png_bytes).decode("ascii")],
            }],
            "stream": False,
            "options": {"temperature": 0},
            "keep_alive": -1,
        }
        response = self._client.post("/api/chat", json=body)
        response.raise_for_status()
        return response.json()["message"]["content"]

    def close(self) -> None:
        self._client.close()


_client: GlmOcrClient | None = None


def get_glm_ocr_client() -> GlmOcrClient:
    """Lazy Prozess-Singleton; folgt settings.ollama_url / settings.ocr_model."""
    global _client
    from app.config import get_settings

    settings = get_settings()
    if _client is None or _client.model != settings.ocr_model:
        _client = GlmOcrClient(settings.ollama_url, settings.ocr_model)
    return _client
```

In `backend/app/config.py` direkt nach `embedding_model: str = "nomic-ai/nomic-embed-text-v1.5"` einfügen:

```python
    ocr_model: str = "glm-ocr:latest"
```

In `config.example.json` den Key `"ocr_model": "glm-ocr:latest"` ergänzen (neben `embedding_max_chars`).

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `cd backend && uv run pytest tests/test_glm_ocr_client.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/ingest/glm_ocr_client.py backend/app/config.py backend/tests/test_glm_ocr_client.py config.example.json
git commit -m "feat: GlmOcrClient (sync Ollama-OCR) + ocr_model-Config (Task 1)"
```

---

### Task 2: Parser-Umbau auf GLM-OCR, EasyOCR entfernen

**Files:**
- Modify: `backend/app/ingest/parsers/pdf_parser.py` (Zeilen 1–37 Imports/Lazy-Init, Zeilen 75–92 `_ocr_page`, Zeile 142 Logtext)
- Modify: `backend/pyproject.toml` (Zeile 24: `easyocr>=1.7.2` entfernen)
- Test: `backend/tests/test_pdf_ocr_fallback.py`

**Interfaces:**
- Consumes: `get_glm_ocr_client()` aus Task 1 (Tests patchen `app.ingest.glm_ocr_client.get_glm_ocr_client` — der Parser importiert lazily im Funktionskörper, daher wirkt der Patch)
- Produces: unverändertes `parse_pdf(path) -> ParseResult`-Verhalten; kein `easyocr`/`numpy`/`PIL` mehr im Parser

- [ ] **Step 1: Failing Tests schreiben**

```python
# backend/tests/test_pdf_ocr_fallback.py
"""GLM-OCR-Pfad in parse_pdf: Erfolg und Fallback, ohne echten Ollama-Call."""
import fitz
import pytest

import app.ingest.glm_ocr_client as ocr_mod
from app.ingest.parsers.pdf_parser import parse_pdf


@pytest.fixture
def scanned_pdf(tmp_path):
    """Ein-Seiten-PDF ohne Textebene -> _is_scanned_page() ist True."""
    path = tmp_path / "scan.pdf"
    doc = fitz.open()
    doc.new_page(width=595, height=842)
    doc.save(str(path))
    doc.close()
    return path


class _FakeOcr:
    def __init__(self, result=None, error=None):
        self._result = result
        self._error = error
        self.calls = 0

    def ocr_image(self, png_bytes: bytes) -> str:
        self.calls += 1
        assert png_bytes[:4] == b"\x89PNG"  # echter Render-Output
        if self._error:
            raise self._error
        return self._result


def test_ocr_success_uses_glm_text(scanned_pdf, monkeypatch):
    fake = _FakeOcr(result="ERKANNTER SCAN-TEXT")
    monkeypatch.setattr(ocr_mod, "get_glm_ocr_client", lambda: fake)

    result = parse_pdf(scanned_pdf)

    assert result.error is None
    assert "ERKANNTER SCAN-TEXT" in result.text
    assert result.has_text is True
    assert result.ocr_pages == [0]
    assert fake.calls == 1


def test_ocr_failure_falls_back_to_page_text(scanned_pdf, monkeypatch):
    fake = _FakeOcr(error=RuntimeError("ollama down"))
    monkeypatch.setattr(ocr_mod, "get_glm_ocr_client", lambda: fake)

    result = parse_pdf(scanned_pdf)

    # Kein Crash: Seite bleibt textarm, Dokument wird trotzdem verarbeitet
    assert result.error is None
    assert result.ocr_pages == []
    assert result.has_text is False
    assert fake.calls == 1
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `cd backend && uv run pytest tests/test_pdf_ocr_fallback.py -v`
Expected: FAIL — der Fake wird nie aufgerufen (`fake.calls == 0`), weil `_ocr_page` noch EasyOCR nutzt (bzw. EasyOCR-Init schlägt an/liefert leer)

- [ ] **Step 3: Parser umbauen**

In `pdf_parser.py`:

1. Imports entfernen: `import numpy as np` (Zeile 3) und `from PIL import Image` (Zeile 12) — beide werden nur im alten OCR-Pfad genutzt.
2. Den Block Zeilen 18–37 (`_ocr_reader`-Global, `_get_ocr()`-Funktion) ersetzen durch:

```python
# OCR laeuft ueber Ollama (glm-ocr); das Lock verhindert sinnloses Anstauen
# paralleler Requests — die GPU bedient ohnehin seriell.
_ocr_lock = threading.Lock()
```

3. `_ocr_page` (Zeilen 75–92) komplett ersetzen:

```python
def _ocr_page(page: fitz.Page) -> str:
    """Render page at 200 DPI and run GLM-OCR via Ollama."""
    from app.ingest.glm_ocr_client import get_glm_ocr_client

    png_bytes = page.get_pixmap(dpi=200).tobytes("png")
    with _ocr_lock:
        return get_glm_ocr_client().ocr_image(png_bytes)
```

4. Logzeile 142 anpassen: `"EasyOCR page %d/%d (attempt %d) of %s"` → `"GLM-OCR page %d/%d (attempt %d) of %s"`.

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `cd backend && uv run pytest tests/test_pdf_ocr_fallback.py -v`
Expected: 2 passed

- [ ] **Step 5: easyocr aus den Dependencies entfernen**

In `backend/pyproject.toml` die Zeile `"easyocr>=1.7.2",` löschen, dann:

Run: `cd backend && uv sync`
Expected: easyocr (und Abhängigkeiten wie opencv-python-headless, die nur easyocr brauchte) werden entfernt; torch bleibt (sentence-transformers).

Danach voller Suite-Lauf als Regressionsnetz:

Run: `cd backend && uv run pytest -q`
Expected: alle Tests passed (103 vorher + 2 neue aus diesem Task + 4 aus Task 1 = 109)

- [ ] **Step 6: Commit**

```bash
git add backend/app/ingest/parsers/pdf_parser.py backend/pyproject.toml backend/uv.lock backend/tests/test_pdf_ocr_fallback.py
git commit -m "feat: OCR-Pfad auf glm-ocr umgestellt, EasyOCR entfernt (Task 2)"
```

---

### Task 3: Settings-API — `ollama_model` update- und lesbar

**Files:**
- Modify: `backend/app/settings/router.py` (`SettingsUpdate` Zeilen 11–20, `_settings_response` Zeilen 23–37)
- Test: `backend/tests/test_settings_api.py` (neu)

**Interfaces:**
- Produces: `PUT /api/settings` akzeptiert `{"ollama_model": "..."}`; `GET /api/settings` liefert `ollama_model` im Response-Dict. Wert wird in config.json persistiert; Live-Wirkung über bestehendes `get_settings.cache_clear()` (Worker liest pro Job frisch).

- [ ] **Step 1: Failing Tests schreiben**

Wichtig: Der Settings-Router schreibt in `CONFIG_PATH` (die echte Repo-`config.json`), und `Settings.model_config["json_file"]` wird zur Importzeit gebunden. Der Test MUSS daher drei Stellen auf eine Temp-Datei patchen — sonst verschmutzt er die echte Config:

```python
# backend/tests/test_settings_api.py
"""Roundtrip-Tests fuer den Settings-Router (ollama_model).

CONFIG_PATH wird an drei Stellen auf tmp gepatcht: app.config (Modul-Global,
von settings_customise_sources geprueft), app.settings.router (lokale
Import-Bindung, Schreibziel des PUT) und Settings.model_config["json_file"]
(zur Importzeit gebundene Lese-Quelle der JsonConfigSettingsSource).
"""
import json

import pytest
from httpx import ASGITransport, AsyncClient

import app.config as config_mod
import app.settings.router as settings_router_mod
from app.config import Settings, get_settings
from app.main import app


@pytest.fixture
async def client(tmp_path, monkeypatch):
    cfg = tmp_path / "config.json"
    cfg.write_text('{"ollama_model": "qwen3:4b"}', encoding="utf-8")
    monkeypatch.setattr(config_mod, "CONFIG_PATH", cfg)
    monkeypatch.setattr(settings_router_mod, "CONFIG_PATH", cfg)
    monkeypatch.setitem(Settings.model_config, "json_file", cfg)
    get_settings.cache_clear()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    # Teardown: monkeypatch stellt die Pfade zurueck; Cache leeren, damit
    # nachfolgende Tests nicht die tmp-Settings sehen.
    get_settings.cache_clear()


async def test_get_settings_contains_ollama_model(client):
    resp = await client.get("/api/settings")
    assert resp.status_code == 200
    assert resp.json()["ollama_model"] == "qwen3:4b"


async def test_ollama_model_roundtrip(client, tmp_path):
    resp = await client.put("/api/settings", json={"ollama_model": "gemma4:31b-cloud"})
    assert resp.status_code == 200
    assert resp.json()["ollama_model"] == "gemma4:31b-cloud"

    on_disk = json.loads((tmp_path / "config.json").read_text(encoding="utf-8"))
    assert on_disk["ollama_model"] == "gemma4:31b-cloud"

    resp = await client.get("/api/settings")
    assert resp.json()["ollama_model"] == "gemma4:31b-cloud"


async def test_put_without_ollama_model_leaves_it_unchanged(client, tmp_path):
    resp = await client.put("/api/settings", json={"theme": "light"})
    assert resp.status_code == 200
    assert resp.json()["ollama_model"] == "qwen3:4b"
    on_disk = json.loads((tmp_path / "config.json").read_text(encoding="utf-8"))
    assert on_disk["ollama_model"] == "qwen3:4b"
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `cd backend && uv run pytest tests/test_settings_api.py -v`
Expected: FAIL mit `KeyError: 'ollama_model'` (Response enthält das Feld nicht)

- [ ] **Step 3: Implementieren**

In `settings/router.py`, `SettingsUpdate` um das Feld erweitern (nach `poll_interval_seconds`):

```python
    ollama_model: str | None = None
```

In `_settings_response` (vor `"db_path"`):

```python
        "ollama_model": s.ollama_model,
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `cd backend && uv run pytest tests/test_settings_api.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/settings/router.py backend/tests/test_settings_api.py
git commit -m "feat: ollama_model ueber Settings-API les- und schreibbar (Task 3)"
```

---

### Task 4: Frontend — Sektion „KI-Modelle" + Gesamt-Verifikation

**Files:**
- Modify: `frontend/src/lib/types.ts` (`AppSettings`-Interface, Zeilen 79–96)
- Modify: `frontend/src/hooks/useSettings.ts` (`DEFAULTS`, Zeilen 6–19)
- Modify: `frontend/src/components/SettingsPanel.tsx` (`DraftSettings` Zeilen 11–21, Initial-Draft Zeilen 32–42, Effect-Mapping Zeilen 51–61, neue Sektion nach „Ordner & Synchronisation" Zeile ~298)
- Modify: `frontend/src/i18n/translations.ts` (3 Keys in `de` UND `en`)

**Interfaces:**
- Consumes: `GET/PUT /api/settings` mit `ollama_model` (Task 3)
- Produces: Dropdown mit exakt zwei Optionen (`qwen3:4b`, `gemma4:31b-cloud`) in einer neuen Settings-Sektion „KI-Modelle", permanenter Cloud-Hinweis darunter.

- [ ] **Step 1: Typ + Defaults erweitern**

In `types.ts`, `AppSettings` nach `poll_interval_seconds: number;` ergänzen:

```typescript
  // KI-Modelle
  ollama_model: string;
```

In `useSettings.ts`, `DEFAULTS` nach `poll_interval_seconds: 30,` ergänzen:

```typescript
  ollama_model: 'qwen3:4b',
```

- [ ] **Step 2: SettingsPanel erweitern**

In `SettingsPanel.tsx`:

1. `DraftSettings` um `ollama_model: string;` ergänzen (nach `poll_interval_seconds`).
2. Initial-Draft um `ollama_model: 'qwen3:4b',` ergänzen.
3. Im Lade-Effect das Mapping um `ollama_model: s.ollama_model,` ergänzen.
4. Nach der Sektion „Ordner & Synchronisation" (nach deren schließendem `</section>`, Zeile ~298) einfügen:

```tsx
            {/* --- KI-Modelle --- */}
            <section>
              <h3 className={sectionTitle}>{t('settings.aiModels')}</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">{t('settings.classificationModel')}</label>
                  <select
                    value={draft.ollama_model}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, ollama_model: e.target.value }))
                    }
                    className={selectClass}
                  >
                    <option value="qwen3:4b">qwen3:4b (lokal)</option>
                    <option value="gemma4:31b-cloud">gemma4:31b-cloud (Cloud)</option>
                  </select>
                  <p className="mt-1 text-xs text-zinc-500">{t('settings.cloudHint')}</p>
                </div>
              </div>
            </section>
```

- [ ] **Step 3: i18n-Keys ergänzen**

Im `de`-Objekt von `translations.ts` (bei den anderen `settings.*`-Keys):

```typescript
  "settings.aiModels": "KI-Modelle",
  "settings.classificationModel": "Klassifikations-Modell",
  "settings.cloudHint": "Cloud-Modelle verarbeiten Dokumentinhalte auf externen Servern.",
```

Im `en`-Objekt analog:

```typescript
  "settings.aiModels": "AI models",
  "settings.classificationModel": "Classification model",
  "settings.cloudHint": "Cloud models process document contents on external servers.",
```

- [ ] **Step 4: Frontend-Verify**

Run: `cd frontend && npx tsc -b && npm run lint`
Expected: 0 Fehler (2 bekannte Warnungen in DocumentsPage.tsx)

- [ ] **Step 5: Backend-Gesamtlauf (Plan-Abschluss)**

Run: `cd backend && uv run pytest -q`
Expected: alle Tests passed (112 = 103 Bestand + 4 Task 1 + 2 Task 2 + 3 Task 3), keine Regression

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/hooks/useSettings.ts frontend/src/components/SettingsPanel.tsx frontend/src/i18n/translations.ts
git commit -m "feat: Settings-Sektion KI-Modelle mit Modell-Dropdown + Cloud-Hinweis (Task 4)"
```

---

## Manueller Smoke-Test (nach Abschluss, mit dem User)

Nicht Teil der automatisierten Tasks — erfordert die echte App und Ollama:

1. **Einmalig:** `ollama pull glm-ocr:latest` (2,2 GB). Für das Cloud-Modell muss die Ollama-Installation bei ollama.com angemeldet sein (`ollama signin`), sonst schlägt `gemma4:31b-cloud` mit Auth-Fehler fehl (wird pro Dokument gezählt, bricht nichts).
2. **OCR:** App starten, im Dashboard „OCR-Rescan" (rescan-no-text) für einige Scan-Kandidaten anstoßen; im Log auf `GLM-OCR page ...`-Zeilen und Textqualität im Dokument-Detail achten. Beobachten, ob `parse_timeout_seconds` (1200 s) bei scanlastigen Dokumenten reicht — GLM-OCR braucht grob 2–10 s/Seite; bei Bedarf den Wert in `config.json` erhöhen (kein Code-Change).
3. **Modellwechsel:** Einstellungen → „KI-Modelle" → `gemma4:31b-cloud` wählen, speichern, ein einzelnes Dokument neu klassifizieren (Detail-Ansicht → Klassifizieren) und Ergebnisqualität mit `qwen3:4b` vergleichen. Der Wechsel greift ohne App-Neustart ab dem nächsten Job.
