# LitVault Performance + Umbau — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LitVault spürbar beschleunigen (Suche, Ingest, Klassifikation), Altlasten beseitigen, Test-Fundament legen, LLM aktualisieren — gemäß Spec `docs/superpowers/specs/2026-07-02-litvault-performance-umbau-design.md`.

**Architecture:** FastAPI-Backend (`backend/app`, Python 3.12, SQLAlchemy async + SQLite/FTS5) + React-19-Frontend (`frontend/src`, Vite/TS). Änderungen erfolgen in 7 Arbeitspaketen (AP1–AP7), jedes AP endet mit grünem Test-Stand und eigenem Commit. Reihenfolge ist verbindlich: AP3 (Alembic) muss vor AP4 (Index-Migrationen) laufen.

**Tech Stack:** pytest + pytest-asyncio + httpx (neu), Alembic, aiosqlite, Ollama (qwen3-Familie), pymupdf4llm/EasyOCR, ESLint 9 / tsc.

## Global Constraints

- Arbeitsverzeichnis Backend: `C:\Coding\LitVault\backend`, Python-Aufrufe immer über `.venv\Scripts\python` (dort liegt CUDA-torch).
- Arbeitsverzeichnis Frontend: `C:\Coding\LitVault\frontend`, Node-Aufrufe über `npm`/`npx`.
- API-Verträge (Pfade, Response-Shapes) bleiben unverändert, außer: neuer optionaler Query-Param `include_facets` (AP4).
- Keine neuen Runtime-Dependencies im Backend außer dev-Dependencies (pytest-Familie).
- Embeddings/semantische Suche NICHT anfassen (Tabelle + `sentence-transformers` bleiben bestehen).
- Jeder Task endet mit Verifikation (Test/Lint/Messung) und einem Commit. Commit-Messages: deutsch oder englisch im Stil des Repos (`feat:`, `fix:`, `chore:`, `test:`, `perf:`, `refactor:`).
- Nach jedem Frontend-Task: `npx tsc -b` und `npx eslint .` müssen sauber sein (eslint ab Task 3).
- Nach jedem Backend-Task (ab Task 5): `.venv\Scripts\python -m pytest` muss grün sein.
- Die SQLite-DB `backend/litvault.db` enthält echte Daten (2.093 Dokumente) — niemals löschen oder überschreiben. Tests laufen ausschließlich gegen In-Memory-/Temp-Datenbanken.

---

## AP1 — Housekeeping

### Task 1: Git-Stand aufräumen + config.json aus dem Tracking nehmen

**Files:**
- Create: `config.example.json`
- Modify: `.gitignore`
- Untrack (Datei bleibt lokal): `config.json`
- Commit: `STATUS.md` (as-is, persönliche Statusdatei des Nutzers — Inhalt NICHT ändern)

**Interfaces:**
- Produces: `config.example.json` als getrackte Vorlage; reales `config.json` ist ab jetzt lokal. `app/config.py` liest weiterhin `config.json` (Pfad `CONFIG_PATH` in `backend/app/config.py:8` zeigt auf Repo-Root) — Fallback auf Code-Defaults existiert bereits (`SettingsConfigDict(json_file=... if exists else None)`), keine Code-Änderung nötig.

- [ ] **Step 1: config.example.json erstellen** (neutrale Werte, keine maschinenspezifischen Pfade):

```json
{
  "watch_folders": [
    "C:/Pfad/zu/deinen/Dokumenten"
  ],
  "ollama_url": "http://localhost:11434",
  "ollama_model": "qwen3:4b",
  "ollama_num_ctx": 4096,
  "embedding_model": "nomic-ai/nomic-embed-text-v1.5",
  "db_path": "litvault.db",
  "thumbnails_dir": "thumbnails",
  "log_level": "INFO",
  "poll_interval_seconds": 30,
  "language": "de",
  "theme": "light",
  "start_page": "search",
  "results_per_page": 100,
  "default_sort": "date_asc",
  "view_mode": "grid",
  "show_favorites_sidebar": true
}
```

- [ ] **Step 2: .gitignore ergänzen** — am Ende anfügen:

```gitignore
# Lokale Konfiguration (Vorlage: config.example.json)
/config.json
```

- [ ] **Step 3: config.json aus dem Index nehmen, alles committen**

```bash
cd C:/Coding/LitVault
git reset            # halb-gestagten Zustand von config.json auflösen
git rm --cached config.json
git add .gitignore config.example.json STATUS.md
git commit -m "chore: config.json aus Tracking entfernen, config.example.json als Vorlage"
```

- [ ] **Step 4: Verifizieren**

Run: `git status --short` → `config.json` erscheint NICHT mehr (weder staged noch modified). `git ls-files config.json` → leer.
Run: `cd backend && .venv\Scripts\python -c "from app.config import get_settings; print(get_settings().watch_folders)"` → gibt weiterhin die echten Ordner aus (config.json existiert ja lokal noch).

### Task 2: Dead Code löschen (4 Komponenten, ~1.100 Zeilen)

**Files:**
- Delete: `frontend/src/components/DocumentDetail.tsx`
- Delete: `frontend/src/components/FilterSidebar.tsx`
- Delete: `frontend/src/components/Toolbar.tsx`
- Delete: `frontend/src/components/FavoritesSidebar.tsx`

- [ ] **Step 1: Import-Freiheit erneut verifizieren** (muss VOR dem Löschen laufen):

```bash
cd C:/Coding/LitVault/frontend
grep -rn "components/DocumentDetail'" src/ ; grep -rn "components/FilterSidebar" src/ ; grep -rn "components/Toolbar'" src/ ; grep -rn "components/FavoritesSidebar" src/
```

Expected: **keine Treffer** (Achtung: `DocumentToolbar` und `detail/DocumentDetailPage` sind andere Dateien und bleiben!). Falls doch Treffer: STOPP, Befund melden statt löschen.

- [ ] **Step 2: Dateien löschen**

```bash
git rm frontend/src/components/DocumentDetail.tsx frontend/src/components/FilterSidebar.tsx frontend/src/components/Toolbar.tsx frontend/src/components/FavoritesSidebar.tsx
```

- [ ] **Step 3: Build verifizieren**

Run: `cd C:/Coding/LitVault/frontend && npx tsc -b`
Expected: Exit 0, keine Fehler.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: tote Pre-M5-Komponenten entfernt (DocumentDetail, FilterSidebar, Toolbar, FavoritesSidebar)"
```

### Task 3: Alle 10 ESLint-Fehler beheben

**Files:**
- Modify: `frontend/src/components/ui/badge.tsx` / Create: `frontend/src/components/ui/badge-variants.ts`
- Modify: `frontend/src/components/ui/button.tsx` / Create: `frontend/src/components/ui/button-variants.ts`
- Modify: `frontend/src/i18n/context.tsx`, `frontend/src/i18n/index.ts`
- Modify: `frontend/src/components/ExportButton.tsx`, `ResultsList.tsx`, `ReviewQueue.tsx`, `TagEditor.tsx`, `JobProgress.tsx`, `detail/ContentTab.tsx`, `filters/DateRangeFilter.tsx`

Die 10 Fehler (Stand `npx eslint .`):
1. `ExportButton.tsx:24` `no-explicit-any` — `(window as any).showSaveFilePicker`
2. `JobProgress.tsx:149` `set-state-in-effect`
3. `ResultsList.tsx:23` `no-unused-vars` — `offset: _offset`
4. `ReviewQueue.tsx:20` `set-state-in-effect`
5. `TagEditor.tsx:26` `set-state-in-effect`
6. `ContentTab.tsx:15` `set-state-in-effect`
7. `DateRangeFilter.tsx:20` `set-state-in-effect`
8. `badge.tsx:52` `only-export-components`
9. `button.tsx:58` `only-export-components`
10. `i18n/context.tsx:30` `only-export-components`

- [ ] **Step 1: cva-Varianten in eigene Dateien** — `badge-variants.ts` erstellen: den kompletten `const badgeVariants = cva(...)`-Block (Zeilen 7–28 aus `badge.tsx`) samt `import { cva } from "class-variance-authority"` dorthin verschieben, mit `export const badgeVariants = ...`. In `badge.tsx`: `import { badgeVariants } from "./badge-variants"`, `type VariantProps`-Import bleibt, Export-Zeile ändern zu `export { Badge }`. Danach prüfen, wer `badgeVariants` importiert (`grep -rn "badgeVariants" src/`) und diese Importe auf `@/components/ui/badge-variants` umstellen. Identisch für `button.tsx` → `button-variants.ts` (`buttonVariants`, Zeilen 6–41).

- [ ] **Step 2: i18n-Hook trennen** — In `context.tsx` den `useTranslation`-Export entfernen und Context exportierbar machen:

```tsx
// context.tsx: Ende der Datei ersetzen
export { I18nCtx };
```

`useTranslation` wandert nach `frontend/src/i18n/index.ts` (falls dort re-exportiert wird, Signatur beibehalten):

```tsx
// i18n/index.ts — Hook hier definieren
import { useContext } from 'react';
import { I18nCtx } from './context';

export function useTranslation() {
  return useContext(I18nCtx);
}
export { LanguageProvider } from './context';
export type { TranslationKey, Language } from './translations';
```

Danach `grep -rn "from '@/i18n/context'" src/` — alle Verwendungen von `useTranslation` müssen aus `@/i18n` importieren (waren sie vermutlich schon via index).

- [ ] **Step 3: `no-explicit-any` in ExportButton** — Zeile 24 ersetzen:

```tsx
const handle = await (window as unknown as {
  showSaveFilePicker: (opts: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle>;
}).showSaveFilePicker({
```

- [ ] **Step 4: unused `_offset` in ResultsList** — In `ResultsListProps` (Zeile ~10–21) die Property `offset` entfernen und in der Destrukturierung Zeile 23 `offset: _offset,` streichen. Danach `grep -n "offset" src/pages/DocumentsPage.tsx | grep ResultsList` — falls DocumentsPage `offset={...}` an ResultsList übergibt, dieses Prop dort ebenfalls entfernen.

- [ ] **Step 5: Die 5 `set-state-in-effect`-Fälle beheben.** Muster: Fetch-Effekte dürfen setState nur in `.then`-Callbacks aufrufen; synchrones `setLoading(true)` am Effect-Anfang wird durch Initialwert `useState(true)` bzw. einen von der Abhängigkeit abgeleiteten Zustand ersetzt.
  - `ReviewQueue.tsx:20` und `ContentTab.tsx:15`: `const [loading, setLoading] = useState(false)` → `useState(true)`; das synchrone `setLoading(true)` im Effect löschen (Re-Fetches setzen es im Callback vor dem erneuten fetch — falls der Effect von einer Prop wie `doc.id` abhängt und mehrfach feuert, stattdessen `setLoading(true)` in den `.then`-freien Teil einer async-IIFE verschieben: `(async () => { ... })()` gilt ebenfalls als asynchron und ist regelkonform, wenn setState nach dem ersten `await` erfolgt).
  - `TagEditor.tsx:26` (`fetchTags()`) und `JobProgress.tsx:149` (`fetchJobs().then(...)`): der setState passiert bereits asynchron in `.then` — die Regel meckert über den synchronen Aufruf der Funktion, die intern sofort setState macht. Fix: sicherstellen, dass in `fetchTags`/`fetchJobs` vor dem ersten setState ein `await` liegt (setState erst nach `await fetch(...)`), und die Warnung `exhaustive-deps` durch `useCallback` um `fetchTags`/`connectSSE` + Aufnahme in die Dependency-Liste lösen.
  - `DateRangeFilter.tsx:19–22` (Props→State-Sync): Effect ersetzen durch Render-Zeit-Sync mit vorherigem-Wert-Vergleich (offizielles React-Muster):

```tsx
const [prevAfter, setPrevAfter] = useState(createdAfter)
const [prevBefore, setPrevBefore] = useState(createdBefore)
if (prevAfter !== createdAfter || prevBefore !== createdBefore) {
  setPrevAfter(createdAfter)
  setPrevBefore(createdBefore)
  setLocalAfter(createdAfter ?? '')
  setLocalBefore(createdBefore ?? '')
}
```

(den `useEffect` Zeilen 18–22 ersatzlos streichen; `useEffect`-Import bleibt für den Click-Outside-Effect.)

- [ ] **Step 6: Verifizieren**

Run: `cd C:/Coding/LitVault/frontend && npx eslint . && npx tsc -b`
Expected: **0 errors**. Verbleibende `exhaustive-deps`-Warnings in `DocumentsPage.tsx` sind erlaubt (werden dort absichtlich mit Kommentar unterdrückt bzw. bleiben Warnungen); Ziel dieses Tasks sind die 10 Errors.

- [ ] **Step 7: Commit**

```bash
git add -A frontend/src && git commit -m "fix: alle ESLint-Fehler behoben (fast-refresh-Exports, set-state-in-effect, any, unused)"
```

### Task 4: Dependency-Management vereinheitlichen (uv)

**Files:**
- Modify: `.gitignore` (Zeile `backend/uv.lock` entfernen)
- Delete: `backend/requirements.txt`
- Track: `backend/uv.lock`

- [ ] **Step 1:** `.gitignore`: die Zeile `backend/uv.lock` (unter `# uv`) samt Kommentar löschen.
- [ ] **Step 2:** `git rm backend/requirements.txt`
- [ ] **Step 3:** Verifizieren, dass nichts requirements.txt referenziert: `grep -rn "requirements.txt" C:/Coding/LitVault --include="*.md" --include="*.bat" --include="*.py" --include="*.toml"` → Treffer nur in Doku/Plan-Dateien sind ok; `start.bat`/Code-Treffer müssen auf `uv sync` umgestellt werden.
- [ ] **Step 4: Commit**

```bash
git add .gitignore backend/uv.lock && git commit -m "chore: uv.lock versionieren, requirements.txt entfernt (uv ist einzige Quelle)"
```

---

## AP2 — Test-Fundament (Backend)

### Task 5: pytest-Setup + Sanitizer-Tests

**Files:**
- Modify: `backend/pyproject.toml`
- Create: `backend/tests/__init__.py` (leer), `backend/tests/test_sanitizer.py`

**Interfaces:**
- Consumes: `app.search.sanitizer.sanitize_fts5_query`, `sanitize_fts5_query_with_prefix` (beide `str -> str`)
- Produces: lauffähige pytest-Umgebung; Konvention `backend/tests/`, `asyncio_mode = "auto"`

- [ ] **Step 1: Dev-Dependencies + pytest-Konfiguration** — in `backend/pyproject.toml` ergänzen:

```toml
[dependency-groups]
dev = [
    "pytest>=8",
    "pytest-asyncio>=0.24",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

Dann: `cd C:/Coding/LitVault/backend && uv sync` (falls `uv` fehlt: `.venv\Scripts\pip install pytest pytest-asyncio` und pyproject trotzdem committen).

- [ ] **Step 2: Failing Tests schreiben** — `backend/tests/test_sanitizer.py`:

```python
from app.search.sanitizer import sanitize_fts5_query, sanitize_fts5_query_with_prefix


class TestSanitizeBasic:
    def test_single_word_quoted(self):
        assert sanitize_fts5_query("getriebe") == '"getriebe"'

    def test_multiple_words(self):
        assert sanitize_fts5_query("kegelrad getriebe") == '"kegelrad" "getriebe"'

    def test_empty_string(self):
        assert sanitize_fts5_query("") == ""

    def test_whitespace_only(self):
        assert sanitize_fts5_query("   ") == ""

    def test_hyphen_becomes_space(self):
        assert sanitize_fts5_query("kegel-rad") == '"kegel" "rad"'

    def test_special_chars_removed(self):
        assert sanitize_fts5_query('test* "quoted" (paren) col:on ^caret') == \
            '"test" "quoted" "paren" "colon" "caret"'

    def test_only_special_chars(self):
        assert sanitize_fts5_query('*"():^') == ""


class TestSanitizePrefix:
    def test_last_word_gets_prefix_star(self):
        assert sanitize_fts5_query_with_prefix("getriebe") == "getriebe*"

    def test_earlier_words_quoted_last_prefixed(self):
        assert sanitize_fts5_query_with_prefix("kegelrad getr") == '"kegelrad" getr*'

    def test_empty(self):
        assert sanitize_fts5_query_with_prefix("") == ""

    def test_umlauts_survive(self):
        assert sanitize_fts5_query_with_prefix("verzahnungsträger") == "verzahnungsträger*"
```

- [ ] **Step 3: Laufen lassen** — Run: `.venv\Scripts\python -m pytest tests/test_sanitizer.py -v`
Expected: alle PASS (der Code existiert ja schon — hier sichern Tests bestehendes Verhalten; falls ein Test FAILT, ist das ein echter Befund: Test-Erwartung gegen Implementierung prüfen und den Test an die tatsächliche — korrekte — Semantik anpassen, nicht blind den Code ändern).

- [ ] **Step 4: Commit**

```bash
git add backend/pyproject.toml backend/uv.lock backend/tests/ && git commit -m "test: pytest-Setup + FTS5-Sanitizer-Tests"
```

### Task 6: Tests für filename_extractor + Confidence-Tiers

**Files:**
- Create: `backend/tests/test_filename_extractor.py`, `backend/tests/test_classification_tiers.py`

- [ ] **Step 1: Tests schreiben** — `test_filename_extractor.py`:

```python
from app.classification.filename_extractor import extract_from_filename


def test_year_extraction():
    meta = extract_from_filename("Bericht_Kegelrad_2019.pdf")
    assert meta.year == 2019

def test_no_year():
    assert extract_from_filename("Kegelradbericht.pdf").year is None

def test_leading_date_prefix_removed():
    meta = extract_from_filename("20170718_Analyse Flankenbruch.pdf")
    assert meta.title == "Analyse Flankenbruch"
    assert meta.doc_type == "report"

def test_fva_heft_title_extraction():
    meta = extract_from_filename("FVA-Heft 1234 - Tragfähigkeit von Kegelrädern.pdf")
    assert meta.doc_type == "report"
    assert meta.title == "Tragfähigkeit von Kegelrädern"

def test_underscores_become_spaces():
    meta = extract_from_filename("Wärmebehandlung_Einsatzstahl.pdf")
    assert meta.title == "Wärmebehandlung Einsatzstahl"

def test_dissertation_detected():
    assert extract_from_filename("Diss_Mustermann_2015.pdf").doc_type == "dissertation"

def test_presentation_detected():
    assert extract_from_filename("Präsentation_Projektstand.pptx").doc_type == "presentation"
```

`test_classification_tiers.py` (ClassificationService ohne Ollama instanziierbar machen: Konstruktor akzeptiert das Client-Objekt, für Tier-Tests genügt `ClassificationService(ollama=None)` — falls der Konstruktor `None` nicht akzeptiert, Typ auf `OllamaClient | None` erweitern; `get_confidence_tier` benutzt den Client nicht):

```python
from app.classification.service import ClassificationService, CONFIDENCE_AUTO, CONFIDENCE_REVIEW


def _svc() -> ClassificationService:
    return ClassificationService(ollama=None)  # type: ignore[arg-type]

def test_tier_auto():
    assert _svc().get_confidence_tier(CONFIDENCE_AUTO) == "auto"
    assert _svc().get_confidence_tier(0.99) == "auto"

def test_tier_needs_review():
    assert _svc().get_confidence_tier(CONFIDENCE_REVIEW) == "needs-review"
    assert _svc().get_confidence_tier(0.7) == "needs-review"

def test_tier_unclassified():
    assert _svc().get_confidence_tier(0.54) == "unclassified"
    assert _svc().get_confidence_tier(0.0) == "unclassified"
```

- [ ] **Step 2: Laufen lassen** — Run: `.venv\Scripts\python -m pytest tests/ -v` → Expected: PASS (gleiches Vorgehen wie Task 5 Step 3 bei Abweichungen).
- [ ] **Step 3: Commit** — `git add backend/tests/ && git commit -m "test: filename_extractor + Confidence-Tier-Tests"`

### Task 7: SearchService-Tests gegen In-Memory-FTS5-Datenbank

**Files:**
- Create: `backend/tests/conftest.py`, `backend/tests/test_search_service.py`

**Interfaces:**
- Produces: Fixture `db_session` (AsyncSession gegen In-Memory-SQLite mit documents-Schema + FTS5 + Triggern + Seed-Daten) — wird von AP4-Tests weiterverwendet.

- [ ] **Step 1: conftest.py schreiben:**

```python
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.documents import models  # noqa: F401 — Modelle registrieren

FTS_SETUP = [
    """CREATE VIRTUAL TABLE documents_fts USING fts5(
        title, authors, full_text, summary, file_path,
        content=documents, content_rowid=id,
        tokenize='porter unicode61 remove_diacritics 1')""",
    """CREATE TRIGGER documents_ai AFTER INSERT ON documents BEGIN
        INSERT INTO documents_fts(rowid, title, authors, full_text, summary, file_path)
        VALUES (new.id, new.title, new.authors, new.full_text, new.summary, new.file_path);
    END""",
    """CREATE TRIGGER documents_au AFTER UPDATE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, title, authors, full_text, summary, file_path)
        VALUES ('delete', old.id, old.title, old.authors, old.full_text, old.summary, old.file_path);
        INSERT INTO documents_fts(rowid, title, authors, full_text, summary, file_path)
        VALUES (new.id, new.title, new.authors, new.full_text, new.summary, new.file_path);
    END""",
]

SEED = [
    # (file_path, title, year, doc_type, file_type, processing_status, full_text)
    ("a/kegelrad.pdf", "Kegelrad Tragfähigkeit", 2019, "bericht", "pdf", "done", "Untersuchung der Tragfähigkeit von Kegelrädern unter Last"),
    ("a/stirnrad.pdf", "Stirnradgetriebe NVH", 2021, "paper", "pdf", "done", "NVH Analyse von Stirnradgetrieben"),
    ("b/norm.pdf", "ISO 10300", 2014, "norm", "pdf", "done", "Tragfähigkeitsberechnung von Kegelrädern nach ISO"),
    ("b/notiz.docx", "Interne Notiz", None, "interne_notiz", "docx", "error", None),
]


@pytest.fixture
async def db_session():
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for stmt in FTS_SETUP:
            await conn.execute(text(stmt))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        for fp, title, year, dt, ft, status, ftxt in SEED:
            await session.execute(text(
                "INSERT INTO documents (file_path, file_hash, file_type, title, year, doc_type,"
                " processing_status, has_text, excluded, full_text, created_at, updated_at)"
                " VALUES (:fp, :fh, :ft, :title, :year, :dt, :status, :has_text, 0, :ftxt,"
                " datetime('now'), datetime('now'))"
            ), {"fp": fp, "fh": f"hash-{fp}", "ft": ft, "title": title, "year": year,
                "dt": dt, "status": status, "has_text": ftxt is not None, "ftxt": ftxt})
        await session.commit()
        yield session
    await engine.dispose()
```

Hinweis: Die Spalten in `INSERT` müssen zu `app/documents/models.py` passen — beim Schreiben prüfen (`PRAGMA table_info(documents)` via Test laufen lassen) und NOT-NULL-Spalten ergänzen, falls der Insert fehlschlägt.

- [ ] **Step 2: Failing Tests schreiben** — `test_search_service.py`:

```python
from app.search.service import SearchService, SearchFilters


async def test_fts_search_finds_match(db_session):
    result = await SearchService(db_session).search("kegelrad", limit=10)
    assert result.total == 2  # kegelrad.pdf + norm.pdf (full_text)
    paths = {d["file_path"] for d in result.documents}
    assert "a/kegelrad.pdf" in paths and "b/norm.pdf" in paths

async def test_browse_empty_query_returns_all_non_excluded(db_session):
    result = await SearchService(db_session).search("", limit=10)
    assert result.total == 4

async def test_browse_does_not_leak_full_text(db_session):
    result = await SearchService(db_session).search("", limit=10)
    for doc in result.documents:
        assert "full_text" not in doc  # AP4-Fix; DARF anfangs failen → siehe Step 3

async def test_filter_doc_type(db_session):
    result = await SearchService(db_session).search("", SearchFilters(doc_type="norm"), limit=10)
    assert result.total == 1
    assert result.documents[0]["title"] == "ISO 10300"

async def test_filter_year_range(db_session):
    result = await SearchService(db_session).search("", SearchFilters(year_min=2015, year_max=2022), limit=10)
    assert result.total == 2

async def test_facets_present(db_session):
    result = await SearchService(db_session).search("kegelrad", limit=10)
    assert any(f["name"] == "bericht" for f in result.facets["doc_types"])

async def test_sort_name_asc(db_session):
    result = await SearchService(db_session).search("", sort="name_asc", limit=10)
    titles = [d["title"] for d in result.documents]
    assert titles == sorted(titles)

async def test_fts_injection_is_sanitized(db_session):
    # Darf keine Exception werfen und nichts Unerwartetes matchen
    result = await SearchService(db_session).search('kegelrad" OR "x', limit=10)
    assert isinstance(result.total, int)
```

- [ ] **Step 3: Laufen lassen** — Run: `.venv\Scripts\python -m pytest tests/test_search_service.py -v`
Expected: alle PASS **außer** `test_browse_does_not_leak_full_text` (FAIL, weil der `SELECT d.*`-Bug noch existiert). Diesen einen Test mit `@pytest.mark.xfail(reason="full_text-Leak, Fix in AP4", strict=True)` markieren — AP4 Task 10 entfernt das xfail.

- [ ] **Step 4: Commit** — `git add backend/tests/ && git commit -m "test: SearchService-Tests gegen In-Memory-FTS5 (full_text-Leak als xfail dokumentiert)"`

---

## AP3 — Alembic konsequent

### Task 8: Schema-Management auf Alembic umstellen

**Files:**
- Create: `backend/alembic/versions/002_fts5_and_missing_columns.py`
- Modify: `backend/app/main.py` (Lifespan), `backend/app/database.py` (`ensure_columns`/`ensure_fts5` entfernen)
- Create: `backend/app/migrations.py` (Startup-Migrationslogik)

**Interfaces:**
- Produces: `app.migrations.run_startup_migrations() -> None` (sync, wird via `asyncio.to_thread` im Lifespan aufgerufen). Verhalten: Bestands-DB ohne `alembic_version` → `stamp 001`, dann `upgrade head`; frische DB → `upgrade head` (führt 001+002 aus).

- [ ] **Step 1: Delta zwischen Migration 001 und models.py ermitteln**

```bash
cd C:/Coding/LitVault/backend
.venv\Scripts\python -c "
import re, pathlib
mig = pathlib.Path('alembic/versions/001_initial_schema.py').read_text(encoding='utf-8')
models = pathlib.Path('app/documents/models.py').read_text(encoding='utf-8')
mig_cols = set(re.findall(r\"sa\.Column\('(\w+)'\", mig))
model_cols = set(re.findall(r\"(\w+)\s*(?::\s*Mapped|\s*=\s*(?:mapped_column|Column))\", models))
print('nur in models:', sorted(model_cols - mig_cols))
"
```

Expected: mindestens `excluded` und `page_count` fehlen in 001. Das Ergebnis bestimmt die `ADD COLUMN`-Liste in Step 2.

- [ ] **Step 2: Migration 002 schreiben** — idempotent (Bestands-DBs haben Spalten/FTS teils schon):

```python
"""FTS5 virtual table, triggers, and columns added after 001

Revision ID: 002
Revises: 001
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Spaltenliste aus Task-Step 1 übernehmen:
MISSING_COLUMNS = {
    "excluded": "BOOLEAN NOT NULL DEFAULT 0",
    "page_count": "INTEGER",
}

FTS_CREATE = (
    "CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5("
    "title, authors, full_text, summary, file_path, "
    "content=documents, content_rowid=id, "
    "tokenize='porter unicode61 remove_diacritics 1')"
)

TRIGGERS = [
    """CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
        INSERT INTO documents_fts(rowid, title, authors, full_text, summary, file_path)
        VALUES (new.id, new.title, new.authors, new.full_text, new.summary, new.file_path);
    END""",
    """CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, title, authors, full_text, summary, file_path)
        VALUES ('delete', old.id, old.title, old.authors, old.full_text, old.summary, old.file_path);
    END""",
    """CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, title, authors, full_text, summary, file_path)
        VALUES ('delete', old.id, old.title, old.authors, old.full_text, old.summary, old.file_path);
        INSERT INTO documents_fts(rowid, title, authors, full_text, summary, file_path)
        VALUES (new.id, new.title, new.authors, new.full_text, new.summary, new.file_path);
    END""",
]


def upgrade() -> None:
    conn = op.get_bind()
    existing = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(documents)")}
    for col, ddl in MISSING_COLUMNS.items():
        if col not in existing:
            conn.exec_driver_sql(f"ALTER TABLE documents ADD COLUMN {col} {ddl}")
    had_fts = conn.exec_driver_sql(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='documents_fts'"
    ).fetchone() is not None
    conn.exec_driver_sql(FTS_CREATE)
    for trig in TRIGGERS:
        conn.exec_driver_sql(trig)
    if not had_fts:
        conn.exec_driver_sql(
            "INSERT INTO documents_fts(rowid, title, authors, full_text, summary, file_path) "
            "SELECT id, title, authors, full_text, summary, file_path FROM documents"
        )


def downgrade() -> None:
    raise NotImplementedError("Downgrade nicht unterstützt")
```

- [ ] **Step 3: `app/migrations.py` schreiben:**

```python
"""Startup-Migrationen: Alembic ist die einzige Schema-Quelle."""
import logging
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

logger = logging.getLogger("litvault.migrations")

BACKEND_DIR = Path(__file__).parent.parent
DB_PATH = BACKEND_DIR / "litvault.db"


def _alembic_config() -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{DB_PATH}")
    return cfg


def run_startup_migrations() -> None:
    cfg = _alembic_config()
    engine = create_engine(f"sqlite:///{DB_PATH}")
    with engine.connect() as conn:
        tables = set(inspect(conn).get_table_names())
    engine.dispose()
    if "documents" in tables and "alembic_version" not in tables:
        # Bestands-DB aus der create_all-Ära: Basis stempeln, dann Deltas fahren
        logger.info("Bestands-DB erkannt — stamp auf 001, dann upgrade")
        command.stamp(cfg, "001")
    command.upgrade(cfg, "head")
    logger.info("Alembic-Migrationen abgeschlossen (head)")
```

- [ ] **Step 4: Lifespan umstellen** — in `backend/app/main.py` die Zeilen 27–30 ersetzen:

```python
# Alt (löschen):
#   async with engine.begin() as conn:
#       await conn.run_sync(Base.metadata.create_all)
#   await ensure_columns()
#   await ensure_fts5()
# Neu:
    await asyncio.to_thread(run_startup_migrations)
```

Import ergänzen: `from app.migrations import run_startup_migrations`; die Importe `engine`, `Base`, `ensure_columns`, `ensure_fts5` aus main.py entfernen. In `database.py` die Funktionen `ensure_columns` und `ensure_fts5` löschen (Zeilen 31–97); prüfen, dass niemand sonst sie importiert: `grep -rn "ensure_columns\|ensure_fts5" backend/app backend/tests`.

- [ ] **Step 5: Gegen Kopie der echten DB testen (nicht gegen das Original!):**

```bash
cd C:/Coding/LitVault/backend
cp litvault.db /tmp/test_migration.db 2>/dev/null || copy litvault.db %TEMP%\test_migration.db
.venv\Scripts\python -c "
from app import migrations
from pathlib import Path
import tempfile, shutil
tmp = Path(tempfile.gettempdir()) / 'test_migration.db'
migrations.DB_PATH = tmp
migrations.run_startup_migrations()
print('OK — Bestands-DB migriert')
"
```

Expected: `OK`, keine Exception. Danach frische DB testen: gleiche Ausführung mit nicht-existentem Pfad → legt alle Tabellen an (001+002). Prüfen: `sqlite3`-frei via Python `PRAGMA table_info(documents)` enthält `excluded`, `page_count`; `documents_fts` existiert.

- [ ] **Step 6: App-Start verifizieren** — Run: `.venv\Scripts\python -c "import asyncio; from app.main import app; print('import ok')"` und danach kurzer Serverstart-Smoke: `.venv\Scripts\python -m uvicorn app.main:app --port 8001` (5 s laufen lassen, Log muss `Alembic-Migrationen abgeschlossen` und `LitVault started` zeigen, dann abbrechen).
- [ ] **Step 7:** `.venv\Scripts\python -m pytest` → grün. **Commit:** `git add -A backend && git commit -m "refactor: Schema-Management vollständig auf Alembic umgestellt (stamp+upgrade beim Start)"`

---

## AP4 — Such-Performance

### Task 9: Baseline messen (VOR den Änderungen)

**Files:**
- Create: `docs/superpowers/plans/messungen-2026-07.md` (Messprotokoll, wird in Tasks 10–13 & 15–17 fortgeschrieben)

- [ ] **Step 1: Backend starten** — `cd C:/Coding/LitVault/backend && start .venv\Scripts\python -m uvicorn app.main:app --port 8000` (oder laufende Instanz nutzen).
- [ ] **Step 2: Messen (je 3× ausführen, Median notieren):**

```bash
curl -s -o /dev/null -w "browse:  %{time_total}s  %{size_download} bytes\n" "http://localhost:8000/api/search?limit=100"
curl -s -o /dev/null -w "search:  %{time_total}s  %{size_download} bytes\n" "http://localhost:8000/api/search?q=getriebe&limit=100"
curl -s -o /dev/null -w "facets:  %{time_total}s  %{size_download} bytes\n" "http://localhost:8000/api/search/facets?q=getriebe"
```

- [ ] **Step 3:** Ergebnisse in `messungen-2026-07.md` als Tabelle „Baseline" eintragen. Commit: `git add docs/ && git commit -m "docs: Performance-Baseline Suche"`

### Task 10: Browse-Query ohne full_text

**Files:**
- Modify: `backend/app/search/service.py:158-171`
- Modify: `backend/tests/test_search_service.py` (xfail entfernen)

- [ ] **Step 1: xfail-Marker von `test_browse_does_not_leak_full_text` entfernen.** Run: `.venv\Scripts\python -m pytest tests/test_search_service.py -v` → dieser Test FAILT jetzt (rot).
- [ ] **Step 2: Fix** — in `service.py` den else-Zweig (Zeile 159–165) ersetzen; identische Spaltenliste wie der FTS-Zweig:

```python
        else:
            select_sql = (
                "SELECT d.id, d.file_path, d.file_hash, d.file_type, d.file_size, d.mtime,"
                " d.title, d.authors, d.year, d.doc_type, d.source, d.language,"
                " d.summary, d.has_text, d.doi, d.processing_status,"
                " d.classification_confidence, d.classification_source,"
                " d.created_at, d.updated_at, d.indexed_at,"
                " NULL as title_snippet, NULL as text_snippet, 0 as rank"
                " FROM documents d"
                " WHERE 1=1"
                f" {filter_sql}"
                f" ORDER BY {order_by}"
            )
```

- [ ] **Step 3:** Run: `.venv\Scripts\python -m pytest` → alles grün.
- [ ] **Step 4: Nachmessen** (Backend neu starten, gleiche curl-Kommandos wie Task 9). Expected: `browse` Payload sinkt von Megabytes auf < 100 KB. In Messprotokoll eintragen.
- [ ] **Step 5: Commit** — `git add -A backend docs/ && git commit -m "perf: Browse-Query laedt full_text nicht mehr (Payload ~10MB -> <100KB)"`

### Task 11: Facetten in einer Query bündeln

**Files:**
- Modify: `backend/app/search/service.py` (`get_facets`, Zeilen 285–355)
- Test: `backend/tests/test_search_service.py`

**Interfaces:**
- Produces: `get_facets` unverändert in Signatur und Rückgabeform (`{"categories": [...], "doc_types": [...], "years": [...], "file_types": [...], "statuses": [...]}`, Einträge `{"name": ..., "count": ...}`) — nur intern 1 Query statt 5.

- [ ] **Step 1: Test ergänzen** (sichert Facetten-Form über den Umbau):

```python
async def test_facets_shape_and_counts(db_session):
    svc = SearchService(db_session)
    facets = await svc.get_facets(query="", filters=None)
    assert set(facets.keys()) == {"categories", "doc_types", "years", "file_types", "statuses"}
    doc_types = {f["name"]: f["count"] for f in facets["doc_types"]}
    assert doc_types.get("bericht") == 1 and doc_types.get("norm") == 1
    file_types = {f["name"]: f["count"] for f in facets["file_types"]}
    assert file_types.get("pdf") == 3 and file_types.get("docx") == 1

async def test_facets_with_fts_query(db_session):
    facets = await SearchService(db_session).get_facets(query="kegelrad")
    years = {f["name"] for f in facets["years"]}
    assert years == {2019, 2014}
```

Run → PASS gegen die alte Implementierung (Verhaltens-Sicherung).

- [ ] **Step 2: Umbau** — die fünf Einzel-SQLs + fünf `execute`-Aufrufe ersetzen durch eine gebündelte Query. Kern (Filter-Klauseln-Aufbau bleibt unverändert davor):

```python
        cte = ""
        if sanitized:
            params["query"] = sanitized
            cte = ("WITH matched(rowid) AS ("
                   "SELECT documents_fts.rowid FROM documents_fts WHERE documents_fts MATCH :query) ")
            fts_subquery = "AND d.id IN (SELECT rowid FROM matched)"
        else:
            fts_subquery = ""

        union_sql = cte + " UNION ALL ".join([
            ("SELECT 'categories' AS facet, c.name AS name, COUNT(*) AS count"
             " FROM document_categories dc"
             " JOIN categories c ON c.id = dc.category_id"
             " JOIN documents d ON d.id = dc.document_id"
             f" WHERE d.processing_status = 'done' {fts_subquery} {filter_sql}"
             " GROUP BY c.name"),
            ("SELECT 'doc_types', d.doc_type, COUNT(*) FROM documents d"
             f" WHERE d.processing_status = 'done' AND d.doc_type IS NOT NULL {fts_subquery} {filter_sql}"
             " GROUP BY d.doc_type"),
            ("SELECT 'years', d.year, COUNT(*) FROM documents d"
             f" WHERE d.processing_status = 'done' AND d.year IS NOT NULL {fts_subquery} {filter_sql}"
             " GROUP BY d.year"),
            ("SELECT 'file_types', d.file_type, COUNT(*) FROM documents d"
             f" WHERE 1=1 {fts_subquery} {filter_sql} AND d.file_type IS NOT NULL"
             " GROUP BY d.file_type"),
            ("SELECT 'statuses', d.processing_status, COUNT(*) FROM documents d"
             f" WHERE 1=1 {fts_subquery} {filter_sql}"
             " GROUP BY d.processing_status"),
        ])

        facets: dict = {"categories": [], "doc_types": [], "years": [], "file_types": [], "statuses": []}
        try:
            rows = await self.db.execute(text(union_sql), params)
            for facet, name, count in rows:
                facets[facet].append({"name": name, "count": count})
        except Exception as exc:
            logger.error("Facet query failed: %s", exc)
```

Sortierung danach in Python (ersetzt die früheren ORDER BY): `categories`, `doc_types`, `file_types`, `statuses` nach `count` absteigend, `years` nach `name` absteigend:

```python
        for key in ("categories", "doc_types", "file_types", "statuses"):
            facets[key].sort(key=lambda e: e["count"], reverse=True)
        facets["years"].sort(key=lambda e: e["name"], reverse=True)
        return facets
```

- [ ] **Step 3:** Run: `.venv\Scripts\python -m pytest` → grün (die Tests aus Step 1 beweisen Verhaltens-Gleichheit).
- [ ] **Step 4: Commit** — `git commit -am "perf: Facetten in einer UNION-ALL-Query statt 5 Roundtrips"`

### Task 12: Facetten-Cache + include_facets-Parameter (Backend & Frontend)

**Files:**
- Create: `backend/app/search/facet_cache.py`
- Modify: `backend/app/search/service.py` (search: Parameter `include_facets: bool = True`; get_facets: Cache davor)
- Modify: `backend/app/search/router.py:33-78` (Param durchreichen)
- Modify: `backend/app/ingest/service.py` (Invalidierung nach Commit), `backend/app/documents/router.py` (Invalidierung nach PATCH/exclude/restore/tags)
- Modify: `frontend/src/lib/api.ts` (searchDocuments: `includeFacets`-Param), `frontend/src/hooks/useSearch.ts` (loadMore ohne Facetten)
- Test: `backend/tests/test_facet_cache.py`

**Interfaces:**
- Produces: `app.search.facet_cache.FACET_CACHE` (Singleton) mit `get(key: tuple) -> dict | None`, `set(key: tuple, value: dict) -> None`, `invalidate() -> None` (erhöht Generation). Aufrufer der Invalidierung: alle Schreibpfade auf documents/tags/categories.

- [ ] **Step 1: Failing Test** — `backend/tests/test_facet_cache.py`:

```python
from app.search.facet_cache import FacetCache


def test_cache_miss_then_hit():
    c = FacetCache(maxsize=4)
    assert c.get(("q", ())) is None
    c.set(("q", ()), {"doc_types": []})
    assert c.get(("q", ())) == {"doc_types": []}

def test_invalidate_clears_all(): 
    c = FacetCache(maxsize=4)
    c.set(("q", ()), {"a": 1})
    c.invalidate()
    assert c.get(("q", ())) is None

def test_maxsize_evicts_oldest():
    c = FacetCache(maxsize=2)
    c.set(("a",), {}); c.set(("b",), {}); c.set(("c",), {})
    assert c.get(("a",)) is None and c.get(("c",)) == {}
```

Run: `pytest tests/test_facet_cache.py -v` → FAIL (Modul existiert nicht).

- [ ] **Step 2: Implementierung** — `backend/app/search/facet_cache.py`:

```python
"""In-Memory-Facetten-Cache mit Generation-Counter.

Facetten ändern sich nur, wenn Dokumente/Tags/Kategorien geschrieben werden.
Jeder Schreibpfad ruft FACET_CACHE.invalidate() auf; das erhöht die Generation
und macht alle Einträge unauffindbar (lazy eviction via OrderedDict).
"""
from collections import OrderedDict


class FacetCache:
    def __init__(self, maxsize: int = 128) -> None:
        self._data: OrderedDict[tuple, dict] = OrderedDict()
        self._generation = 0
        self._maxsize = maxsize

    def get(self, key: tuple) -> dict | None:
        return self._data.get((self._generation, *key))

    def set(self, key: tuple, value: dict) -> None:
        full_key = (self._generation, *key)
        self._data[full_key] = value
        while len(self._data) > self._maxsize:
            self._data.popitem(last=False)

    def invalidate(self) -> None:
        self._generation += 1
        self._data.clear()


FACET_CACHE = FacetCache()
```

- [ ] **Step 3: In `get_facets` einhängen** (Anfang der Methode, nach `filters`-Default):

```python
        from dataclasses import astuple
        cache_key = (query, astuple(filters))
        cached = FACET_CACHE.get(cache_key)
        if cached is not None:
            return cached
```

und vor `return facets`: `FACET_CACHE.set(cache_key, facets)` (nur im Erfolgsfall, nicht im except-Zweig). Import oben: `from app.search.facet_cache import FACET_CACHE`.

- [ ] **Step 4: `include_facets` durchziehen** — `SearchService.search(..., include_facets: bool = True)`; Zeile 189: `facets = await self.get_facets(...) if include_facets else {}`. Router `/api/search`: Param `include_facets: bool = True` ergänzen und durchreichen.

- [ ] **Step 5: Invalidierung an allen Schreibpfaden.** `FACET_CACHE.invalidate()` direkt nach jedem `await self.db.commit()` / `await db.commit()` das documents/tags/categories verändert: in `ingest/service.py` (`ingest_folder` nach dem Commit je Dokument, `_apply_classification`-Aufrufer reicht: der Commit in Zeile 183), in `documents/router.py` bei `update_document`, `exclude_document`, `exclude_batch`, `restore_document`, `add_document_tag`, `remove_document_tag`, `toggle_favorite` sowie in `jobs/worker.py` nach den Commits im CLASSIFY/RESCAN-Zweig. Suchmuster: `grep -n "commit()" backend/app -r`.

- [ ] **Step 6: Frontend** — `api.ts`:

```typescript
export async function searchDocuments(
  query: string,
  filters: SearchFilters = {},
  offset = 0,
  limit = 25,
  sort = 'date_desc',
  includeFacets = true,
): Promise<SearchResponse> {
```

und vor dem fetch: `if (!includeFacets) params.set('include_facets', 'false');`. In `useSearch.ts` `loadMore` (Zeile 56): `searchDocuments(query, filters, nextOffset, resultsPerPage, sort, false)` und beim `setMeta` die alten Facetten behalten: `setMeta((prev) => ({ total: data.total, facets: prev?.facets ?? data.facets }));`

- [ ] **Step 7:** Run: `.venv\Scripts\python -m pytest` grün; `npx tsc -b && npx eslint .` sauber. Funktions-Smoke: App starten, tippen, blättern — Facetten bleiben beim „Mehr laden" stehen.
- [ ] **Step 8: Commit** — `git add -A backend frontend && git commit -m "perf: Facetten-Cache mit Generation-Invalidierung + include_facets fuer loadMore"`

### Task 13: Index-Check + gezielte Index-Migration

**Files:**
- Create: `backend/alembic/versions/003_search_indexes.py`

- [ ] **Step 1: EXPLAIN QUERY PLAN gegen Kopie der echten DB:**

```bash
cd C:/Coding/LitVault/backend && .venv\Scripts\python -c "
import sqlite3
con = sqlite3.connect('file:litvault.db?mode=ro', uri=True)
for label, sql in [
    ('browse sort', \"SELECT id FROM documents WHERE excluded=0 ORDER BY created_at DESC LIMIT 100\"),
    ('doc_type filter', \"SELECT id FROM documents WHERE excluded=0 AND doc_type='bericht'\"),
    ('year filter', \"SELECT id FROM documents WHERE excluded=0 AND year BETWEEN 2015 AND 2022\"),
]:
    print(label, ':', con.execute('EXPLAIN QUERY PLAN ' + sql).fetchall())
"
```

- [ ] **Step 2:** Nur für Zugriffe mit `SCAN documents` (Full Scan) + messbarem Effekt Indizes anlegen. Migration 003 (Liste ggf. nach Step-1-Ergebnis kürzen):

```python
"""Indexes for search/browse hot paths

Revision ID: 003
Revises: 002
"""
from typing import Sequence, Union
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_documents_created_at", "documents", ["created_at"], if_not_exists=True)
    op.create_index("ix_documents_doc_type", "documents", ["doc_type"], if_not_exists=True)
    op.create_index("ix_documents_year", "documents", ["year"], if_not_exists=True)
    op.create_index("ix_documents_file_type", "documents", ["file_type"], if_not_exists=True)
    op.create_index("ix_documents_processing_status", "documents", ["processing_status"], if_not_exists=True)


def downgrade() -> None:
    for name in ("ix_documents_created_at", "ix_documents_doc_type", "ix_documents_year",
                 "ix_documents_file_type", "ix_documents_processing_status"):
        op.drop_index(name, table_name="documents", if_exists=True)
```

- [ ] **Step 3:** Migration auf DB-Kopie testen (Muster aus Task 8 Step 5), dann App-Start (führt `upgrade head` aus). EXPLAIN erneut → `USING INDEX`. Endmessung aller drei curl-Kommandos aus Task 9, Ergebnisse ins Messprotokoll (Ziel: browse < 200 ms serverseitig, search < 300 ms end-to-end).
- [ ] **Step 4: Commit** — `git add -A backend docs/ && git commit -m "perf: Indizes fuer Browse/Filter-Pfade (Messwerte im Protokoll)"`

---

## AP5 — Ingest-Parallelisierung

### Task 14: OCR-Lock (Vorbedingung für Parallelität)

**Files:**
- Modify: `backend/app/ingest/parsers/pdf_parser.py`

- [ ] **Step 1:** Modul-Level-Lock ergänzen und OCR-Zugriff schützen:

```python
import threading
_ocr_lock = threading.Lock()  # EasyOCR-Reader ist nicht thread-safe; GPU ohnehin seriell
```

In `_ocr_page` (Zeile 80–81) die zwei Zeilen `reader = _get_ocr()` / `results = reader.readtext(...)` einschließen:

```python
    with _ocr_lock:
        reader = _get_ocr()
        results = reader.readtext(img_array, detail=1, paragraph=False)
```

- [ ] **Step 2:** `.venv\Scripts\python -m pytest` grün (kein OCR in Tests, reiner Regressionscheck). Commit: `git commit -am "fix: OCR-Lock — EasyOCR-Reader vor paralleler Nutzung geschuetzt"`

### Task 15: ingest_folder parallelisieren (Parse-Worker + DB-Writer)

**Files:**
- Modify: `backend/app/ingest/service.py` (`ingest_folder`, Zeilen 105–202)
- Modify: `backend/app/config.py` (neues Feld)
- Test: `backend/tests/test_ingest_parallel.py`

**Interfaces:**
- Consumes: `parse_document(path, file_type) -> ParseResult` (bestehend, läuft intern via `asyncio.to_thread`), `generate_thumbnail_async`, `_upsert_document`, `_apply_classification`.
- Produces: `ingest_folder` mit identischer Signatur und identischem `IngestResult`; neue Config `parse_parallelism: int = 3`.

- [ ] **Step 1: Config-Feld** — `app/config.py` nach `parse_timeout_seconds`: `parse_parallelism: int = 3`.

- [ ] **Step 2: Failing Test** — `backend/tests/test_ingest_parallel.py` (prüft, dass Parses überlappen — über Instrumentierung mit monkeypatch):

```python
import asyncio
import pytest
from pathlib import Path

from app.config import Settings
from app.ingest import service as ingest_service
from app.ingest.parsers.models import ParseResult


@pytest.fixture
def fake_files(tmp_path):
    files = []
    for i in range(6):
        p = tmp_path / f"doc{i}.pdf"
        p.write_bytes(b"%PDF-fake")
        files.append({"file_path": str(p), "file_hash": f"h{i}", "file_type": "pdf",
                      "file_size": 9, "mtime": 0.0})
    return files


async def test_parses_overlap(db_session, fake_files, monkeypatch, tmp_path):
    concurrency = {"now": 0, "max": 0}

    async def fake_parse(path, file_type):
        concurrency["now"] += 1
        concurrency["max"] = max(concurrency["max"], concurrency["now"])
        await asyncio.sleep(0.05)
        concurrency["now"] -= 1
        return ParseResult(text="inhalt " * 40, page_count=1, has_text=True, ocr_pages=[])

    async def fake_find(folder, db):
        return fake_files

    async def fake_thumb(src, dst):
        return None

    monkeypatch.setattr(ingest_service, "parse_document", fake_parse)
    monkeypatch.setattr(ingest_service, "find_new_files", fake_find)
    monkeypatch.setattr(ingest_service, "generate_thumbnail_async", fake_thumb)

    settings = Settings(watch_folders=[], thumbnails_dir=str(tmp_path), parse_parallelism=3)
    svc = ingest_service.IngestService(db_session, settings, ollama=None)
    result = await svc.ingest_folder(str(tmp_path))

    assert result.processed == 6
    assert result.errors == 0
    assert concurrency["max"] >= 2  # Beweis der Überlappung
```

Run: `pytest tests/test_ingest_parallel.py -v` → FAIL (`concurrency["max"] == 1`, seriell).

- [ ] **Step 3: Umbau von `ingest_folder`** — die sequenzielle for-Schleife (Zeilen 134–194) ersetzen durch Producer/Consumer:

```python
        parse_sem = asyncio.Semaphore(self.settings.parse_parallelism)
        results_q: asyncio.Queue = asyncio.Queue(maxsize=self.settings.parse_parallelism * 2)
        _SENTINEL = object()

        async def produce(meta: dict) -> None:
            """Parst (+ Thumbnail) ohne DB-Zugriff; Ergebnis in die Queue."""
            async with parse_sem:
                if is_cancelled and is_cancelled():
                    await results_q.put((meta, None, None))
                    return
                try:
                    parse_result = await parse_document(Path(meta["file_path"]), meta["file_type"])
                    thumb = None
                    if meta["file_type"] == "pdf" and not parse_result.error:
                        thumb = await generate_thumbnail_async(
                            Path(meta["file_path"]), Path(self.settings.thumbnails_dir)
                        )
                    await results_q.put((meta, parse_result, thumb))
                except Exception as exc:  # Parser-Absturz → als Fehler-Ergebnis melden
                    await results_q.put((meta, ParseResult(error=str(exc)), None))

        async def write_all() -> tuple[int, int]:
            """Einziger DB-Schreiber: konsumiert Ergebnisse, committed sequenziell."""
            done = 0
            failed = 0
            handled = 0
            while handled < total_found:
                meta, parse_result, _thumb = await results_q.get()
                handled += 1
                if parse_result is None:  # cancelled
                    continue
                try:
                    doc = await self._upsert_document(meta)
                    if parse_result.error:
                        doc.processing_status = "error"
                        doc.summary = parse_result.error
                        failed += 1
                        logger.warning("Parse error for %s: %s", meta["file_path"], parse_result.error)
                    else:
                        doc.full_text = parse_result.text
                        doc.has_text = parse_result.has_text
                        doc.page_count = parse_result.page_count
                        doc.processing_status = "done"
                        doc.indexed_at = datetime.now(timezone.utc).isoformat()
                        done += 1
                        meta_from_name = extract_from_filename(Path(meta["file_path"]).name)
                        if meta_from_name.title and not doc.title:
                            doc.title = meta_from_name.title
                        if meta_from_name.year and not doc.year:
                            doc.year = meta_from_name.year
                        if meta_from_name.doc_type and not doc.doc_type:
                            doc.doc_type = meta_from_name.doc_type
                        if not doc.classification_source:
                            doc.classification_source = "filename"
                        try:
                            await self._apply_classification(doc, parse_result.text)
                        except Exception as cls_err:
                            logger.warning("Classification failed for '%s': %s",
                                           Path(meta["file_path"]).name, cls_err)
                    await self.db.commit()
                    FACET_CACHE.invalidate()
                except Exception as exc:
                    logger.error("Unexpected error ingesting %s: %s", meta["file_path"], exc)
                    failed += 1
                    try:
                        await self.db.rollback()
                    except Exception:
                        pass
                if on_progress:
                    on_progress(handled, total_found, f"Processed: {meta['file_path']}")
            return done, failed

        producers = [asyncio.create_task(produce(meta)) for meta in new_files]
        writer = asyncio.create_task(write_all())
        await asyncio.gather(*producers)
        processed, errors = await writer
```

Wichtig: `ParseResult`-Import existiert via `app.ingest.parsers` (prüfen: `from app.ingest.parsers.models import ParseResult` ergänzen). Der Status `doc.processing_status = "processing"` + Zwischencommit aus dem alten Code entfällt (der Writer setzt direkt den Endzustand). `skipped` bleibt 0 wie bisher.

- [ ] **Step 4:** Run: `pytest tests/ -v` → alle grün, insbesondere `test_parses_overlap`.
- [ ] **Step 5: Realmessung** — einen kleinen echten Ordner (10–20 Text-PDFs, KEINE Scans) crawlen: App starten, `curl -X POST http://localhost:8000/api/crawl -H "Content-Type: application/json" -d "{\"folder\": \"<testordner>\"}"`, Dauer aus Log/Jobs-Panel notieren; Vergleich mit Baseline (vor dem Umbau denselben Ordner messen — dafür VOR Step 3 einmal laufen lassen und notieren!). Ziel laut Spec: ≥ 3× bei Text-PDFs. Ins Messprotokoll.
- [ ] **Step 6: Commit** — `git add -A backend docs/ && git commit -m "perf: Ingest parallelisiert (N Parse-Worker + einzelner DB-Writer)"`

### Task 16: Multi-Worker-Jobsystem

**Files:**
- Modify: `backend/app/jobs/worker.py`, `backend/app/main.py`, `backend/app/config.py`

**Interfaces:**
- Produces: `worker_loop(queue, store, settings, crawl_lock: asyncio.Lock)` — neue Signatur; `main.py` startet `settings.worker_count` (neu, Default 2) Worker-Tasks mit gemeinsamem Lock.

- [ ] **Step 1: Config** — `worker_count: int = 2` in `app/config.py`.
- [ ] **Step 2: worker.py** — `process_job` erhält Parameter `crawl_lock: asyncio.Lock`; der CRAWL-Zweig wird gekapselt:

```python
            match job.type:
                case JobType.CRAWL:
                    async with crawl_lock:  # nur ein Crawl gleichzeitig (Ordner-Exklusivität)
                        ...bestehender CRAWL-Code unverändert...
```

`worker_loop(queue, store, settings, crawl_lock)` reicht das Lock durch.

- [ ] **Step 3: main.py** — statt einem Worker:

```python
    crawl_lock = asyncio.Lock()
    worker_tasks = [
        asyncio.create_task(worker_loop(queue, store, settings, crawl_lock))
        for _ in range(settings.worker_count)
    ]
```

Shutdown-Teil entsprechend über die Liste iterieren (`for task in (*worker_tasks, watcher_task): task.cancel()` …).

- [ ] **Step 4:** Smoke: App starten, im Jobs-Panel einen Crawl UND eine Batch-Klassifikation gleichzeitig anstoßen — beide laufen parallel (vorher: strikt nacheinander). pytest grün.
- [ ] **Step 5: Commit** — `git commit -am "feat: Multi-Worker-Jobsystem (CLASSIFY laeuft parallel zu CRAWL, Crawl exklusiv)"`

### Task 17: PDF-Extraktions-Modus messen und konfigurierbar machen

**Files:**
- Create: `backend/scripts/benchmark_parse.py`
- Modify: `backend/app/ingest/parsers/pdf_parser.py`, `backend/app/config.py`

- [ ] **Step 1: Benchmark-Skript** — `backend/scripts/benchmark_parse.py`:

```python
"""Vergleicht pymupdf4llm.to_markdown vs. plain page.get_text auf echten PDFs.

Aufruf: .venv\\Scripts\\python scripts\\benchmark_parse.py <ordner-mit-pdfs>
"""
import sys
import time
from pathlib import Path

import fitz
import pymupdf4llm

folder = Path(sys.argv[1])
pdfs = sorted(folder.glob("*.pdf"))[:10]
print(f"{'Datei':<50} {'Seiten':>6} {'markdown':>10} {'plain':>10} {'Faktor':>7}")
for pdf in pdfs:
    doc = fitz.open(str(pdf))
    t0 = time.perf_counter()
    try:
        md = pymupdf4llm.to_markdown(str(pdf))
    except Exception as e:
        md = f"FEHLER {e}"
    t_md = time.perf_counter() - t0
    t0 = time.perf_counter()
    plain = "\n".join(p.get_text() for p in doc)
    t_plain = time.perf_counter() - t0
    factor = t_md / t_plain if t_plain > 0 else float("inf")
    print(f"{pdf.name[:50]:<50} {len(doc):>6} {t_md:>9.2f}s {t_plain:>9.2f}s {factor:>6.1f}x")
```

Run mit einem echten Literatur-Ordner. Ergebnis ins Messprotokoll.

- [ ] **Step 2: Entscheidung + Umsetzung** — Wenn der Median-Faktor > 3× liegt: Config `pdf_extraction_mode: str = "plain"` (Werte `"plain" | "markdown"`), in `parse_pdf` den Primärpfad umschalten:

```python
        from app.config import get_settings
        if get_settings().pdf_extraction_mode == "markdown":
            try:
                md_text = pymupdf4llm.to_markdown(str(path))
            except Exception as exc:
                logger.warning("pymupdf4llm failed for %s: %s", path, exc)
                md_text = ""
        else:
            md_text = "\n".join(page.get_text() for page in doc)
```

(Qualitäts-Gate `_text_quality` + OCR-Fallback bleiben unverändert dahinter.) Wenn Faktor ≤ 3×: keine Code-Änderung, nur Messwerte dokumentieren und in `config.example.json` nichts ergänzen.

- [ ] **Step 3:** pytest grün; Commit — `git add -A backend docs/ && git commit -m "perf: PDF-Extraktionsmodus konfigurierbar (Messwerte im Protokoll)"` (bzw. `docs:`-Commit, falls keine Code-Änderung).

---

## AP6 — Klassifikation: Modell + Tempo + Qualität

### Task 18: num_predict senken + MAX_CHARS konfigurierbar

**Files:**
- Modify: `backend/app/classification/ollama_client.py:23`, `backend/app/classification/service.py`, `backend/app/config.py`, `backend/app/ingest/service.py:36`

**Interfaces:**
- Produces: Config `classification_max_chars: int = 2000`; `ClassificationService(ollama, max_chars: int = 2000)`; `truncate_text(text, max_chars)` unverändert.

- [ ] **Step 1: Failing Test** (an `tests/test_classification_tiers.py` anhängen):

```python
from app.classification.service import truncate_text


def test_truncate_respects_max_chars():
    text = "wort " * 1000
    out = truncate_text(text, max_chars=100)
    assert len(out) <= 104  # 100 + "..."

def test_service_uses_configured_max_chars():
    svc = ClassificationService(ollama=None, max_chars=500)  # type: ignore[arg-type]
    assert svc.max_chars == 500
```

Run → FAIL (`max_chars`-Konstruktor-Param existiert nicht).

- [ ] **Step 2:** `config.py`: `classification_max_chars: int = 2000`. `service.py`: Konstruktor `def __init__(self, ollama, max_chars: int = MAX_CHARS): self.ollama = ollama; self.max_chars = max_chars`; in `classify` Zeile 80: `truncated = truncate_text(text, self.max_chars)`. `ingest/service.py:36`: `ClassificationService(ollama, max_chars=settings.classification_max_chars) if ollama else None`. `ollama_client.py:23`: `"num_predict": 512`.
- [ ] **Step 3:** pytest grün. Commit — `git commit -am "feat: classification_max_chars konfigurierbar, num_predict 2048->512"`

### Task 19: LLM-Benchmark-Skript

**Files:**
- Create: `backend/scripts/benchmark_llm.py`

**Interfaces:**
- Consumes: `OllamaClient(base_url, model, num_ctx).generate(prompt, json_schema)`, `build_prompt`, `ClassificationResult`, echte `litvault.db` (read-only!).

- [ ] **Step 1: Skript schreiben:**

```python
"""LLM-Benchmark: Klassifikationsqualität + Tempo je Modell auf echten Dokumenten.

Aufruf: .venv\\Scripts\\python scripts\\benchmark_llm.py
Modelle/Parameter unten anpassen. DB wird read-only geöffnet.
"""
import asyncio
import json
import sqlite3
import time
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.classification.ollama_client import OllamaClient
from app.classification.schemas import ClassificationResult, build_prompt
from app.classification.service import truncate_text

MODELS = ["qwen3:4b", "qwen3.5:4b", "qwen3.5:9b"]
MAX_CHARS_VARIANTS = [2000, 6000]
N_DOCS = 20

con = sqlite3.connect("file:litvault.db?mode=ro", uri=True)
docs = con.execute(
    "SELECT id, file_path, full_text FROM documents"
    " WHERE full_text IS NOT NULL AND length(full_text) > 500 AND excluded = 0"
    " ORDER BY RANDOM() LIMIT ?", (N_DOCS,)
).fetchall()
print(f"{len(docs)} Dokumente geladen\n")

FIELDS = ["title", "authors", "year", "doc_type", "summary", "categories", "tags"]


def fill_rate(r: ClassificationResult) -> float:
    filled = sum(1 for f in FIELDS if getattr(r, f) not in (None, "", [], 0))
    return filled / len(FIELDS)


async def run(model: str, max_chars: int) -> None:
    num_ctx = 8192 if max_chars > 3000 else 4096
    client = OllamaClient(model=model, num_ctx=num_ctx)
    times, fills, errors = [], [], 0
    schema = ClassificationResult.model_json_schema()
    for doc_id, path, text in docs:
        prompt = build_prompt(truncate_text(text, max_chars))
        t0 = time.perf_counter()
        try:
            raw = await client.generate(prompt, json_schema=schema)
            result = ClassificationResult.model_validate(raw)
            fills.append(fill_rate(result))
        except Exception as e:
            errors += 1
            print(f"  FEHLER doc {doc_id}: {e}")
        times.append(time.perf_counter() - t0)
    await client.close()
    avg_t = sum(times) / len(times)
    avg_f = sum(fills) / len(fills) if fills else 0
    print(f"{model:<14} chars={max_chars:<5} ctx={num_ctx:<5}"
          f" {avg_t:>6.1f}s/Dok  Ausfuellung {avg_f:>5.1%}  Fehler {errors}")


async def main() -> None:
    for model in MODELS:
        for mc in MAX_CHARS_VARIANTS:
            await run(model, mc)

asyncio.run(main())
```

- [ ] **Step 2: Syntax-Check** — `.venv\Scripts\python -m py_compile scripts\benchmark_llm.py` → Exit 0.
- [ ] **Step 3: Commit** — `git add backend/scripts/ && git commit -m "feat: LLM-Benchmark-Skript (Modelle x max_chars auf echten Dokumenten)"`

### Task 20: Benchmark ausführen, Modell entscheiden, Default setzen

**Files:**
- Modify: `config.example.json`, lokales `config.json`, Messprotokoll

- [ ] **Step 1:** Ollama läuft (`ollama list` zeigt qwen3.5:4b/9b — falls `qwen3.5:4b` fehlt: `ollama pull qwen3.5:4b`). Backend-Server STOPPEN (GPU-Speicher für 9b freihalten). Run: `.venv\Scripts\python scripts\benchmark_llm.py` (Dauer: grob 6 Läufe × 20 Docs × 2–20 s — einplanen).
- [ ] **Step 2: Entscheiden** nach Datenlage. Faustregel: bestes Ausfüllungs-/Qualitätsniveau, dessen Zeit/Dokument im Batch akzeptabel bleibt (< ~15 s/Dok bei 9b wäre ok; die Klassifikation läuft im Hintergrund-Worker). Stichprobe: für 3 Dokumente die generierten Titel/Kategorien manuell gegen die PDF prüfen. Ergebnis-Tabelle + Entscheidung ins Messprotokoll.
- [ ] **Step 3:** Gewähltes Modell + `classification_max_chars` + passendes `ollama_num_ctx` in `config.example.json` UND ins lokale `config.json` eintragen (z. B. `"ollama_model": "qwen3.5:9b"`, `"ollama_num_ctx": 8192`, `"classification_max_chars": 6000` — je nach Benchmark).
- [ ] **Step 4: Commit** — `git add config.example.json docs/ && git commit -m "feat: LLM-Default nach Benchmark aktualisiert (Zahlen im Messprotokoll)"`

### Task 21: Batch-Klassifikation parallelisieren (2 gleichzeitige Ollama-Requests)

**Files:**
- Modify: `backend/app/ingest/service.py` (`_apply_classification` splitten), `backend/app/jobs/worker.py` (CLASSIFY-Batch-Zweig), `backend/app/config.py`

**Interfaces:**
- Produces: `IngestService.apply_classification_result(doc, result, tier) -> None` (nur DB, kein HTTP) und weiterhin `_apply_classification(doc, text)` (ruft classify + apply). Config `classify_parallelism: int = 2`.

- [ ] **Step 1: Refactor `_apply_classification`** in zwei Methoden — der HTTP-Teil (Zeile 43–48: detect_language + classify_document) bleibt in `_apply_classification`, alles ab „Update document fields" (Zeile 50–103) wandert unverändert in:

```python
    async def apply_classification_result(self, doc: Document, result, tier: str) -> None:
        """Persistiert ein Klassifikationsergebnis (kein HTTP — darf nur seriell laufen)."""
```

`_apply_classification` ruft danach: `result, tier = await self.classifier.classify_document(...)` → `await self.apply_classification_result(doc, result, tier)`.

- [ ] **Step 2: Worker-Batch-Zweig parallelisieren** (worker.py Zeilen 79–89) — Ollama-Calls parallel, DB seriell:

```python
                            sem = asyncio.Semaphore(settings.classify_parallelism)
                            svc = IngestService(session, settings, ollama=ollama)

                            async def classify_only(doc):
                                async with sem:
                                    try:
                                        lang = detect_language(doc.full_text)
                                        result, tier = await svc.classifier.classify_document(
                                            doc.full_text[:settings.classification_max_chars],
                                            filename=Path(doc.file_path).name,
                                        )
                                        return doc, lang, result, tier, None
                                    except Exception as e:
                                        return doc, None, None, None, e

                            classified = 0
                            tasks = [asyncio.create_task(classify_only(d)) for d in docs]
                            for i, fut in enumerate(asyncio.as_completed(tasks)):
                                doc, lang, result, tier, err = await fut
                                if err is not None:
                                    logger.warning("Classification failed for doc %s: %s", doc.id, err)
                                    continue
                                doc.language = lang
                                await svc.apply_classification_result(doc, result, tier)
                                await session.commit()
                                classified += 1
                                store.update_progress(job.id, i + 1, len(docs), f"Classified: {doc.file_path}")
```

Import ergänzen: `from app.classification.service import detect_language`. Config: `classify_parallelism: int = 2`. Hinweis in `config.example.json`-Kommentar unnötig (JSON), stattdessen im Messprotokoll notieren: Ollama-seitig steuert `OLLAMA_NUM_PARALLEL` (Env-Var des Ollama-Dienstes, Default reicht meist), sonst serialisiert Ollama intern.

- [ ] **Step 3:** pytest grün. Smoke: Batch-Klassifikation über das Dashboard anstoßen, Log zeigt überlappende Requests. Zeit für 10 Dokumente vorher/nachher ins Messprotokoll.
- [ ] **Step 4: Commit** — `git add -A backend docs/ && git commit -m "perf: Batch-Klassifikation mit 2 parallelen Ollama-Requests, DB-Writes seriell"`

---

## AP7 — Router-Refactoring

### Task 22: documents/router.py in Service + 3 Router aufteilen

**Files:**
- Create: `backend/app/documents/service.py`, `backend/app/documents/files_router.py`, `backend/app/documents/actions_router.py`
- Modify: `backend/app/documents/router.py` (schrumpft auf CRUD/Listing), `backend/app/main.py` (zwei neue include_router)
- Test: `backend/tests/test_documents_api.py`

**Interfaces:**
- Produces: identische API (alle 24 Pfade und Response-Shapes unverändert). Aufteilung:
  - `router.py` (prefix `/api`, tags `documents`): `GET /stats`, `POST /crawl`, `GET /documents`, `GET /documents/duplicates`, `GET /documents/{id}`, `PATCH /documents/{id}`
  - `files_router.py` (prefix `/api`, tags `document-files`): `GET /documents/{id}/thumbnail`, `GET /documents/{id}/file`, `POST /documents/{id}/open-folder`, `POST /documents/{id}/open`
  - `actions_router.py` (prefix `/api`, tags `document-actions`): `POST /documents/{id}/classify`, `POST /documents/classify-batch`, `POST /documents/{id}/rescan`, `POST /documents/rescan-errors`, `POST /documents/rescan-no-text`, `DELETE /documents/{id}`, `POST /documents/exclude-batch`, `POST /documents/{id}/restore`, `POST /documents/{id}/favorite`, `GET /favorites`, `GET /documents/{id}/tags`, `POST /documents/{id}/tags`, `DELETE /documents/{id}/tags/{tag_id}`
  - `service.py`: gemeinsame Logik, mindestens `get_document_or_404(db, doc_id) -> Document` und die Stats-Aggregation; Endpoint-Funktionskörper wandern mit, gemeinsame Hilfslogik wird EINMAL in den Service gezogen (DRY), aber kein Over-Engineering: trivialer Endpoint-Code darf im Router bleiben.

- [ ] **Step 1: API-Schnappschuss VOR dem Umbau:**

```bash
cd C:/Coding/LitVault/backend && .venv\Scripts\python -c "
from app.main import app
import json
paths = sorted(app.openapi()['paths'].keys())
print(json.dumps(paths, indent=1))
" > /tmp/api_before.json 2>&1 || .venv\Scripts\python -c "..." > %TEMP%\api_before.json
```

- [ ] **Step 2: Failing Test** — `backend/tests/test_documents_api.py` (Routen-Existenz, kein DB-Zugriff nötig):

```python
from app.main import app

EXPECTED_PATHS = [
    "/api/stats", "/api/crawl", "/api/documents", "/api/documents/duplicates",
    "/api/documents/{doc_id}", "/api/documents/{doc_id}/thumbnail",
    "/api/documents/{doc_id}/file", "/api/documents/{doc_id}/open-folder",
    "/api/documents/{doc_id}/open", "/api/documents/{doc_id}/classify",
    "/api/documents/classify-batch", "/api/documents/{doc_id}/rescan",
    "/api/documents/rescan-errors", "/api/documents/rescan-no-text",
    "/api/documents/exclude-batch", "/api/documents/{doc_id}/restore",
    "/api/documents/{doc_id}/favorite", "/api/favorites",
    "/api/documents/{doc_id}/tags", "/api/documents/{doc_id}/tags/{tag_id}",
]

def test_all_document_routes_exist():
    openapi_paths = set(app.openapi()["paths"].keys())
    missing = [p for p in EXPECTED_PATHS if p not in openapi_paths]
    assert not missing, f"Fehlende Routen: {missing}"
```

Run → PASS vor dem Umbau (Sicherungsnetz), muss nach dem Umbau weiter PASSEN.

- [ ] **Step 3: Umbau.** `documents/router.py` vollständig lesen; Endpoints gemäß Zuordnungstabelle oben per Cut&Paste in die neuen Dateien verschieben (Imports mitnehmen, `router = APIRouter(prefix="/api", tags=["document-files"])` je Datei). Duplizierte „Dokument laden oder 404"-Blöcke durch `service.get_document_or_404` ersetzen:

```python
# documents/service.py
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.documents.models import Document


async def get_document_or_404(db: AsyncSession, doc_id: int) -> Document:
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc
```

`main.py`: `from app.documents.files_router import router as document_files_router` / `from app.documents.actions_router import router as document_actions_router` + zwei `app.include_router(...)`-Zeilen neben der bestehenden.

- [ ] **Step 4: Verifizieren** — API-Schnappschuss NACH dem Umbau erzeugen (Kommando aus Step 1, nach `api_after.json`) und diffen: **identische Pfadliste**. `pytest` grün. Frontend-Smoke: App starten, Detailseite öffnen, Thumbnail lädt, Tag hinzufügen, Favorit togglen.
- [ ] **Step 5: Commit** — `git add -A backend && git commit -m "refactor: documents-Router in Service + 3 fokussierte Router aufgeteilt (API unveraendert)"`

---

## Abschluss-Task 23: Gesamtverifikation + Messprotokoll finalisieren

- [ ] **Step 1:** Kompletter Testlauf: `cd backend && .venv\Scripts\python -m pytest -v` → grün. `cd frontend && npx eslint . && npx tsc -b` → 0 Fehler.
- [ ] **Step 2:** End-to-End-Smoke mit echten Daten: App via `start.bat` starten; Suche tippen (flüssig?), 100er-Seite blättern, Detailseite, Crawl eines kleinen Ordners, Batch-Klassifikation von 5 Dokumenten.
- [ ] **Step 3:** Messprotokoll `docs/superpowers/plans/messungen-2026-07.md` finalisieren: Baseline vs. Endzustand für alle Erfolgskriterien der Spec (Browse-Payload/-Zeit, Such-Zeit, Crawl-Durchsatz, Sekunden/Klassifikation, gewähltes Modell).
- [ ] **Step 4:** `STATE.md`/`STATUS.md` des Projekts aktualisieren (Milestone „Performance-Umbau" abgeschlossen). Commit: `git add -A && git commit -m "docs: Messprotokoll + Projektstatus nach Performance-Umbau"`
